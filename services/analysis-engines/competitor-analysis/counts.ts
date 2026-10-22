import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { confidenceBreakdownSchema } from "../shared/confidence";
import { identifierSchema } from "../shared/primitives";
import { calculateCompetitorConfidence, type CompetitorConfidenceBasis } from "./confidence";
import { describeCompetitorIdentity } from "./identity";
import { classifyCompetitorLocations } from "./matching";
import { activeAt, competitorTimestampSchema, countingUnits, definitionRefSchema, evidenceSchema, measurementMethodFor, normalizeCompetitorEvidence, refKey, scopeSchema, sortedText } from "./model";
import { competitorRequestSchema, sameDefinition } from "./request";

export const competitorCoverageSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.coverage/v1"), scope: scopeSchema,
  entityDefinition: definitionRefSchema, inventoryDefinition: definitionRefSchema,
  status: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  evidence: evidenceSchema, inventoryLocationIds: z.array(identifierSchema).max(2_000),
}).strict().refine((coverage) => new Set(coverage.inventoryLocationIds).size === coverage.inventoryLocationIds.length, "Inventory locations must be distinct");
export const competitorCountSemanticsSchema = z.object({
  countingUnit: z.enum(countingUnits),
  status: z.enum(["COMPUTED", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
  value: z.number().int().nonnegative().max(2_000).nullable(),
  observedSubset: z.number().int().positive().max(2_000).nullable(),
  coverageStatus: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  confidence: confidenceBreakdownSchema.nullable(),
  reason: z.string().min(1).max(1000), memberIds: z.array(z.string().min(1)).max(2_000),
}).strict().superRefine((result, context) => {
  if ((result.status === "COMPUTED") !== (result.value !== null) || result.status === "COMPUTED" && (result.coverageStatus !== "COMPLETE" || !result.confidence)) context.addIssue({ code: "custom", message: "Only a complete supported inventory may carry an exact count, including zero" });
  if (result.status !== "COMPUTED" && result.confidence !== null) context.addIssue({ code: "custom", message: "An unavailable total has no confidence" });
  if ((result.status === "PARTIAL") !== (result.observedSubset !== null)) context.addIssue({ code: "custom", message: "PARTIAL labels a positive observed subset, never a zero or inferred total" });
});

/** M1 semantic guard, not the M3 analytics runner. No discovery, geography calculation or store access. */
export function assessCompetitorCount(rawEvidence: unknown, rawRequest: unknown, rawCoverage: unknown, unit: typeof countingUnits[number], evaluatedAt: string) {
  competitorTimestampSchema.parse(evaluatedAt); z.enum(countingUnits).parse(unit);
  const request = competitorRequestSchema.parse(rawRequest);
  if (!request.countingUnits.includes(unit)) throw new Error("Counting unit was not requested");
  if (request.scope.asOf > evaluatedAt) throw new Error("Count asOf cannot exceed evaluation time");
  const evidence = normalizeCompetitorEvidence(rawEvidence);
  describeCompetitorIdentity(evidence, request.scope.asOf);
  const coverage = competitorCoverageSchema.nullable().parse(rawCoverage);
  const result = (status: "COMPUTED" | "PARTIAL" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE", reason: string, memberIds: string[] = [], confidence: z.infer<typeof confidenceBreakdownSchema> | null = null) =>
    competitorCountSemanticsSchema.parse({
      countingUnit: unit, status, value: status === "COMPUTED" ? memberIds.length : null,
      observedSubset: status === "PARTIAL" ? memberIds.length : null,
      coverageStatus: coverage?.status ?? "UNKNOWN", confidence: status === "COMPUTED" ? confidence : null, reason, memberIds,
    });
  if (!coverage) return result("NOT_AVAILABLE", "A documented inventory scope is missing");
  if (canonicalize(coverage.scope) !== canonicalize(request.scope) || !sameDefinition(coverage.entityDefinition, request.competitorDefinition) || coverage.status === "NONE") return result("NO_COVERAGE", "Coverage does not establish the requested scope, time and entity definition");
  const records = new Set(evidence.sourceRecords.map(refKey));
  if (coverage.evidence.some((ref) => !records.has(refKey(ref)))) throw new Error("Coverage evidence is unresolved");
  const coverageRecords = evidence.sourceRecords.filter((record) => coverage.evidence.some((ref) => refKey(ref) === refKey(record)));
  if (coverageRecords.some((record) => !activeAt(record.validity, request.scope.asOf))) return result("NO_COVERAGE", "Inventory attestation is not valid at the requested time");
  if (!coverage.evidence.some((ref) => evidence.inputs.find((input) => input.id === ref.inputId)?.roles.includes("competitor.locations"))) return result("NOT_COMPUTABLE", "A competitor-location inventory source must attest the declared universe");
  if (request.scope.segment !== null) return result("NOT_COMPUTABLE", "Segment membership needs a documented segment contract; no broad activity fallback");
  const locations = evidence.locations.filter((location) => activeAt(location.validity, request.scope.asOf) && canonicalize(location.geography) === canonicalize(request.scope.geography));
  if (canonicalize(sortedText(coverage.inventoryLocationIds)) !== canonicalize(sortedText(locations.map((location) => location.locationId)))) return result("NOT_COMPUTABLE", "Declared inventory enumeration differs from the supplied in-scope locations");
  const eligible = locations.filter((location) => request.activityFilter !== "ACTIVE_ONLY" || location.operationalState === "ACTIVE");
  if (request.activityFilter === "ACTIVE_ONLY" && locations.some((location) => location.operationalState === "UNKNOWN" || location.operationalState === "CONFLICTED")) return result("NOT_COMPUTABLE", "Unknown operational activity cannot establish a complete active-competitor total");
  const allMatches = new Map(classifyCompetitorLocations(evidence, request.scope, evaluatedAt).map((match) => [match.locationId, match]));
  const matches = eligible.map((location) => allMatches.get(location.locationId)!);
  if (matches.some((match) => match.relationship === "UNKNOWN")) return result("NOT_COMPUTABLE", "Unknown or ambiguous matching cannot establish an exact included/excluded inventory");
  const included = eligible.filter((location, index) => request.relationships.includes(matches[index]!.relationship));
  if (included.some((location) => location.identityState !== "RESOLVED")) return result("NOT_COMPUTABLE", "Location identity is not established; source records cannot be counted as branches");
  if (unit === "UNIQUE_COMPETITOR_ENTITIES" && included.some((location) => location.entityLinkState !== "RESOLVED"
    || evidence.entities.find((entity) => entity.competitorEntityId === location.competitorEntityId)?.identityState !== "RESOLVED")) return result("NOT_COMPUTABLE", "Unresolved entity links do not become one unique business per location");
  if (unit === "UNIQUE_COMPETITOR_ENTITIES" && included.some((location) => !sameDefinition(evidence.entities.find((entity) => entity.competitorEntityId === location.competitorEntityId)!.definition, request.competitorDefinition))) return result("NOT_COMPUTABLE", "Entity counting definitions are incompatible");
  const ids = sortedText(included.map((location) => unit === "COMPETITOR_LOCATIONS" ? location.locationId : location.competitorEntityId!));
  const inputs = evidence.inputs;
  if (!inputs.length) return result("NOT_AVAILABLE", "No source descriptors establish an inventory");
  const partial = coverage.status !== "COMPLETE" || inputs.some((input) => input.completeness !== "INVENTORY");
  const bases: CompetitorConfidenceBasis[] = inputs.map((input) => ({
    input, analysisUsage: evidence.permissions.find((permission) => permission.inputId === input.id && activeAt(permission.validity, evaluatedAt))?.analysisUsage ?? "NOT_VERIFIED",
    identity: "RESOLVED", match: "SUPPORTED", coverage: partial ? "PARTIAL" : "COMPLETE",
    method: measurementMethodFor(evidence.sourceRecords.filter((record) => record.inputId === input.id)),
    provenance: "DOCUMENTED", upstreamConfidence: null,
  }));
  const confidence = calculateCompetitorConfidence(bases, evaluatedAt).confidence;
  if (!confidence) return result("NOT_COMPUTABLE", "Rights, freshness, provenance or method do not support use");
  if (partial) return ids.length ? result("PARTIAL", "Observed subset only; the scoped competitor total is unknown", ids) : result("NO_COVERAGE", "Incomplete evidence cannot prove zero competitors");
  return result("COMPUTED", "Exact total within the explicitly evidenced inventory and inclusion rules; not sales or market share", ids, confidence);
}
