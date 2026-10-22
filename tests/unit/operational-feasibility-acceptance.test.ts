import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  analyzeOperationalData, buildOperationalRunRecord, calculateOperational, captureOperationalReads, reproduceOperationalTranscript,
} from "@/services/analysis-engines/operational-feasibility";
import { canonicalize } from "@/services/analysis-engines/shared/canonical";
import { MAX_RUN_JSON_BYTES } from "@/services/analysis-engines/shared/run-record";
import { operationalAcceptanceFixture } from "./support/operational-acceptance-fixtures";
import { operationalContext, operationalInputs, operationalRequest } from "./support/operational-feasibility-fixtures";

describe("Operational M5 bounded synthetic technical acceptance", () => {
  it("keeps 32 interleaved complete operational analyses deterministic and mutation-isolated", async () => {
    const fixture = operationalAcceptanceFixture(); const original = structuredClone(fixture.request);
    const sourceBytes = JSON.stringify(fixture.dataset); const start = performance.now();
    const results = await Promise.all(Array.from({ length: 32 }, (_, index) => analyzeOperationalData(
      fixture.port, fixture.request, { ...operationalContext, runId: `operational-m5-pure-${index}` },
    )));
    const totalMs = performance.now() - start;
    for (const result of results) {
      const values = Object.fromEntries(result.metrics.filter((m) => m.variant === "base").map((m) => [`${m.key}:${m.entityId}`, m.value]));
      expect(values).toMatchObject({
        "net_resource_time:stage-1": "480", "stage_capacity:stage-2": "180", "serial_bottleneck:service": "180",
        "required_resource_time:stage-2": "400", "load_ratio:stage-2": "111.111111", "capacity_gap:service": "20",
        "labor_requirement:operator": "30", "fte_equivalents:operator": "5", "staffing_hours_gap:operator": "6",
        "supplier_shortfall:material": "10", "inventory_projected_balance:material": "-10", "inventory_shortage:material": "10",
        "reorder_threshold:material": "14", "observed_yield:service": "92", "rejection_ratio:service": "8",
        "prerequisite_gap_count:site-1": "1",
      });
      expect(result.status).toBe("COMPLETED");
      expect(result.metrics).toHaveLength(135); expect(result.variants).toHaveLength(5);
      expect(result.metrics.find((m) => m.variant === "scenario:declared-target" && m.key === "capacity_gap")!.value).toBe("0");
      expect(result.metrics.find((m) => m.variant === "sensitivity:declared-cycle:high" && m.key === "capacity_gap")!.value).toBe("110");
      expect(result.determinism).toEqual(results[0]!.determinism);
      expect(result.rights.allowExport).toBe(false);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect(Buffer.byteLength(canonicalize(result))).toBeLessThanOrEqual(MAX_RUN_JSON_BYTES);
    }
    expect(fixture.request).toEqual(original); expect(JSON.stringify(fixture.dataset)).toBe(sourceBytes);
    results[0]!.request.normalized.values[0]!.value = "999";
    expect(results[1]!.request.normalized).toEqual(original.model);
    expect(totalMs).toBeLessThan(15_000);
    console.log(`OPERATIONAL_M5_PURE_LOAD=${JSON.stringify({ count: 32, totalMs, operationsPerSecond: 32_000 / totalMs })}`);
  }, 30_000);
  it("reconstructs sixteen original complete transcripts without live reads or shared mutation", async () => {
    const fixture = operationalAcceptanceFixture(); const capture = captureOperationalReads(fixture.port);
    const result = await analyzeOperationalData(capture.port, fixture.request, operationalContext);
    const record = await buildOperationalRunRecord(result, {
      actor: { kind: "USER", id: "synthetic-owner" }, createdAt: operationalContext.evaluatedAt, access: {},
    }, capture.transcript);
    const before = structuredClone(record);
    fixture.discover.mockRejectedValue(new Error("Live latest discovery prohibited"));
    fixture.read.mockRejectedValue(new Error("Live source replacement prohibited"));
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 16 }, () => reproduceOperationalTranscript(result, capture.transcript)));
    const totalMs = performance.now() - start;
    results.forEach((entry) => expect(entry).toEqual(result));
    results[0]!.metrics[0]!.value = "999";
    expect(results[1]).toEqual(result); expect(record).toEqual(before);
    expect(fixture.discover).toHaveBeenCalledTimes(1); expect(fixture.read).toHaveBeenCalledTimes(1);
    expect(totalMs).toBeLessThan(15_000);
    console.log(`OPERATIONAL_M5_TRANSCRIPT_LOAD=${JSON.stringify({ count: 16, totalMs })}`);
  }, 30_000);
  it("rejects oversized requests before discovery or content read", async () => {
    const fixture = operationalAcceptanceFixture();
    await expect(analyzeOperationalData(fixture.port, { padding: "x".repeat(MAX_RUN_JSON_BYTES + 1) }, operationalContext)).rejects.toThrow("2 MiB");
    expect(fixture.discover).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled();
  });
  it("supports all 120 contiguous periods for a bounded explicitly empty committed-supply model", () => {
    const request = operationalRequest(); request.analyses = ["SUPPLY"]; request.values = []; delete request.calculationSemantics;
    const start = new Date("2026-10-01T00:00:00.000Z");
    request.periods = Array.from({ length: 120 }, (_, index) => {
      const from = new Date(start); from.setUTCMonth(from.getUTCMonth() + index);
      const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
      return { ...request.periods[0]!, id: `p${index + 1}`, startDate: from.toISOString().slice(0, 10), endDate: to.toISOString().slice(0, 10) };
    });
    // An explicit zero requirement row establishes the material universe; noApplicableItems attests zero committed deliveries.
    const consumption = operationalAcceptanceFixture().request.model.values.find((v) => v.id === "consumption")!;
    request.values = request.periods.map((period) => ({
      ...consumption,
      id: `consumption-${period.id}`, periodId: period.id, value: "0",
      evidence: structuredClone(request.requirements.evidence),
    }));
    const template = request.schedules[0]!;
    request.schedules = [
      { ...template, id: "consumption", kind: "CONSUMPTION", coveredPeriodIds: request.periods.map((p) => p.id),
        rows: request.periods.map((period) => ({ ...template.rows[0]!, id: `row-${period.id}`, valueId: `consumption-${period.id}`, periodId: period.id, entityId: "material" })) },
      { ...template, id: "supplier", kind: "SUPPLIER", coveredPeriodIds: request.periods.map((p) => p.id), rows: [], noApplicableItems: true },
    ];
    const result = calculateOperational(request, operationalInputs(), operationalContext);
    expect(result.metrics).toHaveLength(120);
    expect(result.metrics.every((m) => m.value === "0")).toBe(true);
    expect(result.metrics.at(-1)!.periodId).toBe("p120");
  });
});
