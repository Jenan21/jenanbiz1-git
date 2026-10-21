import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { COMPETITOR_REQUEST_CONTRACT, competitorRoles, competitorTimestampSchema, countingUnits, definitionRefSchema, ensureSize, relationshipClasses, scopeSchema, sortedText } from "./model";

export const competitorAnalyses = ["IDENTITY_MATCHING", "COUNTS", "DISTRIBUTION", "DIMENSION_COMPARISON", "HISTORICAL_CHANGE", "PROXIMITY_DENSITY", "CANDIDATE_COMPARISON"] as const;
const selectorSchema = z.union([
  z.array(z.object({ versionId: identifierSchema, expectedChecksum: sha256Schema.optional() }).strict()).min(1).max(32),
  z.object({ typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,79}$/), asOf: competitorTimestampSchema.optional() }).strict(),
]);
export const competitorRequestSchema = z.object({
  contract: z.literal(COMPETITOR_REQUEST_CONTRACT), scope: scopeSchema,
  competitorDefinition: definitionRefSchema,
  analyses: z.array(z.enum(competitorAnalyses)).min(1).max(7),
  countingUnits: z.array(z.enum(countingUnits)).min(1).max(2),
  relationships: z.array(z.enum(relationshipClasses)).min(1).max(5),
  activityFilter: z.enum(["ACTIVE_ONLY", "ALL_DOCUMENTED"]),
  data: z.object({ roles: z.partialRecord(z.enum(competitorRoles), selectorSchema) }).strict(),
}).strict().superRefine((request, context) => {
  for (const values of [request.analyses, request.countingUnits, request.relationships]) if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "Repeated requested selections are invalid" });
  let count = 0;
  for (const selector of Object.values(request.data.roles)) {
    count += Array.isArray(selector) ? selector.length : 1;
    if (Array.isArray(selector) && new Set(selector.map((pin) => pin.versionId)).size !== selector.length) context.addIssue({ code: "custom", message: "Duplicate exact pin" });
  }
  if (count > 32) context.addIssue({ code: "custom", message: "At most 32 version selections" });
});
export type CompetitorRequest = z.infer<typeof competitorRequestSchema>;
export function normalizeCompetitorRequest(raw: unknown, evaluatedAt: string) {
  ensureSize(raw); competitorTimestampSchema.parse(evaluatedAt);
  const parsed = competitorRequestSchema.safeParse(raw);
  if (!parsed.success) throw new EngineError("INVALID_INPUT", { first: parsed.error.issues[0]?.message ?? "Invalid Competitor request" });
  const request = parsed.data;
  if (request.analyses.some((analysis) => analysis !== "IDENTITY_MATCHING" && analysis !== "COUNTS")) throw new EngineError("INVALID_INPUT", { first: "The contract reserves later analyses, but M1 enables only identity/matching and count-semantics foundations" });
  if (request.scope.asOf > evaluatedAt) throw new EngineError("INVALID_INPUT", { first: "Future observations are not supported" });
  request.analyses.sort(compareText); request.countingUnits.sort(compareText); request.relationships.sort(compareText);
  for (const selector of Object.values(request.data.roles)) {
    if (Array.isArray(selector)) selector.sort((a, b) => compareText(a.versionId, b.versionId));
    else if (selector.asOf && selector.asOf > evaluatedAt) throw new EngineError("INVALID_INPUT", { first: "Future source selection is invalid" });
  }
  return { normalized: request, evaluatedAt, requestHash: canonicalHash({ normalized: request, evaluatedAt }) };
}
export function countSubjectKey(request: CompetitorRequest, unit: typeof countingUnits[number]) {
  return canonicalHash([request.scope, request.competitorDefinition, unit, sortedText(request.relationships), request.activityFilter]);
}
export const sameDefinition = (a: z.infer<typeof definitionRefSchema>, b: z.infer<typeof definitionRefSchema>) => canonicalize(a) === canonicalize(b);
