import { describe, expect, it } from "vitest";
import {
  analyzeOpportunityData, buildOpportunityCalculationResult, findOpportunityCalculationProblems, opportunitySignalRule,
  type OpportunityCalculationEvidence, type OpportunityCalculationResult,
} from "@/services/analysis-engines/opportunity-gap";
import { computeDeterminism, findEnvelopeViolations, canonicalize } from "@/services/analysis-engines/shared";
import { opportunityCalculationGapCatalog } from "@/services/analysis-engines/opportunity-gap/calculations";
import { opportunityContext, opportunityEvidence, opportunityFact, opportunityRequest } from "./support/opportunity-gap-fixtures";
import { opportunityDataset, opportunityPortFixture } from "./support/opportunity-data-fixtures";
import { makeInput } from "./support/analysis-engine-fixtures";

function fixture() {
  const request = opportunityRequest();
  request.analyses.push("OPPORTUNITY_SIGNALS");
  request.signalPolicy = { ...opportunitySignalRule };
  const current = opportunityEvidence();
  const evidence: OpportunityCalculationEvidence = { current, historical: { inputs: [], facts: [] }, retainedInputs: structuredClone(current.inputs), sources: [] };
  const run = () => buildOpportunityCalculationResult(request, evidence, opportunityContext);
  return { request, evidence, run };
}
const metric = (result: OpportunityCalculationResult, key = "current.demand_supply_gap") => result.results[0]!.metrics.find((entry) => entry.key === key)!;
function benchmarkFixture() {
  const f = fixture();
  f.request.analyses = ["BENCHMARK_GAP", "OPPORTUNITY_SIGNALS"];
  f.request.benchmarkPolicy = { id: "test-benchmark", version: "1" };
  const facts = [opportunityFact("provision.observations"), opportunityFact("benchmarks.targets")];
  facts[0]!.value = 60; facts[1]!.value = 100;
  const inputs = facts.map((fact) => {
    const ref = fact.evidence[0]!;
    return makeInput({ ...f.evidence.current.inputs[0]!, id: ref.inputId, roles: [fact.role], ref: { system: "DATA_CENTER", id: ref.versionId, version: 1, label: "Synthetic target/provision" }, checksum: { algorithm: "SHA-256", value: ref.checksum } });
  });
  f.request.data.roles = facts.map((fact) => ({ role: fact.role, versionId: fact.evidence[0]!.versionId, checksum: fact.evidence[0]!.checksum }));
  f.evidence.current = { inputs, facts }; f.evidence.retainedInputs = structuredClone(inputs);
  return f;
}
describe("Opportunity M3 deterministic calculations; synthetic evidence only", () => {
  it("computes signed total-need/capacity balance and an explicit base-100 index", () => {
    const result = fixture().run();
    expect(metric(result).value).toBe(40);
    expect(metric(result, "current.demand_supply_gap.index").value).toBeCloseTo(166.66666666666669);
    expect(metric(result, "signal.demand_supply_gap").value).toBe(true);
    expect(result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")?.signalState).toBe("SUPPORTED");
    expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(findEnvelopeViolations(result, { catalog: opportunityCalculationGapCatalog })).toEqual([]);
    expect(findOpportunityCalculationProblems(result)).toEqual([]);
  });
  it.each([0, 60, 40])("retains zero/negative balance without inventing demand at need=%s", (need) => {
    const f = fixture(); f.evidence.current.facts[0]!.value = need;
    const result = f.run();
    expect(metric(result).value).toBe(need - 60);
    expect(result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")?.signalState).toBe("NOT_SUPPORTED");
    expect(metric(result, "signal.demand_supply_gap").value).toBe(false);
  });
  it("keeps a valid zero-denominator balance but makes its index null", () => {
    const f = fixture(); f.evidence.current.facts[1]!.value = 0;
    const result = f.run();
    expect(metric(result).value).toBe(100);
    expect(metric(result, "current.demand_supply_gap.index")).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
    expect(metric(result, "signal.demand_supply_gap").value).toBe(true);
    expect(result.findings.some((finding) => finding.kind === "DATA_GAP")).toBe(true);
  });
  it.each([0, 60, 100, 150])("computes normative benchmark balance/shortfall at provision=%s", (value) => {
    const f = benchmarkFixture(); f.evidence.current.facts[0]!.value = value;
    const result = f.run();
    expect(metric(result, "current.benchmark_gap").value).toBe(value - 100);
    expect(metric(result, "current.benchmark_gap.shortfall").value).toBe(Math.max(100 - value, 0));
    expect(metric(result, "signal.benchmark_gap").value).toBe(value < 100);
    expect(metric(result, "current.benchmark_gap").limitations).toContain("A normative target is not observed demand.");
  });
  it.each(["unit", "geography", "sector", "time", "methodology", "cohort", "universe", "metricDefinition", "adjustment", "measuredSubject"] as const)("refuses actual arithmetic for %s mismatch", (key) => {
    const f = fixture(); const fact = f.evidence.current.facts[1]!;
    if (key === "unit") fact.semantics.unit.id = "seats";
    else if (key === "time") fact.semantics.time.id = "other-period";
    else if (key === "measuredSubject") fact.semantics.measuredSubject = "other";
    else if (key === "adjustment") fact.semantics.dimensions.adjustment = "other";
    else if (key === "sector") fact.semantics.dimensions.sector.code = "other";
    else if (key === "geography") fact.semantics.dimensions.geography.version = "2";
    else { fact.semantics.dimensions[key].version = "2"; if (key === "methodology") fact.method.version = "2"; }
    const result = f.run();
    expect(metric(result)).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
    expect(result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")?.signalState).toBe("NOT_COMPARABLE");
  });
  it.each(["PARTIAL", "UNKNOWN", "NONE"] as const)("does not turn %s coverage into a population gap or a negative signal", (coverage) => {
    const f = fixture(); const fact = f.evidence.current.facts[0]!;
    fact.coverage = coverage; fact.limitations = ["Coverage incomplete"]; if (coverage === "NONE") fact.value = null;
    const result = f.run();
    expect(metric(result).value).toBeNull();
    expect(metric(result, "signal.demand_supply_gap").value).toBeNull();
    expect(result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")?.signalState).toBe("INSUFFICIENT_EVIDENCE");
  });
  it.each(["UNMET_NEED", "ALREADY_SERVED"] as const)("does not subtract %s as total need", (boundary) => {
    const f = fixture(); f.evidence.current.facts[0]!.measurementBoundary = boundary;
    expect(metric(f.run()).value).toBeNull();
  });
  it.each(["context.indicators", "dimensions.dictionary"] as const)("never substitutes %s for demand", (role) => {
    const f = fixture(); f.evidence.current.facts = [f.evidence.current.facts[1]!];
    expect(metric(f.run()).status).toBe("NOT_AVAILABLE");
    expect(opportunityFact(role).measurementBoundary).toBe("CONTEXT_ONLY");
  });
  it("keeps missing versus unknown-value states distinct", () => {
    const f = fixture(); f.evidence.current.facts[0]!.value = null;
    expect(metric(f.run()).status).toBe("NOT_COMPUTABLE");
    f.evidence.current.facts.shift();
    expect(metric(f.run()).status).toBe("NOT_AVAILABLE");
  });
  it("rejects implicit aggregation of duplicate role observations", () => {
    const f = fixture(); f.evidence.current.facts.push({ ...f.evidence.current.facts[0]!, id: "second-need-observation" });
    const result = f.run();
    expect(metric(result).value).toBeNull();
    expect(metric(result).limitations).toContain("AMBIGUOUS_OPERANDS_NO_APPROVED_AGGREGATION");
  });
  it("does not choose one usable source when multiple exact sources for that role were pinned", () => {
    const f = fixture(); f.request.data.roles.push({ role: "need.observations", versionId: "hidden-other", checksum: "c".repeat(64) });
    expect(metric(f.run()).value).toBeNull();
  });
  it.each(["STALE", "UNKNOWN", "EXPIRED"] as const)("blocks definitive gap with %s source freshness", (status) => {
    const f = fixture();
    f.evidence.current.inputs[0]!.freshness.status = status;
    if (status === "UNKNOWN") f.evidence.current.inputs[0]!.freshness.sourcePublishedAt = null;
    f.evidence.retainedInputs = structuredClone(f.evidence.current.inputs);
    expect(metric(f.run()).value).toBeNull();
  });
  it("retains source validation failures instead of filling gaps", async () => {
    const f = opportunityPortFixture(); f.versions.delete("capacity-v1");
    const result = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    expect(metric(result)).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    expect(result.calculationEvidence.sources.some((source) => source.reason === "SOURCE_UNAVAILABLE")).toBe(true);
    expect(f.read).toHaveBeenCalledTimes(1);
  });
  it("runs exact M2 preparation into real M3 calculations with no extra read", async () => {
    const f = opportunityPortFixture();
    const result = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    expect(metric(result).value).toBe(40);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(findOpportunityCalculationProblems(result)).toEqual([]);
    expect(result.rights.allowExport).toBe(false);
  });
  it.each(["PARTIAL", "NONE", "UNKNOWN"] as const)("preserves dataset %s coverage in the governed path", async (status) => {
    const f = opportunityPortFixture(); const dataset = opportunityDataset();
    dataset.coverage.status = status; dataset.coverage.completeness = "UNKNOWN";
    dataset.rows[0]!.coverage = status; dataset.rows[0]!.limitations = ["Synthetic partial coverage"];
    if (status === "NONE") dataset.rows[0]!.value = null;
    f.versions.get("need-v1")!.content = JSON.stringify(dataset);
    const result = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    expect(metric(result).value).toBeNull();
  });
  it("requires the exact owner-approved signal policy", () => {
    const f = fixture(); f.request.signalPolicy = { id: "unknown-rule", version: "1" };
    const result = f.run();
    expect(metric(result).value).toBe(40);
    expect(metric(result, "signal.demand_supply_gap")).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
  });
  it("signals without a requested comparison stay unavailable", () => {
    const f = fixture(); f.request.analyses = ["OPPORTUNITY_SIGNALS"];
    expect(metric(f.run(), "signal.no_comparison")).toMatchObject({ status: "NOT_AVAILABLE", value: null });
  });
  it("caps final confidence at the weakest required input score and band", () => {
    const f = fixture(); f.evidence.current.inputs[0]!.quality = { status: "UNAVAILABLE" };
    f.evidence.retainedInputs = structuredClone(f.evidence.current.inputs);
    const result = f.run();
    expect(metric(result).confidence!.band).not.toBe("HIGH");
    expect(metric(result, "signal.demand_supply_gap").confidence!.score).toBeLessThanOrEqual(metric(result).confidence!.score);
  });
  it("normalizes permutations and excludes only run identity/timing from hashes", () => {
    const f = fixture(); const first = f.run();
    f.evidence.current.inputs.reverse(); f.evidence.current.facts.reverse(); f.evidence.retainedInputs.reverse(); f.request.data.roles.reverse(); f.request.analyses.reverse();
    expect(f.run().determinism).toEqual(first.determinism);
    const replay = buildOpportunityCalculationResult(f.request, f.evidence, { ...opportunityContext, runId: "another-run", timing: { ...opportunityContext.timing, durationMs: 1 } });
    expect(replay.determinism).toEqual(first.determinism);
  });
  it.each(["value", "confidence", "rights", "formula", "signal"] as const)("rejects rehashed %s fabrication", (field) => {
    const result = fixture().run();
    if (field === "value") metric(result).value = 999;
    if (field === "confidence") metric(result).confidence = null;
    if (field === "rights") result.rights.allowExport = !result.rights.allowExport;
    if (field === "formula") metric(result).method = "invented formula";
    if (field === "signal") result.findings.find((finding) => finding.kind === "OPPORTUNITY_SIGNAL")!.signalState = "NOT_SUPPORTED";
    result.determinism = computeDeterminism(result);
    expect(findOpportunityCalculationProblems(result).length).toBeGreaterThan(0);
  });
  it("rejects unpinned evidence and conflicting retained metadata", () => {
    const f = fixture(); f.request.data.roles = [];
    expect(f.run).toThrow(/Unpinned/);
    const other = fixture(); other.evidence.retainedInputs[0]!.license = "different";
    expect(other.run).toThrow(/metadata/);
  });
  it("has no score/profit/recommendation field", () => {
    const result = fixture().run();
    expect(result).not.toHaveProperty("opportunityScore");
    expect(result).not.toHaveProperty("profit");
    expect(result).not.toHaveProperty("recommendation");
    expect(canonicalize(result)).toContain("not observed unmet demand");
  });
  it("computes coverage diagnostics without requiring or claiming an economic gap", () => {
    const f = fixture(); f.request.analyses = ["DATA_COVERAGE"];
    const result = f.run();
    expect(metric(result, "data_gap.detected")).toMatchObject({ status: "COMPUTED", value: false });
    expect(result.findings.every((finding) => finding.kind === "DATA_GAP")).toBe(true);
  });
  it.each(["policy", "expired"] as const)("blocks invalid benchmark %s at calculation time", (variant) => {
    const f = benchmarkFixture(); const benchmark = f.evidence.current.facts[1]!.benchmark!;
    if (variant === "policy") benchmark.policy.version = "2";
    else benchmark.validUntil = opportunityContext.evaluatedAt;
    expect(metric(f.run(), "current.benchmark_gap").value).toBeNull();
  });
  it("preserves valid balance but rejects an overflowing base-100 index", () => {
    const f = fixture();
    f.request.definition.unit.dimension = "ITEMS";
    for (const fact of f.evidence.current.facts) fact.semantics.unit.dimension = "ITEMS";
    f.evidence.current.facts[0]!.value = 1e308; f.evidence.current.facts[1]!.value = 1e-308;
    const result = f.run();
    expect(metric(result).value).toBe(1e308);
    expect(metric(result, "current.demand_supply_gap.index")).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
  });
  it("returns NOT_COMPUTABLE with all simultaneous comparison mismatches, without truncating reasons", () => {
    const f = fixture(); const fact = f.evidence.current.facts[1]!;
    fact.semantics.unit.id = "other"; fact.semantics.time.id = "other";
    for (const ref of [fact.semantics.dimensions.geography, fact.semantics.dimensions.sector, fact.semantics.dimensions.cohort, fact.semantics.dimensions.methodology, fact.semantics.dimensions.universe, fact.semantics.dimensions.metricDefinition]) ref.version = "2";
    fact.method.version = "2"; fact.semantics.dimensions.adjustment = "other";
    const result = f.run();
    expect(metric(result).status).toBe("NOT_COMPUTABLE");
    expect(metric(result).limitations.join(";")).toContain("METHODOLOGY_MISMATCH");
    expect(metric(result).limitations.join(";")).toContain("GEOGRAPHY_MISMATCH");
  });
  it("rejects oversized evidence before doing calculations", () => {
    const f = fixture();
    expect(() => buildOpportunityCalculationResult(f.request, { ...f.evidence, padding: "x".repeat(2 * 1024 * 1024) }, opportunityContext)).toThrow(/2 MiB/);
  });
  it.each(["geography", "sector", "period"] as const)("maps governed %s incompatibility to NOT_COMPUTABLE, not a zero or fallback", async (dimension) => {
    const f = opportunityPortFixture(); const dataset = opportunityDataset();
    if (dimension === "geography") dataset.scope.dimensions.geography.code = "different-city";
    if (dimension === "sector") dataset.scope.dimensions.sector.code = "different-sector";
    if (dimension === "period") dataset.scope.time.id = "different-period";
    dataset.rows[0]!.semantics.dimensions = structuredClone(dataset.scope.dimensions);
    dataset.rows[0]!.semantics.time = structuredClone(dataset.scope.time);
    f.versions.get("need-v1")!.content = JSON.stringify(dataset);
    const result = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    expect(metric(result)).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
  });
  it("does not expose whether a denied exact source exists, and propagates backend faults", async () => {
    const f = opportunityPortFixture(); const hidden = f.versions.get("capacity-v1")!; f.versions.delete("capacity-v1");
    const first = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    f.versions.set("capacity-v1", hidden);
    const discover = f.discover.getMockImplementation()!;
    f.discover.mockImplementation(async (query) => query.versionIds.includes("capacity-v1") ? {
      mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE",
      candidates: [], selected: null, unavailableVersionIds: ["capacity-v1"], notInForce: [], truncated: false,
    } : discover(query));
    const second = await analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext);
    expect(first).toEqual(second);
    f.discover.mockRejectedValueOnce(new Error("Explicit backend failure"));
    await expect(analyzeOpportunityData(f.port, opportunityRequest(), opportunityContext)).rejects.toThrow("Explicit backend failure");
  });
  it.each(["compatible", "geography", "overlap", "methodology"] as const)("computes historical change only for %s independently pinned periods", (variant) => {
    const f = fixture(); f.request.analyses.push("HISTORICAL_CHANGE");
    const scope = structuredClone(f.request.scope);
    scope.time = { kind: "INTERVAL", id: "2026-08", startDate: "2026-08-01", endDate: "2026-09-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" };
    if (variant === "geography") scope.dimensions.geography.version = "old";
    if (variant === "methodology") scope.dimensions.methodology.version = "old";
    if (variant === "overlap") scope.time = structuredClone(f.request.scope.time);
    f.request.historical = { scope, versions: [] };
    const historical = structuredClone(f.evidence.current);
    for (const [index, input] of historical.inputs.entries()) {
      input.id += "-old"; input.ref.id += "-old";
      f.request.historical.versions.push({ role: historical.facts[index]!.role, versionId: input.ref.id, checksum: input.checksum!.value });
    }
    for (const fact of historical.facts) {
      fact.id += "-old"; fact.semantics.time = structuredClone(scope.time); fact.semantics.dimensions = structuredClone(scope.dimensions);
      fact.method.version = scope.dimensions.methodology.version;
      for (const ref of fact.evidence) { ref.inputId += "-old"; ref.versionId += "-old"; }
    }
    historical.facts[0]!.value = 80;
    f.evidence.historical = historical; f.evidence.retainedInputs.push(...historical.inputs);
    const result = f.run();
    const change = metric(result, "historical_change.demand_supply_gap");
    expect(change.value).toBe(variant === "compatible" ? 20 : null);
    expect(change.semantics?.comparison?.from).toEqual(scope.time);
    expect(findOpportunityCalculationProblems(result)).toEqual([]);
  });
});
