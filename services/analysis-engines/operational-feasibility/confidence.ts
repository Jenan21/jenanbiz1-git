import { z } from "zod";
import { minBand, type ConfidenceBand } from "../shared/states";
import { operationalInputSchema, operationalValueSchema, type OperationalInput, type OperationalValue } from "./model";

export const operationalConfidencePolicy = {
  id: "operational-confidence-v1", version: "1.0.0", kind: "EVIDENCE_QUALITY_BANDS", isProbability: false,
  rules: [
    "Missing operands, no essential inputs or incompatible method have null confidence.",
    "Every essential source must be VERIFIED with measured quality >=0.8 for HIGH source evidence; otherwise LOW.",
    "Every essential input must be complete inventory and FRESH for HIGH coverage; otherwise LOW.",
    "Any unreviewed operand caps at LOW; approved declared plans cap at MEDIUM; observed evidence may reach HIGH.",
    "The weakest factor determines the band, never project success, readiness or forecast accuracy.",
  ],
} as const;
const bands = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"] as const;
export const operationalConfidenceSchema = z.object({
  policyId: z.literal(operationalConfidencePolicy.id), policyVersion: z.literal(operationalConfidencePolicy.version),
  kind: z.literal(operationalConfidencePolicy.kind), isProbability: z.literal(false), band: z.enum(bands),
  factors: z.array(z.object({
    key: z.enum(["SOURCE_EVIDENCE", "COVERAGE_FRESHNESS", "ASSUMPTION_REVIEW"]),
    band: z.enum(bands), explanation: z.string().min(1).max(500),
  }).strict()).length(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.factors.map((f) => f.key)).size !== 3
    || value.band !== value.factors.reduce<ConfidenceBand>((band, f) => minBand(band, f.band), "HIGH")) context.addIssue({ code: "custom", message: "Confidence must equal three distinct factors' weakest band" });
});
export function assessOperationalConfidence(values: readonly OperationalValue[], inputs: readonly OperationalInput[], methodCompatible: boolean) {
  values.forEach((v) => operationalValueSchema.parse(v)); inputs.forEach((i) => operationalInputSchema.parse(i));
  if (!methodCompatible || !values.length || !inputs.length || values.some((v) => v.value === null)) return null;
  if (values.some((v) => v.evidence.some((ref) => !inputs.some((input) => input.id === ref.inputId
    && input.ref.id === ref.versionId && input.checksum?.value === ref.checksum)))) return null;
  const source: ConfidenceBand = inputs.every((i) => i.evidenceStatus === "VERIFIED" && i.quality.status === "MEASURED" && i.quality.score >= 0.8) ? "HIGH" : "LOW";
  const coverage: ConfidenceBand = inputs.every((i) => i.completeness === "INVENTORY" && i.freshness.status === "FRESH") ? "HIGH" : "LOW";
  const review: ConfidenceBand = values.some((v) => v.approval === "UNREVIEWED") ? "LOW" : values.some((v) => v.nature === "DECLARED_ASSUMPTION") ? "MEDIUM" : "HIGH";
  return operationalConfidenceSchema.parse({
    policyId: operationalConfidencePolicy.id, policyVersion: operationalConfidencePolicy.version,
    kind: operationalConfidencePolicy.kind, isProbability: false, band: minBand(source, minBand(coverage, review)),
    factors: [
      { key: "SOURCE_EVIDENCE", band: source, explanation: operationalConfidencePolicy.rules[1] },
      { key: "COVERAGE_FRESHNESS", band: coverage, explanation: operationalConfidencePolicy.rules[2] },
      { key: "ASSUMPTION_REVIEW", band: review, explanation: operationalConfidencePolicy.rules[3] },
    ],
  });
}
