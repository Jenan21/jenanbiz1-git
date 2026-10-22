import { describe, expect, it } from "vitest";
import { assessOperationalConfidence, operationalConfidenceSchema } from "@/services/analysis-engines/operational-feasibility";
import { operationalInputs, operationalValue } from "./support/operational-feasibility-fixtures";

describe("Operational evidence-only weakest-factor confidence", () => {
  it("caps owner-approved planned operations at MEDIUM, never a success probability", () => {
    const result = assessOperationalConfidence([operationalValue()], operationalInputs(), true)!;
    expect(result.band).toBe("MEDIUM"); expect(result.isProbability).toBe(false); expect(result.factors).toHaveLength(3);
  });
  it("permits HIGH only for complete fresh verified measured observed inputs", () => {
    const value = operationalValue(); value.nature = "OBSERVED";
    expect(assessOperationalConfidence([value], operationalInputs(), true)!.band).toBe("HIGH");
  });
  it.each(["missing", "no-input", "no-operands", "mismatch", "unsupported"] as const)("returns null confidence for %s", (kind) => {
    const value = operationalValue();
    if (kind === "missing") value.value = null;
    if (kind === "mismatch") value.evidence[0]!.checksum = "f".repeat(64);
    expect(assessOperationalConfidence(kind === "no-operands" ? [] : [value], kind === "no-input" ? [] : operationalInputs(), kind !== "unsupported")).toBeNull();
  });
  it.each(["unreviewed", "quality", "unverified", "stale", "unknown-coverage"] as const)("caps %s at LOW", (kind) => {
    const value = operationalValue(); const inputs = operationalInputs();
    if (kind === "unreviewed") { value.approval = "UNREVIEWED"; value.approvedAt = null; value.approvedBy = null; }
    if (kind === "quality") inputs[0]!.quality = { status: "UNAVAILABLE" };
    if (kind === "unverified") inputs[0]!.evidenceStatus = "ESTIMATED";
    if (kind === "stale") inputs[0]!.freshness.status = "STALE";
    if (kind === "unknown-coverage") inputs[0]!.completeness = "UNKNOWN";
    expect(assessOperationalConfidence([value], inputs, true)!.band).toBe("LOW");
  });
  it("retains a real explicit zero as a known operand", () => {
    expect(assessOperationalConfidence([operationalValue("zero", "0")], operationalInputs(), true)!.band).toBe("MEDIUM");
  });
  it("cannot raise the weakest band or duplicate a factor", () => {
    const result = assessOperationalConfidence([operationalValue()], operationalInputs(), true)!;
    expect(operationalConfidenceSchema.safeParse({ ...result, band: "HIGH" }).success).toBe(false);
    result.factors[2] = result.factors[0]!;
    expect(operationalConfidenceSchema.safeParse(result).success).toBe(false);
  });
});
