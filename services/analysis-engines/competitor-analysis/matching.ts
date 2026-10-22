import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { confidenceBreakdownSchema } from "../shared/confidence";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { calculateCompetitorConfidence, type CompetitorConfidenceBasis } from "./confidence";
import { activeAt, competitorTimestampSchema, definitionRefSchema, evidenceSchema, limitationsSchema, measurementMethodFor, normalizeCompetitorEvidence, refKey, relationshipClasses, scopeSchema, sortedEvidence, sortedText, type CompetitorEvidence, type CompetitorLocation, type CompetitorScope } from "./model";
import { sameDefinition } from "./request";

export const competitorMatchSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.match/v1"),
  locationId: identifierSchema, competitorEntityId: identifierSchema.nullable(),
  scope: scopeSchema,
  targetActivity: scopeSchema.shape.activity, relationship: z.enum(relationshipClasses),
  evidenceState: z.enum(["SUPPORTED", "AMBIGUOUS", "INSUFFICIENT"]),
  ruleRefs: z.array(definitionRefSchema).max(100),
  reason: shortTextSchema, evidence: evidenceSchema, confidence: confidenceBreakdownSchema.nullable(),
  limitations: limitationsSchema,
}).strict().superRefine((match, context) => {
  if (match.relationship !== "UNKNOWN" && (match.evidenceState !== "SUPPORTED" || !match.ruleRefs.length || !match.confidence)) {
    context.addIssue({ code: "custom", message: "A classified relationship needs a supported rule, evidence and confidence" });
  }
  if (match.relationship === "UNKNOWN" && match.evidenceState === "SUPPORTED") context.addIssue({ code: "custom", message: "UNKNOWN is not a supported classification" });
});
export type CompetitorMatch = z.infer<typeof competitorMatchSchema>;

function classify(evidence: CompetitorEvidence, location: CompetitorLocation, scope: CompetitorScope, evaluatedAt: string): CompetitorMatch {
  const rules = evidence.rules.filter((rule) => sameDefinition(rule.targetActivity, scope.activity)
    && sameDefinition(rule.activityTaxonomy, location.activityTaxonomy)
    && (!["DIRECT", "INDIRECT"].includes(rule.relationship) || location.activitySpecificity === "SPECIFIC")
    && activeAt(rule.validity, scope.asOf) && rule.requiredActivityCodes.every((code) => location.activityCodes.includes(code)));
  const eligible = activeAt(location.validity, scope.asOf) && canonicalize(location.geography) === canonicalize(scope.geography) && scope.segment === null;
  const relationships = new Set(rules.map((rule) => rule.relationship));
  const candidate = eligible && relationships.size === 1 ? rules[0]!.relationship : "UNKNOWN";
  const refs = sortedEvidence([...location.evidence, ...rules.flatMap((rule) => rule.evidence)]);
  const recordMap = new Map(evidence.sourceRecords.map((row) => [refKey(row), row]));
  const datesValid = refs.every((ref) => activeAt(recordMap.get(refKey(ref))!.validity, scope.asOf));
  const basis: CompetitorConfidenceBasis[] = sortedText(refs.map((ref) => ref.inputId)).map((id) => ({
    input: evidence.inputs.find((input) => input.id === id)!,
    analysisUsage: evidence.permissions.find((permission) => permission.inputId === id && activeAt(permission.validity, evaluatedAt))?.analysisUsage ?? "NOT_VERIFIED",
    identity: location.identityState, match: candidate === "UNKNOWN" ? relationships.size > 1 ? "AMBIGUOUS" : "INSUFFICIENT" : "SUPPORTED",
    coverage: eligible ? "COMPLETE" : "NONE",
    method: measurementMethodFor(refs.filter((ref) => ref.inputId === id).map((ref) => recordMap.get(refKey(ref))!)),
    provenance: datesValid ? "DOCUMENTED" : "MISSING", upstreamConfidence: null,
  }));
  const confidence = calculateCompetitorConfidence(basis, evaluatedAt).confidence;
  const relationship = confidence === null ? "UNKNOWN" : candidate;
  return competitorMatchSchema.parse({
    contract: "jenan.competitor-analysis.match/v1", locationId: location.locationId, competitorEntityId: location.competitorEntityId,
    targetActivity: scope.activity, scope, relationship,
    evidenceState: relationship === "UNKNOWN" ? relationships.size > 1 ? "AMBIGUOUS" : "INSUFFICIENT" : "SUPPORTED",
    ruleRefs: rules.map((rule) => rule.rule),
    reason: relationship !== "UNKNOWN" ? rules[0]!.reason
      : !eligible ? "Location does not establish the requested geographic/time scope" : relationships.size > 1 ? "Applicable source-backed rules disagree" : "No eligible supported classification can be established",
    evidence: refs, confidence,
    limitations: sortedText([...location.limitations, ...rules.flatMap((rule) => rule.limitations),
      ...(relationship === "UNKNOWN" ? ["Relationship is unknown; no inference from name, proximity or missing rules"] : [])]),
  });
}
function prepared(rawEvidence: unknown, rawScope: unknown, evaluatedAt: string) {
  const evidence = normalizeCompetitorEvidence(rawEvidence); const scope = scopeSchema.parse(rawScope);
  competitorTimestampSchema.parse(evaluatedAt);
  if (scope.asOf > evaluatedAt) throw new Error("Matching asOf cannot exceed evaluation time");
  return { evidence, scope };
}
/** Evaluates explicit versioned rules only; a name or distance is never a matching input. */
export function classifyCompetitorLocation(rawEvidence: unknown, locationId: string, rawScope: unknown, evaluatedAt: string): CompetitorMatch {
  const { evidence, scope } = prepared(rawEvidence, rawScope, evaluatedAt);
  const location = evidence.locations.find((row) => row.locationId === locationId);
  if (!location) throw new Error("Matching location is unresolved");
  return classify(evidence, location, scope, evaluatedAt);
}
export function classifyCompetitorLocations(rawEvidence: unknown, rawScope: unknown, evaluatedAt: string): CompetitorMatch[] {
  const { evidence, scope } = prepared(rawEvidence, rawScope, evaluatedAt);
  return evidence.locations.map((location) => classify(evidence, location, scope, evaluatedAt));
}
