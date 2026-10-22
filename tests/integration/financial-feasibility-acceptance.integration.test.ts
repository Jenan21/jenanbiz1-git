import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItem, createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { bindFinancialDataset, FINANCIAL_MODEL_TYPE_KEY, FinancialHistoryUnavailable, type FinancialCalculationResult, type FinancialRequest } from "@/services/analysis-engines/financial-feasibility";
import { runFinancialAnalysisPersisted } from "@/services/analysis-engines/financial-feasibility/adapters/run-service";
import { readFinancialRun } from "@/services/analysis-engines/financial-feasibility/adapters/run-persistence";
import { replayFinancialAnalysis } from "@/services/analysis-engines/financial-feasibility/adapters/replay-service";
import { financialDataset, financialReference } from "../unit/support/financial-data-fixtures";

const enabled = process.env.FINANCIAL_ACCEPTANCE_DATABASE_TESTS === "1";
let instant: string; let owner: DataCenterActor; let foreign: DataCenterActor; let request: FinancialRequest;
let runs: FinancialCalculationResult[] = [];
const execution = () => ({
  runId: `financial-m5-${randomUUID()}`, evaluatedAt: instant, createdAt: instant, environment: "test" as const,
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
describe.skipIf(!enabled)("Financial M5 committed acceptance on owned scratch PostgreSQL only", () => {
  beforeAll(async () => {
    const identity = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (!/^se_financial_m5_[a-f0-9]{12}$/.test(identity[0]?.name ?? "")) throw new Error("Financial M5 requires its own disposable migrated database");
    const adminRow = await db.user.create({ data: { email: `financial-m5-admin-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const admin: DataCenterActor = { id: adminRow.id, kind: "HUMAN", systemRole: "ADMIN" };
    if (!await db.dataCenterType.findUnique({ where: { key: FINANCIAL_MODEL_TYPE_KEY } })) {
      await registerDataCenterType({ key: FINANCIAL_MODEL_TYPE_KEY, label: "Synthetic Financial acceptance only", layer: "DATA", requiresIndependentReview: false }, admin);
    }
    const reader = await db.user.create({ data: { email: `financial-m5-owner-${randomUUID()}@example.test`, status: "ACTIVE" } });
    const other = await db.user.create({ data: { email: `financial-m5-foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
    owner = { id: reader.id, kind: "HUMAN", systemRole: "USER" }; foreign = { id: other.id, kind: "HUMAN", systemRole: "USER" };
    const source = await createDataCenterSource({
      name: `Synthetic Financial final ${randomUUID()}`, kind: "OFFICIAL", scope: "PLATFORM", owner: "Synthetic owner",
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic acceptance only",
      allowExport: false, attribution: "Synthetic, NOT real financial data", attributionRequired: true, freshnessDays: 365,
    }, admin);
    const dataset = financialDataset(); dataset.sourceId = source.id;
    dataset.model.assumptions.find((entry) => entry.id === "collections")!.value = "150";
    dataset.model.analyses.push("SCENARIOS", "SENSITIVITY");
    const disclosure = {
      author: "Synthetic owner", declaredAt: "2026-10-01T00:00:00.000Z", rationale: "Explicit acceptance fixture",
      evidence: ["model-record"],
    };
    dataset.model.scenarios = [{
      ...disclosure, id: "price-case", label: "Declared synthetic price", overrides: [{ assumptionId: "price", value: "16" }],
    }];
    dataset.model.sensitivity = [{
      ...disclosure, id: "price-band", assumptionId: "price", low: "9", base: "12", high: "15", targets: ["BREAK_EVEN", "REVENUE"],
    }];
    const item = await createDataCenterItem({
      sourceId: source.id, title: "Synthetic Financial final acceptance", typeKey: FINANCIAL_MODEL_TYPE_KEY, layer: "DATA",
      content: JSON.stringify(dataset), evidenceStatus: "VERIFIED", sourcePublishedAt: "2026-10-02T00:00:00.000Z",
      provenance: [{ kind: "DOCUMENT", reference: "fixture:financial-m5", label: "Synthetic, not production evidence" }],
      coverage: { countryCodes: ["SA"], regionCodes: [] },
    }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "IN_REVIEW", reason: "Synthetic review" }, admin);
    await reviewDataCenterItem({ itemId: item.id, decision: "APPROVED", notes: "Synthetic acceptance only" }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "APPROVED", reason: "Synthetic approval" }, admin);
    await transitionDataCenterItem({ itemId: item.id, status: "PUBLISHED", reason: "Synthetic publication" }, admin);
    instant = new Date(Math.max(Date.now(), Date.parse("2026-10-22T12:00:00.000Z"))).toISOString();
    const reference = financialReference(); reference.source.sourceId = source.id;
    reference.version.versionId = item.version.id; reference.version.checksum.value = item.version.checksum;
    request = bindFinancialDataset(dataset, reference, instant);
    baseline = await dataCenterCounts();
  }, 60_000);
  afterAll(async () => { if (enabled) await db.$disconnect(); });
  it("commits eight complete financial runs at concurrency four without Data Center writes", async () => {
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(8, 4, () => runFinancialAnalysisPersisted(request, owner, execution()));
    runs = values;
    expect(new Set(runs.map((result) => result.runId)).size).toBe(8);
    for (const result of values) {
      expect(result.status).toBe("COMPLETED"); expect(result.determinism).toEqual(values[0]!.determinism);
      const metrics = Object.fromEntries(result.metrics.map((entry) => [entry.key, entry.value]));
      expect(metrics).toMatchObject({ "npv.project": "8.91", "irr.per_period": "10.000000", "payback.periods": "1", "cash_requirement.amount": "85.00" });
      expect(result.inputs).toHaveLength(1); expect(result.scenarios).toHaveLength(1); expect(result.sensitivities).toHaveLength(2);
      expect(result.rights.allowExport).toBe(false); expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect((await readFinancialRun(result.runId, owner)).result).toEqual(result);
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 8); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 8);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`FINANCIAL_M5_COMMITTED_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("replays sixteen committed financial results at concurrency four without writes", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const { values, measurements } = await batch(16, 4, (index) => replayFinancialAnalysis(runs[index % runs.length]!.runId, owner));
    values.forEach((result, index) => expect(result).toEqual(runs[index % runs.length]));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
    expect(measurements.maxMs).toBeLessThan(15_000); expect(measurements.totalMs).toBeLessThan(30_000);
    console.log(`FINANCIAL_M5_REPLAY_LOAD=${JSON.stringify(measurements)}`);
  }, 60_000);
  it("allows one duplicate-ID winner among four racers without overwrites or orphan inputs", async () => {
    const shared = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => runFinancialAnalysisPersisted(request, owner, shared)));
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected"); expect(rejected).toHaveLength(3);
    rejected.forEach((outcome) => expect(outcome.reason).toMatchObject({ code: "P2002" }));
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 1);
    expect((await replayFinancialAnalysis(shared.runId, owner)).determinism).toEqual(runs[0]!.determinism);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("recovers from a real nested-input rollback and retries the same unsaved ID", async () => {
    const failed = execution(); const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    if (!/^financial-m5-[a-f0-9-]{36}$/.test(failed.runId)) throw new Error("Invalid owned scratch failure ID");
    await db.$executeRawUnsafe(`ALTER TABLE "AnalysisEngineRunInput" ADD CONSTRAINT "financial_m5_reject_owned_input" CHECK ("runId" <> '${failed.runId}')`);
    try {
      await expect(runFinancialAnalysisPersisted(request, owner, failed)).rejects.toThrow(/financial_m5_reject_owned_input/);
      expect(await db.analysisEngineRun.findUnique({ where: { runId: failed.runId } })).toBeNull();
      expect(await db.analysisEngineRunInput.count({ where: { runId: failed.runId } })).toBe(0);
      expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
      expect(await dataCenterCounts()).toEqual(baseline);
    } finally { await db.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DROP CONSTRAINT "financial_m5_reject_owned_input"'); }
    const result = await runFinancialAnalysisPersisted(request, owner, failed);
    expect(await replayFinancialAnalysis(result.runId, owner)).toEqual(result);
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns + 1); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs + 1);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
  it("keeps concurrent foreign/missing lookups and replays indistinguishable", async () => {
    expect(runs).toHaveLength(8);
    const beforeRuns = await db.analysisEngineRun.count(); const beforeInputs = await db.analysisEngineRunInput.count();
    const ids = [runs[0]!.runId, "financial-m5-absent"];
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => index % 2
      ? replayFinancialAnalysis(ids[Math.floor(index / 2) % 2]!, foreign) : readFinancialRun(ids[Math.floor(index / 2) % 2]!, foreign)));
    for (const outcome of outcomes) {
      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") expect(outcome.reason).toEqual(new FinancialHistoryUnavailable());
    }
    expect(await db.analysisEngineRun.count()).toBe(beforeRuns); expect(await db.analysisEngineRunInput.count()).toBe(beforeInputs);
    expect(await dataCenterCounts()).toEqual(baseline);
  }, 60_000);
});
