import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { minBand, type ConfidenceBand } from "../shared/states";
import { financialAssumptionSchema, financialInputSchema, type FinancialAssumption, type FinancialInput } from "./model";

export const financialConfidencePolicy = {
  id: "financial-confidence-v1", version: "1.0.0", kind: "EVIDENCE_QUALITY_BANDS", isProbability: false,
  rules: [
    "Missing, incompatible or incomplete essential inputs have no metric confidence.",
    "Base HIGH requires VERIFIED evidence, inventory completeness, fresh sources and measured quality >=0.8 for every essential input.",
    "Measured source quality <0.8 or unmeasured/unverified evidence caps at LOW.",
    "Partial/unknown completeness or nonfresh evidence caps at LOW.",
    "Owner-approved declared projections cap at MEDIUM; unreviewed assumptions cap at LOW.",
    "Derived confidence never exceeds the weakest required input; it is not project success or forecast accuracy.",
  ],
} as const;
export const financialConfidenceSchema = z.object({
  policyId: z.literal(financialConfidencePolicy.id), policyVersion: z.literal(financialConfidencePolicy.version),
  kind: z.literal(financialConfidencePolicy.kind), isProbability: z.literal(false),
  band: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]),
  factors: z.array(z.object({
    key: z.enum(["SOURCE_EVIDENCE", "COMPLETENESS_FRESHNESS", "ASSUMPTION_REVIEW"]),
    band: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]), explanation: z.string().min(1).max(500),
  }).strict()).length(3),
}).strict().superRefine((confidence, context) => {
  if (new Set(confidence.factors.map((factor) => factor.key)).size !== 3
    || confidence.band !== confidence.factors.reduce<ConfidenceBand>((band, factor) => minBand(band, factor.band), "HIGH")) {
    context.addIssue({ code: "custom", message: "Confidence must retain three distinct factors and equal their weakest band" });
  }
});
export function assessFinancialConfidence(assumptions: readonly FinancialAssumption[], inputs: readonly FinancialInput[], blocked: boolean) {
  assumptions.forEach((entry) => financialAssumptionSchema.parse(entry));
  inputs.forEach((entry) => financialInputSchema.parse(entry));
  if (blocked || !inputs.length || assumptions.some((assumption) => assumption.value === null)) return null;
  if (assumptions.some((assumption) => assumption.evidence.some((ref) =>
    !inputs.some((input) => input.id === ref.inputId && input.ref.id === ref.versionId && input.checksum?.value === ref.checksum)))) return null;
  const source: ConfidenceBand = inputs.every((input) => input.evidenceStatus === "VERIFIED" && input.quality.status === "MEASURED" && input.quality.score >= 0.8) ? "HIGH" : "LOW";
  const coverage: ConfidenceBand = inputs.every((input) => input.completeness === "INVENTORY" && input.freshness.status === "FRESH") ? "HIGH" : "LOW";
  const approval: ConfidenceBand = assumptions.some((assumption) => assumption.approval === "UNREVIEWED") ? "LOW"
    : assumptions.some((assumption) => assumption.evidenceNature === "DECLARED_ASSUMPTION") ? "MEDIUM" : "HIGH";
  return financialConfidenceSchema.parse({
    policyId: financialConfidencePolicy.id, policyVersion: financialConfidencePolicy.version, kind: financialConfidencePolicy.kind, isProbability: false,
    band: minBand(source, minBand(coverage, approval)),
    factors: [
      { key: "SOURCE_EVIDENCE", band: source, explanation: financialConfidencePolicy.rules[1] },
      { key: "COMPLETENESS_FRESHNESS", band: coverage, explanation: financialConfidencePolicy.rules[3] },
      { key: "ASSUMPTION_REVIEW", band: approval, explanation: financialConfidencePolicy.rules[4] },
    ],
  });
}
export function financialConfidenceMatches(
  value: unknown, assumptions: readonly FinancialAssumption[], inputs: readonly FinancialInput[], blocked: boolean,
) { return canonicalize(value) === canonicalize(assessFinancialConfidence(assumptions, inputs, blocked)); }
