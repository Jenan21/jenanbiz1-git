import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { bindOperationalDataset, OPERATIONAL_MODEL_TYPE_KEY, OperationalHistoryUnavailable, type OperationalCalculationResult, type OperationalPreparationRequest } from "@/services/analysis-engines/operational-feasibility";
import { runOperationalAnalysisPersisted } from "@/services/analysis-engines/operational-feasibility/adapters/run-service";
import { readOperationalRun } from "@/services/analysis-engines/operational-feasibility/adapters/run-persistence";
import { replayOperationalAnalysis } from "@/services/analysis-engines/operational-feasibility/adapters/replay-service";
import { operationalAcceptanceDataset } from "../unit/support/operational-acceptance-fixtures";
import { operationalReference } from "../unit/support/operational-data-fixtures";

const enabled = process.env.OPERATIONAL_ACCEPTANCE_DATABASE_TESTS === "1";
let instant: string; let owner: DataCenterActor; let foreign: DataCenterActor; let request: OperationalPreparationRequest;
let runs: OperationalCalculationResult[] = [];
const execution = () => ({
  runId: `operational-m5-${randomUUID()}`, evaluatedAt: instant, createdAt: instant, environment: "test" as const,
  timing: { startedAt: instant, finishedAt: instant, durationMs: 0 },
});
const dataCenterCounts = async () => ({
  sources: await db.dataCenterSource.count(), items: await db.dataCenterItem.count(), versions: await db.dataCenterVersion.count(),
  types: await db.dataCenterType.count(), usages: await db.dataCenterUsage.count(), audits: await db.auditLog.count(),
  events: await db.dataCenterEvent.count(), quality: await db.dataCenterQualityAssessment.count(),
});
let baseline: Awaited<ReturnType<typeof dataCenterCounts>>;
async function batch<T>(count: number, concurrency: number, task: (index: number) => Promise<T>) {
  const values: T[] = []; const durations: number[] = []; let cursor = 0; const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < count) {
      const index = cursor++; const begin = performance.now();
      values[index] = await task(index); durations.push(performance.now() - begin);
    }
  }));
  const totalMs = performance.now() - start; durations.sort((a, b) => a - b);
  return { values, measurements: {
    count, concurrency, totalMs, operationsPerSecond: count * 1000 / totalMs,
    p50Ms: durations[Math.ceil(count * 0.5) - 1]!, p95Ms: durations[Math.ceil(count * 0.95) - 1]!, maxMs: durations.at(-1)!,
  } };
}
describe.skipIf(!enabled)("Operational M5 committed technical acceptance on owned scratch PostgreSQL only", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!/^se_operational_m5_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Operational M5 requires its own disposable migrated database");
    const adminRow = await db.user.create({ data: { email: `operational-m5-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const admin: DataCenterActor = { id: adminRow.id, kind: "HUMAN", systemRole: "ADMIN" };
    if (!await db.dataCenterType.findUnique({ where: { key: OPERATIONAL_MODEL_TYPE_KEY } })) {
      await registerDataCenterType({ key: OPERATIONAL_MODEL_TYPE_KEY, label: "Synthetic Operational acceptance", layer: "DATA", requiresIndependentReview: false }, admin);
    }
    const reader = await db.user.create({ data: { email: `operational-m5-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const other = await db.user.create({ data: { email: `operational-m5-foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
    owner = { id: reader.id, kind: "HUMAN", systemRole: "USER" }; foreign = { id: other.id, kind: "HUMAN", systemRole: "USER" };
    const source = await createDataCenterSource({
      name: `Synthetic Operational final ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic technical acceptance only",
      allowExport: false, attribution: "Synthetic, NOT real operational data", attributionRequired: true, freshnessDays: 365,
    }, admin);
    const dataset = operationalAcceptanceDataset(); dataset.sourceId = source.id;
    const item = await createDataCenterItem({
      sourceId: source.id, title: "Synthetic Operational technical acceptance", typeKey: OPERATIONAL_MODEL_TYPE_KEY, layer: "DATA",
      content: JSON.stringify(dataset), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-03T00:00:00.000Z",
      provenance: [{ kind: "DOCUMENT", reference: "fixture:operational-m5", label: "Synthetic, not production evidence" }],
      coverage: { countryCodes: ["SA"], regionCodes: [] },
    }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "IN_REVIEW", reason: "Synthetic review" }, admin);
    await reviewDataCenterItem({ itemId: item.id, decision: "APPROVED", notes: "Synthetic technical acceptance only" }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "APPROVED", reason: "Synthetic approval" }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "PUBLISHED", reason: "Synthetic publication" }, admin);
    instant = new Date(Math.max(Date.now(), Date.parse("2026-10-23T00:00:00.000Z"))).toISOString();
    const reference = operationalReference(); reference.source.sourceId = source.id;
    reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
    request = bindOperationalDataset(dataset, reference, instant);
    baseline = await dataCenterCounts();
  }, 60_000);
  afterAll(async () => { if (enabled) await db.$disconnect(); });
  it("commits eight full operational runs at concurrency four without Data Center writes", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(8, 4, () => runOperationalAnalysisPersisted(request, owner, execution()));
    runs = values;
    expect(new Set(runs.map((r) => r.runId)).size).toBe(8);
    for (const result of values) {
      expect(result.status).toBe("COMPLETED"); expect(result.determinism).toEqual(values[0]!.determinism);
      expect(result.metrics).toHaveLength(135); expect(result.variants).toHaveLength(5);
      const metrics = Object.fromEntries(result.metrics.filter((m) => m.variant === "base").map((m) => [`${m.key}:${m.entityId}`, m.value]));
      expect(metrics).toMatchObject({ "capacity_gap:service": "20", "load_ratio:stage-2": "111.111111",
        "labor_requirement:operator": "30", "inventory_projected_balance:material": "-10", "observed_yield:service": "92" });
      expect(result.inputs).toHaveLength(1); expect(result.rights.allowExport).toBe(false);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect((await readOperationalRun(result.runId, owner)).result).toEqual(result);
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 8); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 8);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`OPERATIONAL_M5_COMMITTED_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("replays sixteen committed full results at concurrency four without writes", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(16, 4, (index) => replayOperationalAnalysis(runs[index % runs.length]!.runId, owner));
    values.forEach((result, index) => expect(result).toEqual(runs[index % runs.length]));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`OPERATIONAL_M5_REPLAY_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("allows one duplicate-ID winner among four racers without overwrites or orphan inputs", async () => {
    const shared = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => runOperationalAnalysisPersisted(request, owner, shared)));
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((o) => o.status === "rejected"); expect(rejected).toHaveLength(3);
    rejected.forEach((o) => expect(o.reason).toMatchObject({ code: "P2002" }));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 1);
    expect((await replayOperationalAnalysis(shared.runId, owner)).determinism).toEqual(runs[0]!.determinism);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("recovers from a real nested-input rollback and retries the same unsaved ID", async () => {
    const failed = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    if (!/^operational-m5-[a-f0-9-]{36}$/.test(failed.runId)) throw new Error("Invalid owned scratch failure ID");
    await db.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ADD CONSTRAINT "operational_m5_reject_owned_input" CHECK ("runId" <> '${failed.runId}')`);
    try {
      await expect(runOperationalAnalysisPersisted(request, owner, failed)).rejects.toThrow(/operational_m5_reject_owned_input/);
      expect(await db.analysisEngineRun.findUnique({ where: { runId: failed.runId } })).toBeNull();
      expect(await db.analysisEngineRunInput.count({ where: { runId: failed.runId } })).toBe(0);
      expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
      expect(await dataCenterCounts()).toEqual(baseline);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DROP CONSTRAINT "operational_m5_reject_owned_input"'); }
    const result = await runOperationalAnalysisPersisted(request, owner, failed);
    expect(await replayOperationalAnalysis(result.runId, owner)).toEqual(result);
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 1);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("keeps concurrent foreign/missing reads and replays indistinguishable", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const ids = [runs[0]!.runId, "operational-m5-absent"];
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => index % 2
      ? replayOperationalAnalysis(ids[Math.floor(index / 2) % 2]!, foreign) : readOperationalRun(ids[Math.floor(index / 2) % 2]!, foreign)));
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toEqual(new OperationalHistoryUnavailable());
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
});
