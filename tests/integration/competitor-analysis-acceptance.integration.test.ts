import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { typeKeyByCompetitorRole, type CompetitorAnalyticsResult } from "@/services/analysis-engines/competitor-analysis";
import { runCompetitorAnalysisPersisted } from "@/services/analysis-engines/competitor-analysis/adapters/run-service";
import { readCompetitorRun } from "@/services/analysis-engines/competitor-analysis/adapters/run-persistence";
import { replayCompetitorAnalysis } from "@/services/analysis-engines/competitor-analysis/adapters/replay-service";
import { CompetitorHistoryUnavailable } from "@/services/analysis-engines/competitor-analysis/adapters/historical-data-center";
import { competitorDataset } from "../unit/support/competitor-data-fixtures";
import { competitorInstant, competitorRequest } from "../unit/support/competitor-analysis-fixtures";

const enabled = process.env.COMPETITOR_ACCEPTANCE_DATABASE_TESTS === "1";
let instant: string;
const execution = (runId = `competitor-m5-${randomUUID()}`) => ({
  runId, evaluatedAt: instant, createdAt: instant, environment: "test" as const,
  timing: { startedAt: instant, finishedAt: instant, durationMs: 0 },
});
let owner: DataCenterActor;
let foreign: DataCenterActor;
let request: ReturnType<typeof competitorRequest>;
let runs: CompetitorAnalyticsResult[] = [];
const dataCenterCounts = async () => ({
  sources: await db.dataCenterSource.count(), items: await db.dataCenterItem.count(), versions: await db.dataCenterVersion.count(),
  types: await db.dataCenterType.count(), usages: await db.dataCenterUsage.count(), audits: await db.auditLog.count(),
  events: await db.dataCenterEvent.count(), quality: await db.dataCenterQualityAssessment.count(),
});
let baseline: Awaited<ReturnType<typeof dataCenterCounts>>;
async function batch<T>(count: number, concurrency: number, task: (index: number) => Promise<T>) {
  const values: T[] = []; const durations: number[] = []; let cursor = 0;
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < count) {
      const index = cursor++; const start = performance.now();
      values[index] = await task(index); durations.push(performance.now() - start);
    }
  }));
  const totalMs = performance.now() - started; durations.sort((a, b) => a - b);
  return { values, measurements: { count, concurrency, totalMs, operationsPerSecond: count * 1000 / totalMs,
    p50Ms: durations[Math.ceil(count * 0.5) - 1]!, p95Ms: durations[Math.ceil(count * 0.95) - 1]!, maxMs: durations.at(-1)! } };
}
const total = (result: CompetitorAnalyticsResult, countingUnit: string) => result.results.flatMap((section) => section.metrics)
  .find((metric) => metric.operation === "COUNT" && metric.countBasis === "SCOPED_TOTAL" && metric.countingUnit === countingUnit);

describe.skipIf(!enabled)("Competitor M5 committed acceptance (synthetic, owned fresh database only)", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!/^se_competitor_m5_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Competitor M5 acceptance requires its own disposable migrated database");
    const user = await db.user.create({ data: { email: `competitor-m5-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const admin: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
    for (const key of Object.values(typeKeyByCompetitorRole)) if (!await db.dataCenterType.findUnique({ where: { key } })) {
      await registerDataCenterType({ key, label: "Synthetic Competitor final acceptance only", layer: "DATA", requiresIndependentReview: false }, admin);
    }
    const reader = await db.user.create({ data: { email: `competitor-m5-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const other = await db.user.create({ data: { email: `competitor-m5-foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
    owner = { id: reader.id, kind: "HUMAN", systemRole: "USER" };
    foreign = { id: other.id, kind: "HUMAN", systemRole: "USER" };
    const source = await createDataCenterSource({
      name: `Synthetic Competitor final ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM",
      owner: "Synthetic authority", ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE",
      usagePolicy: "Synthetic acceptance only; attribution required", allowExport: false,
      attribution: "Synthetic fixture, NOT Real Competitor Data", attributionRequired: true, freshnessDays: 365,
    }, admin);
    request = competitorRequest(); request.analyses = ["COUNTS", "IDENTITY_MATCHING", "DISTRIBUTION"]; request.data.roles = {};
    for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
      const content = competitorDataset(role, 15); content.sourceId = source.id;
      const item = await createDataCenterItem({
        sourceId: source.id, title: "Synthetic Competitor committed fixture", typeKey: typeKeyByCompetitorRole[role], layer: "DATA",
        content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-01T00:00:00.000Z",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:competitor-m5", label: "Synthetic, not production evidence" }],
        coverage: { countryCodes: ["SA"], regionCodes: [] },
      }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "IN_REVIEW", reason: "Synthetic review" }, admin);
      await reviewDataCenterItem({ itemId: item.id, decision: "APPROVED", notes: "Synthetic acceptance only" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "APPROVED", reason: "Synthetic approval" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "PUBLISHED", reason: "Synthetic publication" }, admin);
      request.data.roles[role] = [{ versionId: item.version.id, expectedChecksum: item.version.checksum }];
    }
    instant = new Date(Math.max(Date.now(), Date.parse(competitorInstant))).toISOString();
    baseline = await dataCenterCounts();
  }, 60_000);
  afterAll(async () => { if (enabled) await db.$disconnect(); });

  it("commits eight concurrent full-source runs without input loss, identity leakage or hash changes", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(8, 4, () => runCompetitorAnalysisPersisted(request, owner, execution()));
    runs = values; expect(new Set(values.map((result) => result.runId)).size).toBe(8);
    for (const result of values) {
      expect(result.determinism).toEqual(values[0]!.determinism);
      expect(total(result, "UNIQUE_COMPETITOR_ENTITIES")?.value).toBe(1);
      expect(total(result, "COMPETITOR_LOCATIONS")?.value).toBe(15);
      expect(result.inputs).toHaveLength(4); expect(result.inventory).toHaveLength(15);
      expect(result.rights.allowExport).toBe(false); expect(result.attribution.every((entry) => entry.required)).toBe(true);
      expect((await readCompetitorRun(result.runId, owner)).result).toEqual(result);
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 8);
    expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 32);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`COMPETITOR_M5_COMMITTED_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);

  it("replays sixteen concurrent committed histories with identical full results/hashes and zero writes", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(16, 4, (index) => replayCompetitorAnalysis(runs[index % runs.length]!.runId, owner));
    values.forEach((result, index) => expect(result).toEqual(runs[index % runs.length]));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`COMPETITOR_M5_REPLAY_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);

  it("allows one winner for four racing duplicate IDs and explicitly fails losers without orphan inputs", async () => {
    const shared = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => runCompetitorAnalysisPersisted(request, owner, shared)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected"); expect(rejected).toHaveLength(3);
    rejected.forEach((outcome) => expect(outcome.reason).toMatchObject({ code: "P2002" }));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 4);
    expect((await replayCompetitorAnalysis(shared.runId, owner)).determinism).toEqual(runs[0]!.determinism);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);

  it("rolls back real child insertion failure then recovers by retrying the same unsaved ID", async () => {
    const failed = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    await db.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ADD CONSTRAINT "competitor_m5_reject_owned_input" CHECK ("runId" <> '${failed.runId}')`);
    try {
      await expect(runCompetitorAnalysisPersisted(request, owner, failed)).rejects.toThrow(/competitor_m5_reject_owned_input/);
      expect(await db.analysisEngineRun.findUnique({ where: { runId: failed.runId } })).toBeNull();
      expect(await db.analysisEngineRunInput.count({ where: { runId: failed.runId } })).toBe(0);
      expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
      expect(await dataCenterCounts()).toEqual(baseline);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DROP CONSTRAINT "competitor_m5_reject_owned_input"'); }
    const recovered = await runCompetitorAnalysisPersisted(request, owner, failed);
    expect(await replayCompetitorAnalysis(recovered.runId, owner)).toEqual(recovered);
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 4);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);

  it("reveals neither foreign run existence nor cached source metadata under concurrent lookups", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const ids = [runs[0]!.runId, "competitor-m5-not-existing"];
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) =>
      index % 2 ? replayCompetitorAnalysis(ids[Math.floor(index / 2) % 2]!, foreign) : readCompetitorRun(ids[Math.floor(index / 2) % 2]!, foreign)));
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toEqual(new CompetitorHistoryUnavailable());
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
});
