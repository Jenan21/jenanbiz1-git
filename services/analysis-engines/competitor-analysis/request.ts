import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { attributeBasisSchema, COMPETITOR_REQUEST_CONTRACT, competitorRoles, competitorTimestampSchema, countingUnits, definitionRefSchema, ensureSize, relationshipClasses, scopeSchema, sortedText } from "./model";

export const competitorAnalyses = ["IDENTITY_MATCHING", "COUNTS", "DISTRIBUTION", "DIMENSION_COMPARISON", "HISTORICAL_CHANGE", "PROXIMITY_DENSITY", "CANDIDATE_COMPARISON"] as const;
export const competitorSelectorSchema = z.union([
  z.array(z.object({ versionId: identifierSchema, expectedChecksum: sha256Schema.optional() }).strict()).min(1).max(32),
  z.object({ typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/), asOf: competitorTimestampSchema.optional() }).strict(),
]);
const rolesSchema = z.partialRecord(z.enum(competitorRoles), competitorSelectorSchema);
export const competitorParametersSchema = z.object({
  attributes: z.array(z.object({
    id: identifierSchema, subjectKind: z.enum(["ENTITY", "LOCATION"]),
    definition: definitionRefSchema, unit: definitionRefSchema, basis: attributeBasisSchema,
  }).strict()).max(20).optional(),
  historical: z.object({ asOf: competitorTimestampSchema, roles: rolesSchema }).strict().optional(),
  candidates: z.array(z.object({ id: identifierSchema, geography: scopeSchema.shape.geography }).strict()).max(20).optional(),
}).strict();
export const competitorRequestSchema = z.object({
  contract: z.literal(COMPETITOR_REQUEST_CONTRACT), scope: scopeSchema,
  competitorDefinition: definitionRefSchema,
  analyses: z.array(z.enum(competitorAnalyses)).min(1).max(7),
  countingUnits: z.array(z.enum(countingUnits)).min(1).max(2),
  relationships: z.array(z.enum(relationshipClasses)).min(1).max(5),
  activityFilter: z.enum(["ACTIVE_ONLY", "ALL_DOCUMENTED"]),
  data: z.object({ roles: rolesSchema }).strict(),
  parameters: competitorParametersSchema.optional(),
}).strict().superRefine((request, context) => {
  for (const values of [request.analyses, request.countingUnits, request.relationships]) if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "Repeated requested selections are invalid" });
  let count = 0;
  for (const selector of [...Object.values(request.data.roles), ...Object.values(request.parameters?.historical?.roles ?? {})]) {
    count += Array.isArray(selector) ? selector.length : 1;
    if (Array.isArray(selector) && new Set(selector.map((pin) => pin.versionId)).size !== selector.length) context.addIssue({ code: "custom", message: "Duplicate exact pin" });
  }
  if (count > 32) context.addIssue({ code: "custom", message: "At most 32 version selections" });
  for (const rows of [request.parameters?.attributes, request.parameters?.candidates]) {
    if (rows && new Set(rows.map((row) => row.id)).size !== rows.length) context.addIssue({ code: "custom", message: "Repeated parameter identity" });
  }
});
export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;
export function normalizeCompetitorRequest(raw: unknown, evaluatedAt: string) {
  ensureSize(raw); competitorTimestampSchema.parse(evaluatedAt);
  const parsed = competitorRequestSchema.safeParse(raw);
  if (!parsed.success) throw new EngineError("INVALID_INPUT", { first: parsed.error.issues[0]?.message ?? "Invalid Competitor request" });
  const request = parsed.data;
  if (request.scope.asOf > evaluatedAt) throw new EngineError("INVALID_INPUT", { first: "Future observations are not supported" });
  if (request.parameters?.historical && request.parameters.historical.asOf >= request.scope.asOf) throw new EngineError("INVALID_INPUT", { first: "Historical baseline must precede the current snapshot" });
  if (request.parameters?.attributes?.some((attribute) => attribute.basis.observationWindow.end > request.scope.asOf)) throw new EngineError("INVALID_INPUT", { first: "Attribute observation window exceeds the requested snapshot" });
  request.analyses.sort(compareText); request.countingUnits.sort(compareText); request.relationships.sort(compareText);
  for (const selector of Object.values(request.data.roles)) {
    if (Array.isArray(selector)) selector.sort((a, b) => compareText(a.versionId, b.versionId));
    else if (selector.asOf && selector.asOf > evaluatedAt) throw new EngineError("INVALID_INPUT", { first: "Future source selection is invalid" });
  }
  for (const rows of [request.parameters?.attributes, request.parameters?.candidates]) rows?.sort((a, b) => compareText(a.id, b.id));
  for (const selector of Object.values(request.parameters?.historical?.roles ?? {})) {
    if (Array.isArray(selector)) selector.sort((a, b) => compareText(a.versionId, b.versionId));
    else if (selector.asOf && selector.asOf > evaluatedAt) throw new EngineError("INVALID_INPUT", { first: "Future historical source selection" });
  }
  if (request.parameters?.attributes?.length && !request.analyses.includes("DIMENSION_COMPARISON")
    || request.parameters?.historical && !request.analyses.includes("HISTORICAL_CHANGE")
    || request.parameters?.candidates?.length && !request.analyses.includes("CANDIDATE_COMPARISON")) throw new EngineError("INVALID_INPUT", { first: "Parameters require their corresponding analysis" });
  return { normalized: request, evaluatedAt, requestHash: canonicalHash({ normalized: request, evaluatedAt }) };
}
export function countSubjectKey(request: CompetitorRequest, unit: typeof countingUnits[number]) {
  return canonicalHash([request.scope, request.competitorDefinition, unit, sortedText(request.relationships), request.activityFilter]);
}
export const sameDefinition = (a: z.infer<typeof definitionRefSchema>, b: z.infer<typeof definitionRefSchema>) => canonicalize(a) === canonicalize(b);
