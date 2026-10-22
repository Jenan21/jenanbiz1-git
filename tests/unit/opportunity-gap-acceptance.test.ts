import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  analyzeOpportunityData, buildOpportunityRunRecord, captureOpportunityReads, opportunitySignalRule,
  reproduceOpportunityTranscript, type OpportunityDatasetRole,
} from "@/services/analysis-engines/opportunity-gap";
import { canonicalize } from "@/services/analysis-engines/shared/canonical";
import { MAX_RUN_JSON_BYTES } from "@/services/analysis-engines/shared/run-record";
import { opportunityDataset, opportunityPortFixture, opportunityReference } from "./support/opportunity-data-fixtures";
import { opportunityContext, opportunityRequest } from "./support/opportunity-gap-fixtures";

describe("Opportunity M5 bounded synthetic acceptance, no production-data claim", () => {
  it("keeps 32 interleaved four-source calculations deterministic and mutation-isolated", async () => {
    const fixture = opportunityPortFixture(); const request = opportunityRequest();
    request.analyses = ["DATA_COVERAGE", "DEMAND_SUPPLY_GAP", "BENCHMARK_GAP", "OPPORTUNITY_SIGNALS"];
    request.benchmarkPolicy = { id: "test-benchmark", version: "1" }; request.signalPolicy = { ...opportunitySignalRule };
    for (const role of ["provision.observations", "benchmarks.targets"] as const satisfies readonly OpportunityDatasetRole[]) {
      const reference = opportunityReference(role, `${role}-v1`); const dataset = opportunityDataset(role);
      if (role === "benchmarks.targets") dataset.rows[0]!.value = 100;
      fixture.versions.set(reference.version.versionId, { reference, content: JSON.stringify(dataset) });
      request.data.roles.push({ role, versionId: reference.version.versionId, checksum: reference.version.checksum.value });
    }
    const original = structuredClone(request); const bytes = [...fixture.versions].map(([id, value]) => [id, value.content]);
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 32 }, (_, index) => analyzeOpportunityData(fixture.port, request, {
      ...opportunityContext, runId: `opportunity-m5-pure-${index}`,
    })));
    const totalMs = performance.now() - start;
    for (const result of results) {
      expect(result.determinism).toEqual(results[0]!.determinism);
      expect(result.inputs).toHaveLength(4);
      const metrics = Object.fromEntries(result.results[0]!.metrics.map((metric) => [metric.key, metric.value]));
      expect(metrics["current.demand_supply_gap"]).toBe(40);
      expect(metrics["current.benchmark_gap"]).toBe(-40);
      expect(metrics["current.benchmark_gap.shortfall"]).toBe(40);
      expect(metrics["signal.demand_supply_gap"]).toBe(true);
      expect(metrics["signal.benchmark_gap"]).toBe(true);
      expect(metrics["data_gap.detected"]).toBe(false);
      expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
      expect(Buffer.byteLength(canonicalize(result))).toBeLessThanOrEqual(MAX_RUN_JSON_BYTES);
    }
    expect(request).toEqual(original); expect([...fixture.versions].map(([id, value]) => [id, value.content])).toEqual(bytes);
    results[0]!.inputs[0]!.source!.name = "Changed isolated result";
    expect(results[1]!.inputs[0]!.source!.name).not.toBe("Changed isolated result");
    expect(totalMs).toBeLessThan(15_000);
    console.log(`OPPORTUNITY_M5_PURE_LOAD=${JSON.stringify({ count: 32, sources: 4, totalMs, operationsPerSecond: 32_000 / totalMs })}`);
  }, 30_000);
  it("reconstructs sixteen independent exact transcripts without live reads or shared-result mutation", async () => {
    const fixture = opportunityPortFixture(); const capture = captureOpportunityReads(fixture.port);
    const result = await analyzeOpportunityData(capture.port, opportunityRequest(), opportunityContext);
    const record = buildOpportunityRunRecord(result, { actor: { kind: "USER", id: "synthetic-owner" }, createdAt: opportunityContext.evaluatedAt, access: {} }, capture.transcript);
    const before = structuredClone(record);
    fixture.read.mockRejectedValue(new Error("Live read prohibited")); fixture.discover.mockRejectedValue(new Error("Live discovery prohibited"));
    const start = performance.now();
    const results = await Promise.all(Array.from({ length: 16 }, () => reproduceOpportunityTranscript(result, capture.transcript)));
    const totalMs = performance.now() - start;
    results.forEach((entry) => expect(entry).toEqual(result));
    results[0]!.rights.allowExport = !results[0]!.rights.allowExport;
    expect(results[1]).toEqual(result); expect(record).toEqual(before);
    expect(fixture.read).toHaveBeenCalledTimes(2); expect(fixture.discover).toHaveBeenCalledTimes(2);
    expect(totalMs).toBeLessThan(15_000);
    console.log(`OPPORTUNITY_M5_TRANSCRIPT_LOAD=${JSON.stringify({ count: 16, totalMs })}`);
  }, 30_000);
  it("rejects oversized requests before discovery or source reads", async () => {
    const fixture = opportunityPortFixture();
    await expect(analyzeOpportunityData(fixture.port, { padding: "x".repeat(MAX_RUN_JSON_BYTES + 1) }, opportunityContext)).rejects.toThrow(/2 MiB/);
    expect(fixture.discover).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled();
  });
});
