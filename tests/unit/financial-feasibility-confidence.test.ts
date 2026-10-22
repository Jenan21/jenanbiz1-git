import { describe, expect, it } from "vitest";
import {
  assessFinancialConfidence, assessFinancialPrerequisites, financialConfidenceMatches, financialConfidenceSchema,
  financialMetricSchema,
} from "@/services/analysis-engines/financial-feasibility";
import { financialInputs, financialRequest } from "./support/financial-feasibility-fixtures";

describe("Financial M1 evidence confidence, never project success", () => {
  it("caps owner-approved projections at MEDIUM without calling them actual revenue", () => {
    const request = financialRequest();
    const confidence = assessFinancialConfidence(request.assumptions, financialInputs(), false)!;
    expect(confidence.band).toBe("MEDIUM"); expect(confidence.isProbability).toBe(false);
    expect(confidence).not.toHaveProperty("score");
    expect(financialConfidenceMatches(confidence, request.assumptions, financialInputs(), false)).toBe(true);
  });
  it("permits HIGH only for verified complete observed inputs and documented methods", () => {
    const request = financialRequest(); request.assumptions.forEach((entry) => { entry.evidenceNature = "OBSERVED"; });
    expect(assessFinancialConfidence(request.assumptions, financialInputs(), false)?.band).toBe("HIGH");
  });
  it.each(["UNREVIEWED", "OWNER_APPROVED"] as const)("does not confuse approval %s with correctness or success", (approval) => {
    const request = financialRequest(); request.assumptions[0]!.approval = approval;
    expect(assessFinancialConfidence(request.assumptions, financialInputs(), false)?.band).toBe(approval === "UNREVIEWED" ? "LOW" : "MEDIUM");
  });
  it.each(["source", "freshness", "coverage", "unmeasured"] as const)("caps weakest required %s at LOW", (kind) => {
    const inputs = financialInputs();
    if (kind === "source") inputs[0]!.evidenceStatus = "UNVERIFIED";
    if (kind === "freshness") inputs[0]!.freshness.status = "STALE";
    if (kind === "coverage") inputs[0]!.completeness = "SAMPLE";
    if (kind === "unmeasured") inputs[0]!.quality = { status: "UNAVAILABLE" };
    expect(assessFinancialConfidence(financialRequest().assumptions, inputs, false)?.band).toBe("LOW");
  });
  it("does not award confidence to missing values, missing sources or blocked methods", () => {
    const request = financialRequest();
    expect(assessFinancialConfidence(request.assumptions, financialInputs(), true)).toBeNull();
    expect(assessFinancialConfidence(request.assumptions, [], false)).toBeNull();
    request.assumptions[0]!.value = null;
    expect(assessFinancialConfidence(request.assumptions, financialInputs(), false)).toBeNull();
  });
  it("rejects forged higher bands or duplicate factor identities", () => {
    const request = financialRequest(); const confidence = assessFinancialConfidence(request.assumptions, financialInputs(), false)!;
    expect(financialConfidenceSchema.safeParse({ ...confidence, band: "HIGH" }).success).toBe(false);
    confidence.factors[1]!.key = confidence.factors[0]!.key;
    expect(financialConfidenceSchema.safeParse(confidence).success).toBe(false);
  });
  it("does not let missing inputs become low-confidence arithmetic", () => {
    const request = financialRequest(); request.assumptions.find((a) => a.id === "price")!.value = null;
    const readiness = assessFinancialPrerequisites(request, financialInputs(), "BREAK_EVEN");
    expect(readiness.ready).toBe(false);
    expect(assessFinancialConfidence(readiness.assumptions, readiness.inputs, !readiness.ready)).toBeNull();
  });
  it.each(["AMBIGUOUS_IRR", "NONPOSITIVE_CONTRIBUTION", "IRR_NOT_BRACKETED", "NUMERICAL_NONCONVERGENCE"] as const)("never emits a value for %s", (reason) => {
    const request = financialRequest(); const confidence = assessFinancialConfidence(request.assumptions, financialInputs(), false);
    expect(financialMetricSchema.safeParse({
      key: "result", analysis: "IRR", status: "COMPUTED", value: "0", interpretation: "ASSUMPTION_BASED_PROJECTION",
      unit: { kind: "PERCENT" }, periodIds: ["p1"], method: { id: "method", version: "1" }, assumptionIds: ["rate"],
      basis: { currency: "SAR", priceBasis: "NOMINAL", priceBaseDate: "2026-10-01", cashMode: "DIRECT_CASH", cashFlowBasis: "PROJECT_UNLEVERED" },
      evidence: request.assumptions[0]!.evidence, confidence, reasons: [reason], limitations: ["Synthetic test"], rights: { allowExport: false, denials: [{ inputId: "dc:version-1", reason: "EXPORT_NOT_ALLOWED" }] },
    }).success).toBe(false);
  });
});
