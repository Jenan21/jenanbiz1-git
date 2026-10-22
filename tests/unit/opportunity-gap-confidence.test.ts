import { describe, expect, it } from "vitest";
import {
  calculateOpportunityConfidence, opportunityConfidencePolicy, type OpportunityConfidenceBasis,
} from "@/services/analysis-engines/opportunity-gap";
import { bandRank, confidencePolicyDescriptorSchema, findBreakdownPolicyViolations } from "@/services/analysis-engines/shared";
import { evaluatedAt, makeBreakdown } from "./support/analysis-engine-fixtures";
import { opportunityBasis } from "./support/opportunity-gap-fixtures";

describe("opportunity-confidence-v1 evidence quality, not an opportunity score", () => {
  it("has independently documented weights totaling 100 and approved thresholds", () => {
    expect(confidencePolicyDescriptorSchema.safeParse(opportunityConfidencePolicy).success).toBe(true);
    expect(opportunityConfidencePolicy.id).toBe("opportunity-confidence-v1");
    expect(opportunityConfidencePolicy.isProbability).toBe(false);
    expect(opportunityConfidencePolicy.factors.map((factor) => factor.maxPoints)).toEqual([15, 15, 20, 15, 10, 10, 10, 5]);
    expect(opportunityConfidencePolicy.thresholds).toEqual({ high: 80, medium: 60, low: 40 });
  });
  it("awards documented full evidence only the 100 evidence-quality points", () => {
    const result = calculateOpportunityConfidence([opportunityBasis()], evaluatedAt);
    expect(result.kind).toBe("SCORED");
    expect(result.confidence?.score).toBe(100);
    expect(result.confidence?.band).toBe("HIGH");
    expect(findBreakdownPolicyViolations(result.confidence!, opportunityConfidencePolicy)).toEqual([]);
  });
  it.each([
    "rights-denied", "rights-unknown", "method-unsupported", "incompatible", "comparability-unknown",
    "coverage-none", "provenance-missing", "rule-unknown", "rule-not-applicable",
    "expired", "future-source", "future-quality", "license-missing", "usage-missing", "estimated", "conflicted", "insufficient-operand",
  ])("blocks essential invalid evidence: %s", (condition) => {
    const basis = opportunityBasis();
    switch (condition) {
      case "rights-denied": basis.analysisUsage = "DENIED"; break;
      case "rights-unknown": basis.analysisUsage = "NOT_VERIFIED"; break;
      case "method-unsupported": basis.measurement = "UNSUPPORTED"; break;
      case "incompatible": basis.comparability = "INCOMPATIBLE"; break;
      case "comparability-unknown": basis.comparability = "UNKNOWN"; break;
      case "coverage-none": basis.coverage = "NONE"; break;
      case "provenance-missing": basis.provenance = "MISSING"; break;
      case "rule-unknown": basis.applicability = "UNKNOWN"; break;
      case "rule-not-applicable": basis.applicability = "NOT_APPLICABLE"; break;
      case "expired": basis.input.freshness.expiresAt = evaluatedAt; break;
      case "future-source": basis.input.freshness.sourcePublishedAt = "2027-01-01T00:00:00.000Z"; break;
      case "future-quality": if (basis.input.quality.status === "MEASURED") basis.input.quality.measuredAt = "2027-01-01T00:00:00.000Z"; break;
      case "license-missing": basis.input.license = " "; break;
      case "usage-missing": basis.input.usagePolicy = null; break;
      case "estimated": basis.input.evidenceStatus = "ESTIMATED"; break;
      case "conflicted": basis.input.evidenceStatus = "CONFLICTED"; break;
      case "insufficient-operand": basis.operandConfidence = makeBreakdown([0, 0, 0]); break;
    }
    const result = calculateOpportunityConfidence([basis], evaluatedAt);
    expect(result.kind).toBe("NOT_SCORABLE");
    expect(result.confidence).toBeNull();
    expect(result.reason).toBeTruthy();
  });
  it.each(["partial", "unknown", "sample", "unknown-inventory", "stale", "unknown-freshness", "unverified", "limited-method", "undeclared-license"])("caps %s evidence at LOW", (condition) => {
    const basis = opportunityBasis();
    switch (condition) {
      case "partial": basis.coverage = "PARTIAL"; break;
      case "unknown": basis.coverage = "UNKNOWN"; break;
      case "sample": basis.input.completeness = "SAMPLE"; break;
      case "unknown-inventory": basis.input.completeness = "UNKNOWN"; break;
      case "stale": basis.input.freshness.status = "STALE"; break;
      case "unknown-freshness": basis.input.freshness = { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null }; break;
      case "unverified": basis.input.evidenceStatus = null; break;
      case "limited-method": basis.measurement = "LIMITED"; break;
      case "undeclared-license": basis.input.licenseClass = null; break;
    }
    const confidence = calculateOpportunityConfidence([basis], evaluatedAt).confidence!;
    expect(bandRank(confidence.band)).toBeLessThanOrEqual(bandRank("LOW"));
    expect(confidence.caps.length).toBeGreaterThan(0);
  });
  it("does not treat an outdated declared FRESH label as fresh", () => {
    const basis = opportunityBasis(); basis.input.freshness.freshnessDays = 1;
    expect(calculateOpportunityConfidence([basis], evaluatedAt).confidence?.caps.map((cap) => cap.code)).toContain("OPPORTUNITY_STALE");
  });
  it("documents factor points from measured source quality", () => {
    const basis = opportunityBasis();
    if (basis.input.quality.status === "MEASURED") basis.input.quality.score = 0.6;
    const confidence = calculateOpportunityConfidence([basis], evaluatedAt).confidence!;
    expect(confidence.factors.find((factor) => factor.key === "sourceQuality")?.points).toBe(9);
  });
  it("caps unmeasured quality at MEDIUM with zero quality points", () => {
    const basis = opportunityBasis(); basis.input.quality = { status: "UNAVAILABLE" };
    const confidence = calculateOpportunityConfidence([basis], evaluatedAt).confidence!;
    expect(confidence.band).toBe("MEDIUM");
    expect(confidence.factors.find((factor) => factor.key === "sourceQuality")?.points).toBe(0);
  });
  it.each([[20, 15, 10], [30, 20, 10], [40, 30, 30]] as const)("never exceeds required operand score/band for %j", (a, b, c) => {
    const basis = opportunityBasis(); basis.operandConfidence = makeBreakdown([a, b, c]);
    const confidence = calculateOpportunityConfidence([basis], evaluatedAt).confidence!;
    expect(confidence.score).toBeLessThanOrEqual(basis.operandConfidence.score);
    expect(bandRank(confidence.band)).toBeLessThanOrEqual(bandRank(basis.operandConfidence.band));
  });
  it("honors an operand band cap independently of its numeric score", () => {
    const basis = opportunityBasis(); basis.operandConfidence = makeBreakdown([40, 30, 30], ["COUNT_IS_NOT_AN_INVENTORY"]);
    const confidence = calculateOpportunityConfidence([basis], evaluatedAt).confidence!;
    expect(confidence.score).toBe(100);
    expect(confidence.band).toBe("LOW");
  });
  it("is factorwise weakest and deterministic under permutation, including ties", () => {
    const first = opportunityBasis(); const second = opportunityBasis();
    second.input.id = "dc:second"; second.input.completeness = "SAMPLE";
    if (first.input.quality.status === "MEASURED") first.input.quality.score = 0.5;
    const both = calculateOpportunityConfidence([first, second], evaluatedAt).confidence!;
    expect(calculateOpportunityConfidence([second, first], evaluatedAt).confidence).toEqual(both);
    for (const basis of [first, second]) expect(both.score).toBeLessThanOrEqual(calculateOpportunityConfidence([basis], evaluatedAt).confidence!.score);
    expect(both.factors.every((factor) => factor.explanation.ar && factor.explanation.en)).toBe(true);
  });
  it("rejects empty, duplicate, oversized or malformed confidence bases explicitly", () => {
    const basis = opportunityBasis();
    expect(() => calculateOpportunityConfidence([], evaluatedAt)).toThrow();
    expect(() => calculateOpportunityConfidence([basis, basis], evaluatedAt)).toThrow("Repeated");
    expect(() => calculateOpportunityConfidence(Array.from({ length: 33 }, () => basis), evaluatedAt)).toThrow();
    const malformed: OpportunityConfidenceBasis = structuredClone(basis);
    malformed.input.freshness.sourcePublishedAt = "2026-09-01T00:00:00Z";
    expect(() => calculateOpportunityConfidence([malformed], evaluatedAt)).toThrow("canonical");
  });
});
