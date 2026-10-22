import { z } from "zod";
import { EngineError } from "../shared/errors";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { activeAt, competitorTimestampSchema, evidenceSchema, limitationsSchema, normalizeCompetitorEvidence, refKey, sourceRecordRefSchema, validitySchema } from "./model";

export const competitorIdentityLinkSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.identity-link/v1"), id: identifierSchema,
  kind: z.enum(["SAME_ENTITY", "SAME_LOCATION", "LOCATION_OF_ENTITY"]),
  leftRecord: sourceRecordRefSchema, rightRecord: sourceRecordRefSchema,
  canonicalId: identifierSchema.nullable(), certainty: z.enum(["RESOLVED", "AMBIGUOUS", "CONFLICTED"]),
  reason: shortTextSchema, evidence: evidenceSchema, limitations: limitationsSchema, validity: validitySchema,
}).strict()
  .refine((link) => refKey(link.leftRecord) !== refKey(link.rightRecord), "Identity links need two distinct source records")
  .refine((link) => (link.certainty === "RESOLVED") === (link.canonicalId !== null), "Only resolved links carry a canonical identity");

/** Groups only already-declared, evidenced canonical ids. Similar labels never enter this operation. */
export function describeCompetitorIdentity(raw: unknown, asOf: string) {
  const evidence = normalizeCompetitorEvidence(raw);
  competitorTimestampSchema.parse(asOf);
  const assertExclusiveBindings = (rows: ReadonlyArray<{ id: string; refs: z.infer<typeof evidenceSchema> }>) => {
    const owner = new Map<string, string>();
    for (const row of rows) for (const ref of row.refs) {
      const prior = owner.get(refKey(ref));
      if (prior !== undefined && prior !== row.id) throw new EngineError("INVALID_INPUT", { first: "One identity source record claims multiple canonical identities; retain an explicit conflict instead", sourceRecordId: ref.sourceRecordId });
      owner.set(refKey(ref), row.id);
    }
  };
  assertExclusiveBindings(evidence.entities.filter((row) => row.identityState === "RESOLVED").map((row) => ({ id: row.competitorEntityId, refs: row.evidence })));
  assertExclusiveBindings(evidence.locations.filter((row) => row.identityState === "RESOLVED").map((row) => ({ id: row.locationId, refs: row.evidence })));
  const branchBindings = new Map<string, string>();
  for (const row of evidence.locations.filter((location) => location.branchId !== null && location.competitorEntityId !== null)) {
    const branchKey = `${row.competitorEntityId}:${row.branchId}`;
    if (branchBindings.has(branchKey) && branchBindings.get(branchKey) !== row.locationId) throw new EngineError("INVALID_INPUT", { first: "One declared entity branch is assigned multiple canonical location ids" });
    branchBindings.set(branchKey, row.locationId);
  }
  const locations = evidence.locations.filter((row) => activeAt(row.validity, asOf));
  return {
    entities: evidence.entities.filter((row) => activeAt(row.validity, asOf)).map((entity) => ({
      competitorEntityId: entity.competitorEntityId, identityState: entity.identityState,
      locationIds: locations.filter((location) => location.competitorEntityId === entity.competitorEntityId).map((location) => location.locationId),
      evidence: entity.evidence,
    })),
    locations: locations.map((location) => ({
      locationId: location.locationId, branchId: location.branchId, competitorEntityId: location.competitorEntityId,
      identityState: location.identityState, entityLinkState: location.entityLinkState, evidence: location.evidence,
    })),
  };
}
