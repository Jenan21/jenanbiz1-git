import { z } from "zod";
import { compareText } from "./canonical";
import { bilingualSchema, codeSchema, identifierSchema, type Bilingual } from "./primitives";
import { cappingBands, confidenceBands, minBand, type CappingBand, type ConfidenceBand } from "./states";

/**
 * Explainable heuristic confidence.
 *
 * It is a quality indicator for the data a measurement rests on: a sum of points granted by documented rules, mapped to a
 * band by documented thresholds, and lowered by documented caps. It is NOT a probability, a success rate or a forecast, and
 * nothing here may be presented as one. Every result carries the policy id and version, the points of each factor and every
 * cap that applied, so the number can be re-derived by hand from the stored inputs.
 */
export const CONFIDENCE_KIND = "EXPLAINABLE_HEURISTIC" as const;
export const CONFIDENCE_SCALE = "POINTS_100" as const;
export const CONFIDENCE_TOTAL_POINTS = 100;

const policyIdSchema = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/, "Lower-case policy id such as spatial-confidence-v1");
const policyVersionSchema = z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/, "Semantic version such as 1.0.0");
const factorKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{1,39}$/, "camelCase factor key");

export const bandThresholdsSchema = z.object({
  high: z.number().int().min(3).max(100),
  medium: z.number().int().min(2).max(99),
  low: z.number().int().min(1).max(98),
}).strict().refine((thresholds) => thresholds.high > thresholds.medium && thresholds.medium > thresholds.low, "Thresholds need high > medium > low");
export type BandThresholds = z.infer<typeof bandThresholdsSchema>;

/** Band reached by points alone, before any cap. */
export function bandForScore(score: number, thresholds: BandThresholds): ConfidenceBand {
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  if (score >= thresholds.low) return "LOW";
  return "INSUFFICIENT";
}

export const confidenceFactorSchema = z.object({
  key: factorKeySchema,
  maxPoints: z.number().int().min(1).max(100),
  points: z.number().int().min(0).max(100),
  // The input that determined the points (the weakest one); null when the factor does not depend on a single input.
  inputId: identifierSchema.nullable(),
  explanation: bilingualSchema,
}).strict().refine((factor) => factor.points <= factor.maxPoints, "A factor cannot exceed its maximum points");
export type ConfidenceFactor = z.infer<typeof confidenceFactorSchema>;

export const confidenceCapSchema = z.object({ code: codeSchema, maxBand: z.enum(cappingBands), reason: bilingualSchema }).strict();
export type ConfidenceCap = z.infer<typeof confidenceCapSchema>;

const confidenceBreakdownObject = z.object({
  policyId: policyIdSchema,
  policyVersion: policyVersionSchema,
  kind: z.literal(CONFIDENCE_KIND),
  scale: z.literal(CONFIDENCE_SCALE),
  score: z.number().int().min(0).max(100),
  thresholds: bandThresholdsSchema,
  scoreBand: z.enum(confidenceBands),
  band: z.enum(confidenceBands),
  factors: z.array(confidenceFactorSchema).min(1).max(12),
  caps: z.array(confidenceCapSchema).max(12),
}).strict();
export type ConfidenceBreakdown = z.infer<typeof confidenceBreakdownObject>;

/** Internal-consistency problems of a breakdown: the stored number must follow from the stored factors, thresholds and caps. */
export function findConfidenceViolations(breakdown: ConfidenceBreakdown): string[] {
  const problems: string[] = [];
  const points = breakdown.factors.reduce((sum, factor) => sum + factor.points, 0);
  if (points !== breakdown.score) problems.push(`The factor points add up to ${points}, not the score ${breakdown.score}`);
  const maximum = breakdown.factors.reduce((sum, factor) => sum + factor.maxPoints, 0);
  if (maximum !== CONFIDENCE_TOTAL_POINTS) problems.push(`The factor maxima add up to ${maximum}, not ${CONFIDENCE_TOTAL_POINTS}`);
  if (new Set(breakdown.factors.map((factor) => factor.key)).size !== breakdown.factors.length) problems.push("Factor keys must be unique");
  if (breakdown.scoreBand !== bandForScore(breakdown.score, breakdown.thresholds)) problems.push("scoreBand does not follow from the score and the thresholds");
  const codes = breakdown.caps.map((cap) => cap.code);
  if (new Set(codes).size !== codes.length) problems.push("Cap codes must be unique");
  if (codes.join("|") !== [...codes].sort(compareText).join("|")) problems.push("Caps must be sorted by code");
  const expectedBand = breakdown.caps.reduce<ConfidenceBand>((band, cap) => minBand(band, cap.maxBand), breakdown.scoreBand);
  if (breakdown.band !== expectedBand) problems.push(`band must be ${expectedBand}: the weaker of the score band and every cap`);
  return problems;
}

export const confidenceBreakdownSchema = confidenceBreakdownObject.superRefine((breakdown, context) => {
  for (const message of findConfidenceViolations(breakdown)) context.addIssue({ code: "custom", message });
});

export const confidencePolicyDescriptorSchema = z.object({
  id: policyIdSchema,
  version: policyVersionSchema,
  kind: z.literal(CONFIDENCE_KIND),
  scale: z.literal(CONFIDENCE_SCALE),
  isProbability: z.literal(false),
  thresholds: bandThresholdsSchema,
  factors: z.array(z.object({ key: factorKeySchema, maxPoints: z.number().int().min(1).max(100), description: bilingualSchema }).strict()).min(1).max(12),
  caps: z.array(z.object({ code: codeSchema, maxBand: z.enum(cappingBands), appliesWhen: bilingualSchema }).strict()).max(12),
  methodology: bilingualSchema,
  disclaimer: bilingualSchema,
}).strict().superRefine((policy, context) => {
  const maximum = policy.factors.reduce((sum, factor) => sum + factor.maxPoints, 0);
  if (maximum !== CONFIDENCE_TOTAL_POINTS) context.addIssue({ code: "custom", message: `Factor weights add up to ${maximum}, not ${CONFIDENCE_TOTAL_POINTS}` });
  if (new Set(policy.factors.map((factor) => factor.key)).size !== policy.factors.length) context.addIssue({ code: "custom", message: "Factor keys must be unique" });
  if (new Set(policy.caps.map((cap) => cap.code)).size !== policy.caps.length) context.addIssue({ code: "custom", message: "Cap codes must be unique" });
});
export type ConfidencePolicyDescriptor = z.infer<typeof confidencePolicyDescriptorSchema>;

/** A stored breakdown must be the one its policy would produce: same factors and weights, same thresholds, only declared caps. */
export function findBreakdownPolicyViolations(breakdown: ConfidenceBreakdown, policy: ConfidencePolicyDescriptor): string[] {
  const problems: string[] = [];
  if (breakdown.policyId !== policy.id || breakdown.policyVersion !== policy.version) problems.push("The breakdown does not belong to this policy version");
  if (breakdown.thresholds.high !== policy.thresholds.high || breakdown.thresholds.medium !== policy.thresholds.medium || breakdown.thresholds.low !== policy.thresholds.low) problems.push("The breakdown thresholds differ from the policy");
  const declared = new Map(policy.factors.map((factor) => [factor.key, factor.maxPoints]));
  if (breakdown.factors.length !== declared.size || breakdown.factors.some((factor) => declared.get(factor.key) !== factor.maxPoints)) problems.push("The breakdown factors or weights differ from the policy");
  const declaredCaps = new Map(policy.caps.map((cap) => [cap.code, cap.maxBand]));
  for (const cap of breakdown.caps) if (declaredCaps.get(cap.code) !== cap.maxBand) problems.push(`Cap ${cap.code} is not declared by the policy`);
  return problems;
}

export interface ConfidencePolicyBasis { id: string; version: string; thresholds: BandThresholds }
export interface ConfidenceFactorInput { key: string; maxPoints: number; points: number; inputId: string | null; explanation: Bilingual }
export interface ConfidenceCapInput { code: string; maxBand: CappingBand; reason: Bilingual }

/** Assembles a breakdown whose score, score band and band follow from its parts; duplicate caps collapse to one. */
export function buildConfidenceBreakdown(policy: ConfidencePolicyBasis, factors: readonly ConfidenceFactorInput[], caps: readonly ConfidenceCapInput[]): ConfidenceBreakdown {
  const score = factors.reduce((sum, factor) => sum + factor.points, 0);
  const scoreBand = bandForScore(score, policy.thresholds);
  const uniqueCaps = [...new Map(caps.map((cap) => [cap.code, cap])).values()].sort((first, second) => compareText(first.code, second.code));
  const band = uniqueCaps.reduce<ConfidenceBand>((current, cap) => minBand(current, cap.maxBand), scoreBand);
  return {
    policyId: policy.id, policyVersion: policy.version, kind: CONFIDENCE_KIND, scale: CONFIDENCE_SCALE, score,
    thresholds: { high: policy.thresholds.high, medium: policy.thresholds.medium, low: policy.thresholds.low },
    scoreBand, band,
    factors: factors.map((factor) => ({ key: factor.key, maxPoints: factor.maxPoints, points: factor.points, inputId: factor.inputId, explanation: factor.explanation })),
    caps: uniqueCaps.map((cap) => ({ code: cap.code, maxBand: cap.maxBand, reason: cap.reason })),
  };
}
