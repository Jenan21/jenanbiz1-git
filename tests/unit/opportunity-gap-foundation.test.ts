import { describe, expect, it } from "vitest";
import {
  assessOpportunityComparison, buildOpportunityFoundationResult, classifyOpportunitySignal, findOpportunityResultProblems,
  ensureOpportunitySize, findingKinds, normalizeOpportunityEvidence, normalizeOpportunityRequest, opportunityEvidenceSchema, opportunityFactSchema,
  opportunityFindingSchema, opportunityRequestSchema, opportunityStates, type OpportunityFact,
} from "@/services/analysis-engines/opportunity-gap";
import { canonicalize, computeDeterminism, findEnvelopeViolations, runRecordSchema, buildRunRecord } from "@/services/analysis-engines/shared";
import { evaluatedAt, makeEngineRunInput } from "./support/analysis-engine-fixtures";
import { opportunityContext, opportunityEvidence, opportunityFact, opportunityRequest, opportunityResult } from "./support/opportunity-gap-fixtures";

const compare = (left: OpportunityFact | null = opportunityFact(), right: OpportunityFact | null = opportunityFact("supply.capacity")) =>
  assessOpportunityComparison("DEMAND_SUPPLY_GAP", opportunityRequest(), left, right, evaluatedAt);

describe("Opportunity M1 pure foundation, synthetic fixtures only", () => {
  it("retains the approved taxonomy and states without a composite score", () => {
    expect(findingKinds).toEqual(["DATA_GAP", "BENCHMARK_GAP", "DEMAND_SUPPLY_GAP", "OPPORTUNITY_SIGNAL"]);
    expect(opportunityStates).toEqual(["COMPUTED", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]);
    expect(opportunityRequestSchema.safeParse({ ...opportunityRequest(), opportunityScore: 87 }).success).toBe(false);
  });
  it("checks exact compatible total need and capacity without doing M3 subtraction", () => {
    expect(compare()).toEqual({ status: "COMPUTED", comparable: true, definitive: true, reasons: [] });
    expect(compare()).not.toHaveProperty("gap");
  });
  it.each([
    ["unit", "UNIT_MISMATCH"], ["measureKind", "MEASURE_KIND_MISMATCH"], ["time", "PERIOD_MISMATCH"],
    ["geography", "GEOGRAPHY_MISMATCH"], ["sector", "SECTOR_MISMATCH"], ["cohort", "COHORT_MISMATCH"],
    ["metricDefinition", "DEFINITION_MISMATCH"], ["methodology", "METHODOLOGY_MISMATCH"],
    ["universe", "UNIVERSE_MISMATCH"], ["adjustment", "ADJUSTMENT_MISMATCH"],
  ])("blocks incompatible %s", (dimension, reason) => {
    const fact = opportunityFact("supply.capacity");
    switch (dimension) {
      case "unit": fact.semantics.unit.id = "seats"; break;
      case "measureKind": fact.semantics.measureKind = "STOCK"; fact.semantics.time = { kind: "SNAPSHOT", id: "snapshot", date: "2026-09-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }; break;
      case "time": fact.semantics.time.id = "different"; break;
      case "geography": fact.semantics.dimensions.geography.version = "2"; break;
      case "sector": fact.semantics.dimensions.sector.code = "other"; break;
      case "cohort": fact.semantics.dimensions.cohort.id = "other"; break;
      case "metricDefinition": fact.semantics.dimensions.metricDefinition.version = "2"; break;
      case "methodology": fact.semantics.dimensions.methodology.version = "2"; fact.method.version = "2"; break;
      case "universe": fact.semantics.dimensions.universe.id = "other"; break;
      case "adjustment": fact.semantics.dimensions.adjustment = "adjusted"; break;
    }
    const result = compare(opportunityFact(), fact);
    expect(result.status).toBe("NOT_COMPUTABLE");
    expect(result.reasons).toContain(reason);
  });
  it.each(["ALREADY_SERVED", "UNMET_NEED"] as const)("does not subtract %s from serviceable capacity as total need", (boundary) => {
    const need = opportunityFact(); need.measurementBoundary = boundary;
    expect(compare(need).reasons).toContain("BOUNDARY_NOT_COMPARABLE");
  });
  it.each(["context.indicators", "dimensions.dictionary"] as const)("cannot relabel %s as demand or opportunity", (role) => {
    expect(compare(opportunityFact(role)).status).toBe("NOT_COMPUTABLE");
    const fact = opportunityFact(role); fact.measurementBoundary = "TOTAL_NEED";
    expect(opportunityFactSchema.safeParse(fact).success).toBe(false);
  });
  it("does not treat entity or branch counts as service capacity", () => {
    const branch = opportunityFact("supply.capacity");
    branch.semantics.unit = { id: "locations", version: "1", dimension: "ENTITIES", entity: "competitor-location", per: null };
    expect(compare(opportunityFact(), branch).reasons).toContain("UNIT_MISMATCH");
  });
  it.each(["PARTIAL", "UNKNOWN"] as const)("retains %s as subset eligibility, never a definitive gap", (coverage) => {
    const fact = opportunityFact(); fact.coverage = coverage; fact.limitations = ["Subset only"];
    const assessment = compare(fact);
    expect(assessment.status).toBe("PARTIAL");
    expect(classifyOpportunitySignal(assessment, false)).toBe("INSUFFICIENT_EVIDENCE");
    fact.value = 0;
    expect(opportunityFactSchema.safeParse(fact).success).toBe(false);
  });
  it("distinguishes missing, uncovered, unknown value and observed zero", () => {
    expect(compare(null).status).toBe("NOT_AVAILABLE");
    const missing = opportunityFact(); missing.value = null;
    expect(compare(missing).status).toBe("NOT_COMPUTABLE");
    missing.coverage = "NONE"; missing.limitations = ["Outside coverage"];
    expect(compare(missing).status).toBe("NO_COVERAGE");
    expect(classifyOpportunitySignal(compare(null), false)).toBe("INSUFFICIENT_EVIDENCE");
    const zero = opportunityFact(); zero.value = 0;
    expect(compare(zero).status).toBe("COMPUTED");
  });
  it("separates explicit false from unknown or incompatible signal evidence", () => {
    expect(classifyOpportunitySignal(compare(), true)).toBe("SUPPORTED");
    expect(classifyOpportunitySignal(compare(), false)).toBe("NOT_SUPPORTED");
    expect(classifyOpportunitySignal(compare(), null)).toBe("INSUFFICIENT_EVIDENCE");
    expect(classifyOpportunitySignal(compare(opportunityFact("context.indicators")), true)).toBe("NOT_COMPARABLE");
  });
  it("requires a benchmark exact source/version/scope/period and policy in force", () => {
    const request = opportunityRequest(); request.analyses = ["BENCHMARK_GAP"]; request.benchmarkPolicy = { id: "test-benchmark", version: "1" };
    const provision = opportunityFact("provision.observations"); const target = opportunityFact("benchmarks.targets");
    const assessment = () => assessOpportunityComparison("BENCHMARK_GAP", request, provision, target, evaluatedAt);
    expect(assessment().status).toBe("COMPUTED");
    expect(target.evidenceClass).toBe("NORMATIVE");
    target.benchmark!.policy.version = "2";
    expect(assessment().reasons).toContain("BENCHMARK_POLICY_MISMATCH");
    target.benchmark!.validUntil = evaluatedAt;
    expect(assessment().reasons).toContain("BENCHMARK_NOT_IN_FORCE");
    target.benchmark!.scope.dimensions.geography.code = "other";
    expect(opportunityFactSchema.safeParse(target).success).toBe(false);
  });
  it.each(["benchmark", "method", "evidence"] as const)("rejects a target without %s", (key) => {
    const target = opportunityFact("benchmarks.targets");
    const raw = { ...target, [key]: key === "evidence" ? [] : null };
    expect(opportunityFactSchema.safeParse(raw).success).toBe(false);
  });
  it.each(["ESTIMATE", "DERIVED"] as const)("rejects an observed operand relabeled %s", (nature) => {
    const fact = opportunityFact(); fact.semantics.evidenceNature = nature;
    expect(opportunityFactSchema.safeParse(fact).success).toBe(false);
  });
  it("rejects malformed measurement values and unsupported method identity", () => {
    for (const value of [-1, Infinity, NaN, 1.2]) expect(opportunityFactSchema.safeParse({ ...opportunityFact(), value }).success).toBe(false);
    const fact = opportunityFact(); fact.method.version = "unknown";
    expect(opportunityFactSchema.safeParse(fact).success).toBe(false);
  });
  it("normalizes set permutations and includes evaluation instant in request hash", () => {
    const request = opportunityRequest(); const first = normalizeOpportunityRequest(request, evaluatedAt);
    request.analyses.reverse(); request.data.roles.reverse();
    expect(normalizeOpportunityRequest(request, evaluatedAt)).toEqual(first);
    expect(normalizeOpportunityRequest(request, "2026-10-21T12:00:00.000Z").requestHash).not.toBe(first.requestHash);
    const evidence = opportunityEvidence(); const normalized = normalizeOpportunityEvidence(evidence);
    evidence.inputs.reverse(); evidence.facts.reverse();
    expect(normalizeOpportunityEvidence(evidence)).toEqual(normalized);
  });
  it("preserves exact version and checksum; duplicate/ambiguous source identity is never merged", () => {
    const evidence = opportunityEvidence();
    const duplicate = structuredClone(evidence.facts[0]!); duplicate.id = "independent-record";
    evidence.facts.push(duplicate);
    expect(normalizeOpportunityEvidence(evidence).facts).toHaveLength(3);
    duplicate.id = evidence.facts[0]!.id;
    expect(opportunityEvidenceSchema.safeParse(evidence).success).toBe(false);
    const corrupted = opportunityEvidence(); corrupted.facts[0]!.evidence[0]!.checksum = "c".repeat(64);
    expect(opportunityEvidenceSchema.safeParse(corrupted).success).toBe(false);
  });
  it.each(["benchmarkPolicy", "signalPolicy", "historical"] as const)("rejects required omitted %s instead of a guessed default", (field) => {
    const request = opportunityRequest();
    request.analyses = [field === "benchmarkPolicy" ? "BENCHMARK_GAP" : field === "signalPolicy" ? "OPPORTUNITY_SIGNALS" : "HISTORICAL_CHANGE"];
    expect(opportunityRequestSchema.safeParse(request).success).toBe(false);
  });
  it("enforces 32 pins including history, conflicting hashes and 2 MiB bounds", () => {
    const request = opportunityRequest();
    request.data.roles = Array.from({ length: 33 }, (_, index) => ({ role: "need.observations", versionId: `v${index}`, checksum: "a".repeat(64) }));
    expect(() => normalizeOpportunityRequest(request, evaluatedAt)).toThrow();
    const conflicting = opportunityRequest(); conflicting.data.roles[1]!.versionId = "need-v1";
    expect(opportunityRequestSchema.safeParse(conflicting).success).toBe(false);
    expect(() => normalizeOpportunityRequest({ payload: "x".repeat(2 * 1024 * 1024) }, evaluatedAt)).toThrow("2 MiB");
  });
  it("accepts exactly 32 pins including a baseline, and rejects the 33rd", () => {
    const request = opportunityRequest();
    request.analyses.push("HISTORICAL_CHANGE");
    request.data.roles = Array.from({ length: 31 }, (_, index) => ({ role: "need.observations", versionId: `v${index}`, checksum: "a".repeat(64) }));
    request.historical = { scope: structuredClone(request.scope), versions: [{ role: "need.observations", versionId: "baseline", checksum: "b".repeat(64) }] };
    expect(() => normalizeOpportunityRequest(request, evaluatedAt)).not.toThrow();
    request.historical.versions.push({ role: "need.observations", versionId: "baseline-2", checksum: "b".repeat(64) });
    expect(() => normalizeOpportunityRequest(request, evaluatedAt)).toThrow("32");
  });
  it("measures the JSON byte threshold exactly, including UTF-8 rather than character count", () => {
    const maximum = 2 * 1024 * 1024;
    expect(() => ensureOpportunitySize("x".repeat(maximum - 2))).not.toThrow();
    expect(() => ensureOpportunitySize("x".repeat(maximum - 1))).toThrow("2 MiB");
    expect(() => ensureOpportunitySize("أ".repeat(maximum / 2))).toThrow("2 MiB");
  });
  it("rejects a forged eligibility assessment before mapping a signal state", () => {
    expect(() => classifyOpportunitySignal({ ...compare(), reasons: ["UNIT_MISMATCH"] }, true)).toThrow("Assessment state");
    expect(() => classifyOpportunitySignal({ ...compare(null), definitive: true }, true)).toThrow("Assessment state");
  });
  it("does not accept untrusted caller-supplied previous engine results as governed facts", () => {
    expect(opportunityEvidenceSchema.safeParse({ inputs: [makeEngineRunInput()], facts: [] }).success).toBe(false);
  });
  it("produces only truthful deferred diagnostic gaps, not production opportunity calculations", () => {
    const result = opportunityResult();
    expect(findOpportunityResultProblems(result)).toEqual([]);
    expect(findEnvelopeViolations(result)).toEqual([]);
    expect(result.findings.every((finding) => finding.kind === "DATA_GAP" && finding.confidence === null)).toBe(true);
    expect(result.results.flatMap((section) => section.metrics).every((metric) => metric.value === null)).toBe(true);
  });
  it("supports no inputs without inventing zero or permissive rights", () => {
    const result = buildOpportunityFoundationResult(opportunityRequest(), { inputs: [], facts: [] }, opportunityContext);
    expect(findOpportunityResultProblems(result)).toEqual([]);
    expect(result.rights.allowExport).toBe(false);
    expect(result.dataAvailability.every((entry) => entry.status === "NOT_AVAILABLE" && !entry.inputIds.length)).toBe(true);
  });
  it("intersects restricted rights and propagates exact attribution and provenance", () => {
    const evidence = opportunityEvidence(); evidence.inputs[0]!.allowExport = false; evidence.inputs[0]!.licenseClass = "RESTRICTED";
    const result = buildOpportunityFoundationResult(opportunityRequest(), evidence, opportunityContext);
    expect(result.rights.allowExport).toBe(false);
    expect(result.attribution).toHaveLength(1);
    expect(result.findings.every((finding) => canonicalize(finding.rights) === canonicalize(result.rights) && finding.provenance.length === 2)).toBe(true);
    expect(findOpportunityResultProblems(result)).toEqual([]);
  });
  it.each(["value", "rights", "provenance", "policy", "scope", "version", "hash", "finding", "availability", "cost", "method"] as const)("rejects rehashed %s fabrication", (field) => {
    const result = opportunityResult();
    switch (field) {
      case "value": result.results[0]!.metrics[0]!.value = true; result.results[0]!.metrics[0]!.status = "COMPUTED"; result.results[0]!.metrics[0]!.platformState = "COMPUTED"; break;
      case "rights": result.findings[0]!.rights = { allowExport: false, denials: [{ reason: "NO_INPUTS" }] }; break;
      case "provenance": result.findings[0]!.provenance = []; break;
      case "policy": result.engine.policies[0]!.version = "9.0.0"; break;
      case "scope": result.results[0]!.metrics[0]!.scope.dimensions.geography.code = "other"; break;
      case "version": result.inputs[0]!.ref.id = "latest-v99"; result.evidence.inputs[0]!.ref.id = "latest-v99"; break;
      case "hash": result.request.normalized.data.roles[0]!.checksum = "d".repeat(64); break;
      case "finding": result.findings[0]!.kind = "DEMAND_SUPPLY_GAP"; break;
      case "availability": result.dataAvailability[0]!.status = "NO_COVERAGE"; break;
      case "cost": result.limits.costUnits = 0; break;
      case "method": result.findings[0]!.method.id = "unapproved-method"; break;
    }
    result.determinism = computeDeterminism(result);
    expect(findOpportunityResultProblems(result).length).toBeGreaterThan(0);
  });
  it("cannot relabel a data gap as a supported opportunity signal", () => {
    const finding = opportunityResult().findings[0]!;
    expect(opportunityFindingSchema.safeParse({ ...finding, signalState: "SUPPORTED" }).success).toBe(false);
  });
  it("preserves request/input/output hashes across ordering and execution-only metadata", () => {
    const first = opportunityResult(); const request = opportunityRequest(); const evidence = opportunityEvidence();
    request.analyses.reverse(); request.data.roles.reverse(); evidence.inputs.reverse(); evidence.facts.reverse();
    const second = buildOpportunityFoundationResult(request, evidence, { ...opportunityContext, runId: "different-run" });
    expect(second.determinism).toEqual(first.determinism);
    const changed = opportunityEvidence(); changed.facts[0]!.value = 101;
    expect(buildOpportunityFoundationResult(opportunityRequest(), changed, opportunityContext).determinism.outputHash).not.toBe(first.determinism.outputHash);
  });
  it("is compatible with unchanged Shared Run/Input contracts without saving anything", () => {
    const result = opportunityResult();
    const record = buildRunRecord(result, { actor: { kind: "SYSTEM", id: null }, subject: null, createdAt: evaluatedAt });
    expect(runRecordSchema.safeParse(record).success).toBe(true);
    expect(record.inputs).toHaveLength(2);
  });
});
