import { describe, expect, it } from "vitest";
import {
  assertCompetitorResult, calculateCompetitorConfidence, competitorConfidencePolicy, competitorMetricSchema,
  competitorResultSchema, findCompetitorResultProblems, type CompetitorConfidenceBasis,
} from "@/services/analysis-engines/competitor-analysis";
import {
  bandForScore, canonicalHash, catalogProblems, computeDeterminism, computeOutputHash, confidencePolicyDescriptorSchema,
  deriveRights, findBreakdownPolicyViolations, findEnvelopeViolations,
  createGap, deriveRunStatus,
  normalizeGaps,
  buildRunRecord, runRecordSchema,
} from "@/services/analysis-engines/shared";
import { competitorGapCatalog } from "@/services/analysis-engines/competitor-analysis";
import { competitorBasis, competitorEnvelope, competitorInstant } from "./support/competitor-analysis-fixtures";

describe("Independent competitor-confidence-v1", () => {
  it("uses the eight approved factors, 100 points, and evidence-quality-only semantics", () => {
    expect(confidencePolicyDescriptorSchema.parse(competitorConfidencePolicy)).toEqual(competitorConfidencePolicy);
    expect(competitorConfidencePolicy.factors.map((factor) => factor.maxPoints)).toEqual([15, 15, 15, 10, 10, 15, 10, 10]);
    expect(competitorConfidencePolicy.isProbability).toBe(false);
    const result = calculateCompetitorConfidence([competitorBasis()], competitorInstant);
    expect(result).toMatchObject({ kind: "SCORED", confidence: { score: 100, band: "HIGH" } });
    expect(result.confidence && findBreakdownPolicyViolations(result.confidence, competitorConfidencePolicy)).toEqual([]);
  });
  it.each([[100, "HIGH"], [80, "HIGH"], [79, "MEDIUM"], [60, "MEDIUM"], [59, "LOW"], [35, "LOW"], [34, "INSUFFICIENT"], [0, "INSUFFICIENT"]])("maps %s evidence points to %s", (score, band) => {
    expect(bandForScore(Number(score), competitorConfidencePolicy.thresholds)).toBe(band);
  });
  it.each([
    ["identity", "AMBIGUOUS", "LOW"], ["identity", "CONFLICTED", "LOW"], ["match", "INSUFFICIENT", "LOW"],
    ["coverage", "PARTIAL", "LOW"], ["coverage", "UNKNOWN", "LOW"],
  ] as const)("caps %s=%s at %s", (key, value, band) => {
    expect(calculateCompetitorConfidence([{ ...competitorBasis(), [key]: value }], competitorInstant)).toMatchObject({ confidence: { band } });
  });
  it.each(["SAMPLE", "UNKNOWN"] as const)("caps incomplete %s inputs", (completeness) => {
    const basis = competitorBasis(); basis.input.completeness = completeness;
    expect(calculateCompetitorConfidence([basis], competitorInstant)).toMatchObject({ confidence: { band: "LOW" } });
  });
  it("does not trust a falsely fresh source after its declared freshness period", () => {
    const basis = competitorBasis(); basis.input.freshness.sourcePublishedAt = "2020-01-01T00:00:00.000Z";
    expect(calculateCompetitorConfidence([basis], competitorInstant)).toMatchObject({ confidence: { band: "LOW" } });
  });
  it("gives no invented quality points when measurement is absent or future-dated", () => {
    const basis = competitorBasis(); basis.input.quality = { status: "UNAVAILABLE" };
    const result = calculateCompetitorConfidence([basis], competitorInstant);
    expect(result).toMatchObject({ confidence: { score: 85, band: "MEDIUM" } });
    expect(result.confidence?.factors.find((factor) => factor.key === "sourceQuality")?.points).toBe(0);
    const future = competitorBasis();
    if (future.input.quality.status === "MEASURED") future.input.quality.measuredAt = "2027-01-01T00:00:00.000Z";
    expect(calculateCompetitorConfidence([future], competitorInstant)).toMatchObject({ confidence: { score: 85, band: "MEDIUM" } });
  });
  it.each(["coverage", "method", "provenance"] as const)("returns NOT_SCORABLE for unusable %s", (key) => {
    const basis = competitorBasis();
    const invalid: CompetitorConfidenceBasis = key === "coverage" ? { ...basis, coverage: "NONE" } : key === "method" ? { ...basis, method: "UNSUPPORTED" } : { ...basis, provenance: "MISSING" };
    expect(calculateCompetitorConfidence([invalid], competitorInstant)).toMatchObject({ kind: "NOT_SCORABLE", confidence: null });
  });
  it.each(["CONFLICTED", "ESTIMATED"] as const)("does not score %s source evidence", (evidenceStatus) => {
    const basis = competitorBasis(); basis.input.evidenceStatus = evidenceStatus;
    expect(calculateCompetitorConfidence([basis], competitorInstant).kind).toBe("NOT_SCORABLE");
  });
  it("blocks expired/future publication, no analysis usage and missing required attribution", () => {
    const expired = competitorBasis(); expired.input.freshness.expiresAt = competitorInstant;
    expect(calculateCompetitorConfidence([expired], competitorInstant).kind).toBe("NOT_SCORABLE");
    const future = competitorBasis(); future.input.freshness.sourcePublishedAt = "2030-01-01T00:00:00.000Z";
    expect(calculateCompetitorConfidence([future], competitorInstant).kind).toBe("NOT_SCORABLE");
    const rights = competitorBasis(); rights.input.usagePolicy = null;
    expect(calculateCompetitorConfidence([rights], competitorInstant).kind).toBe("NOT_SCORABLE");
    const attribution = competitorBasis(); attribution.input.attribution.text = null;
    expect(() => calculateCompetitorConfidence([attribution], competitorInstant)).toThrow();
  });
  it("keeps restricted export separate from analysis eligibility", () => {
    const basis = competitorBasis(); basis.input.licenseClass = "RESTRICTED"; basis.input.allowExport = false;
    expect(calculateCompetitorConfidence([basis], competitorInstant).kind).toBe("SCORED");
    expect(deriveRights([basis.input]).allowExport).toBe(false);
  });
  it.each(["DENIED", "NOT_VERIFIED"] as const)("never interprets an export grant as %s analysis permission", (analysisUsage) => {
    expect(calculateCompetitorConfidence([{ ...competitorBasis(), analysisUsage }], competitorInstant)).toMatchObject({ kind: "NOT_SCORABLE", confidence: null });
  });
  it("takes weakest required factors deterministically, not an average", () => {
    const strong = competitorBasis(); const weak = competitorBasis();
    weak.input.id = "dc:weak"; weak.input.ref.id = "weak"; weak.input.completeness = "SAMPLE";
    const result = calculateCompetitorConfidence([strong, weak], competitorInstant);
    expect(result).toEqual(calculateCompetitorConfidence([weak, strong], competitorInstant));
    expect(result).toMatchObject({ confidence: { score: 90, band: "LOW" } });
    expect(result.confidence?.factors.find((factor) => factor.key === "completeness")?.inputId).toBe("dc:weak");
  });
  it("cannot strengthen a required derived operand's score or band", () => {
    const weak = competitorBasis(); weak.input.completeness = "SAMPLE";
    const prior = calculateCompetitorConfidence([weak], competitorInstant).confidence!;
    const derived = competitorBasis(); derived.upstreamConfidence = prior;
    const result = calculateCompetitorConfidence([derived], competitorInstant);
    expect(result).toMatchObject({ confidence: { score: 90, band: "LOW" } });
    expect(result.confidence?.score).toBeLessThanOrEqual(prior.score);
    const insufficient = competitorBasis(); insufficient.identity = "CONFLICTED"; insufficient.match = "INSUFFICIENT"; insufficient.coverage = "UNKNOWN";
    insufficient.input.quality = { status: "UNAVAILABLE" }; insufficient.input.completeness = "UNKNOWN"; insufficient.input.freshness = { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null };
    const priorInsufficient = calculateCompetitorConfidence([insufficient], competitorInstant).confidence!;
    expect(priorInsufficient.band).toBe("INSUFFICIENT");
    derived.upstreamConfidence = priorInsufficient;
    expect(calculateCompetitorConfidence([derived], competitorInstant).kind).toBe("NOT_SCORABLE");
  });
  it("rejects duplicate inputs, absent basis and hidden/default evaluation", () => {
    expect(() => calculateCompetitorConfidence([], competitorInstant)).toThrow();
    expect(() => calculateCompetitorConfidence([competitorBasis(), competitorBasis()], competitorInstant)).toThrow();
    expect(() => calculateCompetitorConfidence([competitorBasis()], "")).toThrow();
    const metadata = competitorBasis(); metadata.input.freshness.sourcePublishedAt = "2026-09-01T00:00:00Z";
    expect(() => calculateCompetitorConfidence([metadata], competitorInstant)).toThrow();
  });
});
describe("Competitor result and unchanged Shared Core compatibility", () => {
  it("parses the strict output and passes existing Shared envelope validation", () => {
    const result = competitorEnvelope();
    expect(competitorResultSchema.parse(result)).toEqual(result);
    expect(findEnvelopeViolations(result, { catalog: competitorGapCatalog })).toEqual([]);
    expect(findCompetitorResultProblems(result)).toEqual([]);
    expect(() => assertCompetitorResult(result)).not.toThrow();
    expect(catalogProblems(competitorGapCatalog)).toEqual([]);
  });
  it("maps to the existing Shared Run/Input contracts without adding persistence or changing Shared Core", () => {
    const result = competitorEnvelope();
    const record = buildRunRecord(result, { actor: { kind: "SYSTEM", id: null }, createdAt: competitorInstant });
    expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({ engineKey: "competitor-analysis", requestHash: result.determinism.requestHash,
      inputsHash: result.determinism.inputsHash, outputHash: result.determinism.outputHash });
    expect(record.inputs[0]?.snapshot).toEqual(result.inputs[0]);
    expect(record.result).toEqual(result);
  });
  it("has deterministic request/input/output hashes and excludes only execution identity/timing", () => {
    const first = competitorEnvelope(); const second = competitorEnvelope();
    expect(first.determinism).toEqual(second.determinism);
    second.runId = "different-run"; second.timing.durationMs = 10;
    expect(computeOutputHash(second)).toBe(first.determinism.outputHash);
    second.evidence.locations[0]!.branchId = "changed";
    expect(computeOutputHash(second)).not.toBe(first.determinism.outputHash);
    expect(canonicalHash(first.inputs)).toBe(first.determinism.inputsHash);
  });
  it.each(["SCOPED_TOTAL", "OBSERVED_SUBSET"] as const)("represents a partial %s without turning the unknown total into zero", (countBasis) => {
    const result = competitorEnvelope(); result.coverage!.status = "PARTIAL";
    const metric = result.results[0]!.metrics[0]!;
    metric.countBasis = countBasis; metric.coverageStatus = "PARTIAL";
    metric.limitations = ["Observed subset only; not the complete market"];
    metric.value = countBasis === "SCOPED_TOTAL" ? null : 1;
    metric.status = countBasis === "SCOPED_TOTAL" ? "NOT_AVAILABLE" : "PARTIAL";
    metric.platformState = countBasis === "SCOPED_TOTAL" ? "UNAVAILABLE" : "COMPUTED";
    metric.confidence = countBasis === "SCOPED_TOTAL" ? null : calculateCompetitorConfidence([{ ...competitorBasis(), coverage: "PARTIAL" }], competitorInstant).confidence;
    result.gaps.push(createGap(competitorGapCatalog, "COMPETITOR_COVERAGE_INCOMPLETE", {}, { subject: metric.key }));
    if (countBasis === "OBSERVED_SUBSET") {
      result.results[0]!.metrics.push({ ...metric, key: `${metric.key}.total`, countBasis: "SCOPED_TOTAL", status: "NOT_AVAILABLE", platformState: "UNAVAILABLE", value: null, confidence: null });
      result.gaps.push(createGap(competitorGapCatalog, "COMPETITOR_COVERAGE_INCOMPLETE", {}, { subject: `${metric.key}.total` }));
    }
    result.gaps = normalizeGaps(result.gaps);
    result.status = deriveRunStatus(result.results[0]!.metrics, result.gaps); result.determinism = computeDeterminism(result);
    expect(findCompetitorResultProblems(result)).toEqual([]);
  });
  it.each(["value", "confidence", "locationRefs", "scope", "sourceRecordRefs"] as const)("rejects tampered %s even after a caller rehashes the result", (field) => {
    const result = competitorEnvelope(); const metric = result.results[0]!.metrics[0]!;
    if (field === "value") metric.value = 87;
    if (field === "confidence") metric.confidence = null;
    if (field === "locationRefs") metric.locationRefs = ["missing"];
    if (field === "scope") metric.scope.geography.code = "different";
    if (field === "sourceRecordRefs") metric.sourceRecordRefs = [];
    result.determinism = computeDeterminism(result);
    expect(() => assertCompetitorResult(result)).toThrow();
  });
  it("cannot remove original source hashes, widen rights or omit attribution", () => {
    const result = competitorEnvelope(); result.inputs[0]!.allowExport = false; result.evidence.inputs[0]!.allowExport = false;
    result.determinism = computeDeterminism(result);
    expect(findCompetitorResultProblems(result).join(" ")).toContain("RIGHTS_MISMATCH");
    const noAttribution = competitorEnvelope(); noAttribution.attribution = [];
    expect(findCompetitorResultProblems(noAttribution).join(" ")).toContain("ATTRIBUTION_MISMATCH");
    const missingHash = competitorEnvelope(); missingHash.evidence.inputs[0]!.checksum = null;
    expect(competitorResultSchema.safeParse(missingHash).success).toBe(false);
  });
  it("recomputes matching classifications instead of accepting an invented DIRECT label", () => {
    const result = competitorEnvelope(); result.matches[0]!.relationship = "INDIRECT";
    result.determinism = computeDeterminism(result);
    expect(findCompetitorResultProblems(result).join(" ")).toContain("Matching decisions differ");
  });
  it("rejects ESTIMATED metrics, ambiguous count units, sample zero and absent trace", () => {
    const metric = competitorEnvelope().results[0]!.metrics[0]!;
    expect(competitorMetricSchema.safeParse({ ...metric, status: "ESTIMATED", interpretation: "ESTIMATE" }).success).toBe(false);
    expect(competitorMetricSchema.safeParse({ ...metric, countingUnit: "COMPETITOR_LOCATIONS", semantics: { ...metric.semantics, unit: { ...metric.semantics!.unit, entity: "UNIQUE_COMPETITOR_ENTITIES" } } }).success).toBe(false);
    expect(competitorMetricSchema.safeParse({ ...metric, value: 0, coverageStatus: "PARTIAL", status: "PARTIAL" }).success).toBe(false);
    expect(competitorMetricSchema.safeParse({ ...metric, trace: undefined }).success).toBe(false);
  });
  it("enforces metric/output limits without truncating", () => {
    const result = competitorEnvelope(); const metric = result.results[0]!.metrics[0]!;
    result.results[0]!.metrics = Array.from({ length: 501 }, (_, i) => ({ ...metric, key: `metric.${i}` }));
    expect(competitorResultSchema.safeParse(result).success).toBe(false);
    expect(() => assertCompetitorResult({ ...result, extra: "x".repeat(2 * 1024 * 1024) })).toThrow();
  });
});
