import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { opportunitySignalRule, OpportunityHistoryUnavailable, typeKeyByOpportunityRole, type OpportunityCalculationResult } from "@/services/analysis-engines/opportunity-gap";
import { runOpportunityAnalysisPersisted } from "@/services/analysis-engines/opportunity-gap/adapters/run-service";
import { readOpportunityRun } from "@/services/analysis-engines/opportunity-gap/adapters/run-persistence";
import { replayOpportunityAnalysis } from "@/services/analysis-engines/opportunity-gap/adapters/replay-service";
import { opportunityDataset } from "../unit/support/opportunity-data-fixtures";
import { opportunityRequest } from "../unit/support/opportunity-gap-fixtures";

const enabled = process.env.OPPORTUNITY_ACCEPTANCE_DATABASE_TESTS === "1";
let instant: string;
const execution = (runId = `opportunity-m5-${randomUUID()}`) => ({
  runId, evaluatedAt: instant, createdAt: instant, environment: "test" as const,
  timing: { startedAt: instant, finishedAt: instant, durationMs: 0 },
});
let owner: DataCenterActor; let foreign: DataCenterActor;
let request: ReturnType<typeof opportunityRequest>;
let runs: OpportunityCalculationResult[] = [];
const dataCenterCounts = async () => ({
  sources: await db.dataCenterSource.count(), items: await db.dataCenterItem.count(), versions: await db.dataCenterVersion.count(),
  types: await db.dataCenterType.count(), usages: await db.dataCenterUsage.count(), audits: await db.auditLog.count(),
  events: await db.dataCenterEvent.count(), quality: await db.dataCenterQualityAssessment.count(),
});
let baseline: Awaited<ReturnType<typeof dataCenterCounts>>;
async function batch<T>(count: number, concurrency: number, task: (index: number) => Promise<T>) {
  const values: T[] = []; const durations: number[] = []; let cursor = 0;
  const start = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < count) {
      const index = cursor++; const begin = performance.now();
      values[index] = await task(index); durations.push(performance.now() - begin);
    }
  }));
  const totalMs = performance.now() - start; durations.sort((a, b) => a - b);
  return { values, measurements: { count, concurrency, totalMs, operationsPerSecond: count * 1000 / totalMs,
    p50Ms: durations[Math.ceil(count * 0.5) - 1]!, p95Ms: durations[Math.ceil(count * 0.95) - 1]!, maxMs: durations.at(-1)! } };
}
describe.skipIf(!enabled)("Opportunity M5 committed acceptance, synthetic owned scratch database only", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!/^se_opportunity_m5_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Opportunity M5 acceptance requires its own disposable migrated database");
    const user = await db.user.create({ data: { email: `opportunity-m5-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const admin: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
    for (const key of Object.values(typeKeyByOpportunityRole)) if (!await db.dataCenterType.findUnique({ where: { key } })) {
      await registerDataCenterType({ key, label: "Synthetic Opportunity acceptance only", layer: "DATA", requiresIndependentReview: false }, admin);
    }
    const reader = await db.user.create({ data: { email: `opportunity-m5-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const other = await db.user.create({ data: { email: `opportunity-m5-foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
    owner = { id: reader.id, kind: "HUMAN", systemRole: "USER" }; foreign = { id: other.id, kind: "HUMAN", systemRole: "USER" };
    const source = await createDataCenterSource({
      name: `Synthetic Opportunity final ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic authority",
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic acceptance; credit required",
      allowExport: false, attribution: "Synthetic fixture, NOT real Opportunity data", attributionRequired: true, freshnessDays: 365,
    }, admin);
    request = opportunityRequest(); request.analyses = ["DATA_COVERAGE", "DEMAND_SUPPLY_GAP", "BENCHMARK_GAP", "OPPORTUNITY_SIGNALS"];
    request.benchmarkPolicy = { id: "test-benchmark", version: "1" }; request.signalPolicy = { ...opportunitySignalRule }; request.data.roles = [];
    for (const role of ["need.observations", "supply.capacity", "provision.observations", "benchmarks.targets"] as const) {
      const content = opportunityDataset(role); content.sourceId = source.id;
      if (role === "benchmarks.targets") content.rows[0]!.value = 100;
      const item = await createDataCenterItem({
        sourceId: source.id, title: "Synthetic Opportunity committed fixture", typeKey: typeKeyByOpportunityRole[role], layer: "DATA",
        content: JSON.stringify(content), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-01T00:00:00.000Z",
        provenance: [{ kind: "DOCUMENT", reference: "fixture:opportunity-m5", label: "Synthetic, not production evidence" }],
        coverage: { countryCodes: ["SA"], regionCodes: [] },
      }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "IN_REVIEW", reason: "Synthetic review" }, admin);
      await reviewDataCenterItem({ itemId: item.id, decision: "APPROVED", notes: "Synthetic acceptance only" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "APPROVED", reason: "Synthetic approval" }, admin);
      await transitionDataCenterItem({ itemId: item.id, status: "PUBLISHED", reason: "Synthetic publication" }, admin);
      request.data.roles.push({ role, versionId: item.version.id, checksum: item.version.checksum });
    }
    instant = new Date(Math.max(Date.now(), Date.parse("2026-10-22T09:58:00.000Z"))).toISOString();
    baseline = await dataCenterCounts();
  }, 60_000);
  afterAll(async () => { if (enabled) await db.$disconnect(); });

  it("commits eight full-source runs at concurrency four with exact arithmetic, inputs and hashes", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(8, 4, () => runOpportunityAnalysisPersisted(request, owner, execution()));
    runs = values;
    expect(new Set(values.map((result) => result.runId)).size).toBe(8);
    for (const result of values) {
      expect(result.determinism).toEqual(values[0]!.determinism);
      const metrics = Object.fromEntries(result.results[0]!.metrics.map((metric) => [metric.key, metric.value]));
      expect(metrics["current.demand_supply_gap"]).toBe(40); expect(metrics["current.benchmark_gap"]).toBe(-40);
      expect(metrics["current.benchmark_gap.shortfall"]).toBe(40); expect(metrics["signal.benchmark_gap"]).toBe(true);
      expect(result.inputs).toHaveLength(4); expect(result.rights.allowExport).toBe(false);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect((await readOpportunityRun(result.runId, owner)).result).toEqual(result);
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 8);
    expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 32);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`OPPORTUNITY_M5_COMMITTED_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("replays sixteen committed results at concurrency four without writes or live discovery", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(16, 4, (index) => replayOpportunityAnalysis(runs[index % runs.length]!.runId, owner));
    values.forEach((result, index) => expect(result).toEqual(runs[index % runs.length]));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`OPPORTUNITY_M5_REPLAY_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("allows one winner for four duplicate-ID racers without orphan or overwritten inputs", async () => {
    const shared = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => runOpportunityAnalysisPersisted(request, owner, shared)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected"); expect(rejected).toHaveLength(3);
    rejected.forEach((outcome) => expect(outcome.reason).toMatchObject({ code: "P2002" }));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 4);
    expect((await replayOpportunityAnalysis(shared.runId, owner)).determinism).toEqual(runs[0]!.determinism);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("rolls back child-insert failure in a real transaction then retries the same unsaved ID successfully", async () => {
    const failed = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    if (!/^opportunity-m5-[a-f0-9-]{36}$/.test(failed.runId)) throw new Error("Invalid owned synthetic failure identifier");
    await db.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ADD CONSTRAINT "opportunity_m5_reject_owned_input" CHECK ("runId" <> '${failed.runId}')`);
    try {
      await expect(runOpportunityAnalysisPersisted(request, owner, failed)).rejects.toThrow(/opportunity_m5_reject_owned_input/);
      expect(await db.analysisEngineRun.findUnique({ where: { runId: failed.runId } })).toBeNull();
      expect(await db.analysisEngineRunInput.count({ where: { runId: failed.runId } })).toBe(0);
      expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
      expect(await dataCenterCounts()).toEqual(baseline);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DROP CONSTRAINT "opportunity_m5_reject_owned_input"'); }
    const recovered = await runOpportunityAnalysisPersisted(request, owner, failed);
    expect(await replayOpportunityAnalysis(recovered.runId, owner)).toEqual(recovered);
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 4);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("returns identical foreign/missing history errors during concurrent lookup/replay", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const ids = [runs[0]!.runId, "opportunity-m5-absent"];
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => index % 2
      ? replayOpportunityAnalysis(ids[Math.floor(index / 2) % 2]!, foreign) : readOpportunityRun(ids[Math.floor(index / 2) % 2]!, foreign)));
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toEqual(new OpportunityHistoryUnavailable());
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
});
