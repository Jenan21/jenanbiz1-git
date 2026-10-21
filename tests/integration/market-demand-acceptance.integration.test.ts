import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { proposedMarketTypeKeys, type MarketM3Result } from "@/services/analysis-engines/market-demand";
import { runMarketAnalysisPersisted } from "@/services/analysis-engines/market-demand/adapters/run-service";
import { replayMarketAnalysis } from "@/services/analysis-engines/market-demand/adapters/replay-service";
import { MarketHistoryUnavailable } from "@/services/analysis-engines/market-demand/adapters/historical-data-center";
import { marketDataset } from "../unit/support/market-data-fixtures";
import { marketRequest } from "../unit/support/market-demand-fixtures";

const enabled = process.env.MARKET_ACCEPTANCE_DATABASE_TESTS === "1";
let instant: string;
const execution = (runId = `market-m5-${randomUUID()}`) => ({
  runId, evaluatedAt: instant, createdAt: instant, environment: "test" as const,
  timing: { startedAt: instant, finishedAt: instant, durationMs: 0 },
});
let owner: DataCenterActor;
let foreign: DataCenterActor;
let request: ReturnType<typeof marketRequest>;
let runs: MarketM3Result[] = [];
const dataCenterCounts = async () => ({
  sources: await db.dataCenterSource.count(), items: await db.dataCenterItem.count(), versions: await db.dataCenterVersion.count(),
  types: await db.dataCenterType.count(), usages: await db.dataCenterUsage.count(), audits: await db.auditLog.count(),
  events: await db.dataCenterEvent.count(), quality: await db.dataCenterQualityAssessment.count(),
});
let baseline: Awaited<ReturnType<typeof dataCenterCounts>>;
async function batch<T>(count: number, concurrency: number, task: (index: number) => Promise<T>) {
  const values: T[] = [];
  const durations: number[] = [];
  let cursor = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < count) {
      const index = cursor++; const start = performance.now();
      values[index] = await task(index);
      durations.push(performance.now() - start);
    }
  }));
  const totalMs = performance.now() - started;
  durations.sort((a, b) => a - b);
  return { values, measurements: { count, concurrency, totalMs, operationsPerSecond: count * 1000 / totalMs,
    p50Ms: durations[Math.ceil(count * 0.5) - 1]!, p95Ms: durations[Math.ceil(count * 0.95) - 1]!, maxMs: durations.at(-1)! } };
}

describe.skipIf(!enabled)("Market M5 committed concurrency/load acceptance (synthetic, owned fresh database only)", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!/^se_market_m5_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("M5 acceptance requires its own disposable migrated database");
    const adminUser = await db.user.create({ data: { email: `m5-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const admin: DataCenterActor = { id: adminUser.id, kind: "HUMAN", systemRole: "ADMIN" };
    for (const key of proposedMarketTypeKeys) if (!await db.dataCenterType.findUnique({ where: { key } })) {
      await registerDataCenterType({ key, label: "Synthetic M5 acceptance fixture only", layer: "DATA", requiresIndependentReview: false }, admin);
    }
    const user = await db.user.create({ data: { email: `m5-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const other = await db.user.create({ data: { email: `m5-foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
    owner = { id: user.id, kind: "HUMAN", systemRole: "USER" };
    foreign = { id: other.id, kind: "HUMAN", systemRole: "USER" };
    const source = await createDataCenterSource({
      name: `Synthetic M5 ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic authority", ownership: "THIRD_PARTY",
      license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic acceptance only; credit required",
      allowExport: false, attribution: "Synthetic fixture, NOT Real Demand Data", attributionRequired: true, freshnessDays: 365,
    }, admin);
    const data: NonNullable<ReturnType<typeof marketRequest>["data"]> = { roles: {} };
    for (const role of ["demand.observations", "dimensions.dictionary"] as const) {
      const item = await createDataCenterItem({
        sourceId: source.id, title: "Synthetic M5 committed fixture", typeKey: role === "demand.observations" ? "market-demand-observations" : "market-dimensions",
        layer: "DATA", content: JSON.stringify(marketDataset(role)), evidenceStatus: "VERIFIED",
        sourcePublishedAt: new Date(Date.now() - 86_400_000).toISOString(),
        provenance: [{ kind: "DOCUMENT", reference: "fixture:market-m5", label: "Synthetic, not production evidence" }],
        coverage: { countryCodes: ["SA"], regionCodes: [] },
      }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "IN_REVIEW", reason: "Synthetic review" }, admin);
      await reviewDataCenterItem({ itemId: item.id, decision: "APPROVED", notes: "Synthetic acceptance only" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "APPROVED", reason: "Synthetic approval" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "PUBLISHED", reason: "Synthetic publication" }, admin);
      data.roles[role] = [{ source: "DATA_CENTER", versionId: item.version.id, expectedChecksum: item.version.checksum }];
    }
    request = marketRequest({ data });
    instant = new Date().toISOString();
    baseline = await dataCenterCounts();
  }, 60_000);
  afterAll(async () => { if (enabled) await db.$disconnect(); });

  it("commits eight independent concurrent runs without lost inputs, cross-run leakage or changed deterministic hashes", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(8, 4, () => runMarketAnalysisPersisted(request, owner, execution()));
    runs = values;
    expect(new Set(values.map((value) => value.runId)).size).toBe(8);
    for (const value of values) {
      expect(value.determinism).toEqual(values[0]!.determinism);
      expect(value.outcomes.map((outcome) => outcome.value)).toEqual([100, 80]);
      expect(value.inputs).toHaveLength(2);
      expect(value.rights.allowExport).toBe(false);
      expect(value.sourceEvidence.every((source) => source.reference?.rights.attribution.required)).toBe(true);
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 8);
    expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 16);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000);
    expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`MARKET_M5_COMMITTED_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);

  it("replays sixteen concurrent exact histories with identical complete results and zero writes", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(16, 4, (index) => replayMarketAnalysis(runs[index % runs.length]!.runId, owner));
    values.forEach((value, index) => expect(value).toEqual(runs[index % runs.length]));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns);
    expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000);
    expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`MARKET_M5_REPLAY_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);

  it("allows exactly one winner for four racing duplicate ids; losers explicitly fail without orphan inputs", async () => {
    const shared = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => runMarketAnalysisPersisted(request, owner, shared)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(3);
    rejected.forEach((result) => expect(result.reason).toMatchObject({ code: "P2002" }));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1);
    expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 2);
    expect((await replayMarketAnalysis(shared.runId, owner)).determinism).toEqual(runs[0]!.determinism);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);

  it("rolls back a real nested input insertion failure, leaving no committed parent, child or Data Center writes", async () => {
    const failed = execution();
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    await db.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ADD CONSTRAINT "market_m5_reject_owned_input" CHECK ("runId" <> '${failed.runId}')`);
    try {
      await expect(runMarketAnalysisPersisted(request, owner, failed)).rejects.toThrow(/market_m5_reject_owned_input/);
      expect(await db.analysisEngineRun.findUnique({ where: { runId: failed.runId } })).toBeNull();
      expect(await db.analysisEngineRunInput.count({ where: { runId: failed.runId } })).toBe(0);
      expect(await db.analysisEngineRun.count()).toBe(beforeRuns);
      expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
      expect(await dataCenterCounts()).toEqual(baseline);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DROP CONSTRAINT "market_m5_reject_owned_input"'); }
  }, 60_000);

  it("does not reveal hidden run existence under concurrent unauthorized lookups", async () => {
    const ids = [runs[0]!.runId, "market-m5-does-not-exist"];
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => replayMarketAnalysis(ids[index % 2]!, foreign)));
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toEqual(new MarketHistoryUnavailable());
    }
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
});
