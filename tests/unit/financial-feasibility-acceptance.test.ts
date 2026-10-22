import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  analyzeFinancialData, bindFinancialDataset, buildFinancialCalculationResult, buildFinancialRunRecord,
  captureFinancialReads, reproduceFinancialTranscript,
} from "@/services/analysis-engines/financial-feasibility";
import { canonicalize } from "@/services/analysis-engines/shared/canonical";
import { MAX_RUN_JSON_BYTES } from "@/services/analysis-engines/shared/run-record";
import { financialPortFixture } from "./support/financial-data-fixtures";
import { financialContext, financialInputs, financialRequest } from "./support/financial-feasibility-fixtures";

function completeFixture() {
  const f = financialPortFixture();
  f.dataset.model.assumptions.find((entry) => entry.id === "collections")!.value = "150";
  f.dataset.model.analyses.push("SCENARIOS", "SENSITIVITY");
  const disclosure = {
    author: "Synthetic owner", declaredAt: "2026-10-01T00:00:00.000Z", rationale: "Explicit acceptance case only",
    evidence: ["model-record"],
  };
  f.dataset.model.scenarios = [{
    ...disclosure, id: "declared-price-case", label: "Synthetic declared price case",
    overrides: [{ assumptionId: "price", value: "16" }],
  }];
  f.dataset.model.sensitivity = [{
    ...disclosure, id: "declared-price-range", assumptionId: "price",
    low: "9", base: "12", high: "15", targets: ["BREAK_EVEN", "REVENUE"],
  }];
  f.request = bindFinancialDataset(f.dataset, f.reference, financialContext.evaluatedAt);
  return f;
}
describe("Financial M5 bounded synthetic acceptance, not production financial-data acceptance", () => {
  it("keeps 32 interleaved complete financial analyses deterministic and mutation-isolated", async () => {
    const f = completeFixture(); const original = structuredClone(f.request); const bytes = JSON.stringify(f.dataset);
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 32 }, (_, index) =>
      analyzeFinancialData(f.port, f.request, { ...financialContext, runId: `financial-m5-pure-${index}` })));
    const totalMs = performance.now() - start;
    for (const result of results) {
      const metrics = Object.fromEntries(result.metrics.map((entry) => [entry.key, entry.value]));
      expect(metrics).toMatchObject({
        "capex.t0": "100.00", "opex.p1": "30.00", "revenue.p1": "120.00", "cash_flow.p1": "110.00",
        "gross.margin.p1": "66.666667", "operating.margin.p1": "33.333333", "net.margin.p1": "33.333333",
        "break_even.units": "8", "payback.periods": "1", "npv.project": "8.91", "irr.per_period": "10.000000",
        "cash_requirement.amount": "85.00",
      });
      expect(result.status).toBe("COMPLETED");
      expect(result.determinism).toEqual(results[0]!.determinism);
      expect(result.scenarios[0]!.metrics.find((entry) => entry.key === "break_even.units")!.value).toBe("4");
      expect(result.sensitivities).toHaveLength(2);
      expect(result.rights.allowExport).toBe(false);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect(Buffer.byteLength(canonicalize(result))).toBeLessThanOrEqual(MAX_RUN_JSON_BYTES);
    }
    expect(f.request).toEqual(original); expect(JSON.stringify(f.dataset)).toBe(bytes);
    results[0]!.request.normalized.assumptions[0]!.value = "999";
    expect(results[1]!.request.normalized).toEqual(original);
    expect(totalMs).toBeLessThan(15_000);
    console.log(`FINANCIAL_M5_PURE_LOAD=${JSON.stringify({ count: 32, totalMs, operationsPerSecond: 32_000 / totalMs })}`);
  }, 30_000);
  it("reconstructs sixteen original full transcripts without live reads or shared mutation", async () => {
    const f = completeFixture(); const capture = captureFinancialReads(f.port);
    const result = await analyzeFinancialData(capture.port, f.request, financialContext);
    const record = await buildFinancialRunRecord(result, {
      actor: { kind: "USER", id: "synthetic-owner" }, createdAt: financialContext.evaluatedAt, access: {},
    }, capture.transcript);
    const before = structuredClone(record);
    f.discover.mockRejectedValue(new Error("Live latest discovery prohibited")); f.read.mockRejectedValue(new Error("Live input replacement prohibited"));
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 16 }, () => reproduceFinancialTranscript(result, capture.transcript)));
    const totalMs = performance.now() - start;
    results.forEach((entry) => expect(entry).toEqual(result));
    results[0]!.metrics[0]!.value = "999";
    expect(results[1]).toEqual(result); expect(record).toEqual(before);
    expect(f.discover).toHaveBeenCalledTimes(1); expect(f.read).toHaveBeenCalledTimes(1);
    expect(totalMs).toBeLessThan(15_000);
    console.log(`FINANCIAL_M5_TRANSCRIPT_LOAD=${JSON.stringify({ count: 16, totalMs })}`);
  }, 30_000);
  it("rejects oversized models before discovery or input read", async () => {
    const f = completeFixture();
    await expect(analyzeFinancialData(f.port, { padding: "x".repeat(MAX_RUN_JSON_BYTES + 1) }, financialContext)).rejects.toThrow(/2 MiB/);
    expect(f.discover).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("supports the full 120-month horizon when bounded work and output allow it", () => {
    const request = financialRequest(); request.analyses = ["OPEX"];
    const start = new Date("2026-10-01T00:00:00.000Z");
    request.basis.periods = Array.from({ length: 120 }, (_, index) => {
      const from = new Date(start); from.setUTCMonth(from.getUTCMonth() + index);
      const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
      return { ...request.basis.periods[0]!, id: `p${index + 1}`, startDate: from.toISOString().slice(0, 10), endDate: to.toISOString().slice(0, 10) };
    });
    request.schedules.forEach((schedule) => { schedule.coveredPeriods = ["t0", ...request.basis.periods.map((period) => period.id)]; });
    const output = buildFinancialCalculationResult(request, financialInputs(), financialContext);
    expect(output.metrics).toHaveLength(121);
    expect(output.metrics.find((entry) => entry.key === "opex.p120")!.value).toBe("0.00");
    expect(output.metrics.find((entry) => entry.key === "opex.p1")!.value).toBe("30.00");
  });
});
