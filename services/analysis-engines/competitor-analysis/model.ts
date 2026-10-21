import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { engineInputSchema, type EngineInput } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { identifierSchema, shortTextSchema, timestampSchema } from "../shared/primitives";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { quantityDimensionsSchema } from "../shared/quantities";

export const COMPETITOR_REQUEST_CONTRACT = "jenan.competitor-analysis.request/v1";
export const COMPETITOR_RESULT_CONTRACT = "jenan.competitor-analysis.result/v1";
export const COMPETITOR_VERSION = "1.0.0-m1";
export const competitorTimestampSchema = timestampSchema.regex(/\.\d{3}Z$/, "Use canonical UTC millisecond timestamps; precision is never silently rounded");
export const hasCanonicalInputDates = (input: EngineInput) => [input.freshness.sourcePublishedAt, input.freshness.expiresAt,
  input.quality.status === "UNAVAILABLE" ? null : input.quality.measuredAt].every((value) => value === null || competitorTimestampSchema.safeParse(value).success);
export const competitorRoles = ["competitor.entities", "competitor.locations", "competitor.attributes", "competitor.identity-links", "competitor.matching-rules", "competitor.dimensions"] as const;
export const competitorTypeKeys = ["competitor-entities", "competitor-locations", "competitor-attributes", "competitor-identity-links", "competitor-matching-rules", "competitor-dimensions"] as const;
export const relationshipClasses = ["DIRECT", "INDIRECT", "POTENTIAL", "NOT_COMPARABLE", "UNKNOWN"] as const;
export const identityStates = ["RESOLVED", "SEPARATE_UNVERIFIED", "AMBIGUOUS", "CONFLICTED"] as const;
export const countingUnits = ["UNIQUE_COMPETITOR_ENTITIES", "COMPETITOR_LOCATIONS"] as const;
export const definitionRefSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const attributeBasisSchema = z.object({
  product: definitionRefSchema, quantityBasis: definitionRefSchema,
  currency: identifierSchema.nullable(), taxBasis: definitionRefSchema, deliveryBasis: definitionRefSchema,
  observationWindow: z.object({ start: competitorTimestampSchema, end: competitorTimestampSchema }).strict()
    .refine((window) => window.start < window.end, "Observation window must be nonempty"),
}).strict();
export const canonicalIdentitySchema = identifierSchema.refine((id) => id.includes(":"), "Canonical identity ids must declare a namespace");
export const scopeSchema = z.object({
  geography: quantityDimensionsSchema.shape.geography,
  activity: z.object({ taxonomy: identifierSchema, id: identifierSchema, version: identifierSchema }).strict(),
  segment: definitionRefSchema.nullable(), asOf: competitorTimestampSchema,
}).strict();
export const sourceRecordRefSchema = z.object({
  inputId: identifierSchema, sourceNamespace: identifierSchema, sourceRecordId: identifierSchema,
}).strict();
export const validitySchema = z.object({ start: competitorTimestampSchema, end: competitorTimestampSchema.nullable() }).strict()
  .refine((value) => value.end === null || value.start < value.end, "Validity is a nonempty half-open interval");
export const evidenceSchema = z.array(sourceRecordRefSchema).min(1).max(64);
export const limitationsSchema = z.array(shortTextSchema).max(10);
const identityShape = {
  identityState: z.enum(identityStates), identityReason: shortTextSchema,
  identityMethod: z.enum(["AUTHORITATIVE_IDENTIFIER", "EXPLICIT_SOURCE_LINK", "UNRESOLVED"]),
  evidence: evidenceSchema, limitations: limitationsSchema, validity: validitySchema,
};
export const competitorEntitySchema = z.object({
  contract: z.literal("jenan.competitor-analysis.entity/v1"), competitorEntityId: canonicalIdentitySchema,
  definition: definitionRefSchema, label: shortTextSchema, ...identityShape,
}).strict();
export const competitorLocationSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.location/v1"), locationId: canonicalIdentitySchema,
  branchId: identifierSchema.nullable(), competitorEntityId: canonicalIdentitySchema.nullable(),
  entityLinkState: z.enum(["RESOLVED", "UNKNOWN", "AMBIGUOUS", "CONFLICTED"]),
  entityLinkEvidence: z.array(sourceRecordRefSchema).max(64),
  geography: scopeSchema.shape.geography, activityCodes: z.array(identifierSchema).max(32),
  activityTaxonomy: definitionRefSchema, activitySpecificity: z.enum(["SPECIFIC", "BROAD", "UNKNOWN"]),
  operationalState: z.enum(["ACTIVE", "INACTIVE", "UNKNOWN", "CONFLICTED"]),
  operationalEvidence: z.array(sourceRecordRefSchema).max(64), ...identityShape,
}).strict().superRefine((row, context) => {
  if ((row.competitorEntityId !== null) !== (row.entityLinkState === "RESOLVED")
    || row.entityLinkState === "RESOLVED" && !row.entityLinkEvidence.length) {
    context.addIssue({ code: "custom", message: "An entity link needs explicit resolved identity evidence; ambiguity has no invented entity id" });
  }
  if (row.operationalState !== "UNKNOWN" && !row.operationalEvidence.length) context.addIssue({ code: "custom", message: "Operational claims require their own evidence" });
});
export const competitorSourceRecordSchema = z.object({
  ...sourceRecordRefSchema.shape, validity: validitySchema,
  sourceClaim: shortTextSchema,
  measurementMethod: z.enum(["DOCUMENTED", "LIMITED", "UNSUPPORTED"]), method: definitionRefSchema.nullable(),
}).strict().refine((record) => (record.measurementMethod === "UNSUPPORTED") === (record.method === null), "An eligible observation needs an explicit versioned measurement method");
export const matchingRuleSchema = z.object({
  rule: definitionRefSchema, targetActivity: scopeSchema.shape.activity,
  activityTaxonomy: definitionRefSchema,
  relationship: z.enum(["DIRECT", "INDIRECT", "POTENTIAL", "NOT_COMPARABLE"]),
  criterion: z.enum(["SAME_NEED", "DOCUMENTED_SUBSTITUTION", "DOCUMENTED_POTENTIAL", "DOCUMENTED_EXCLUSION"]),
  requiredActivityCodes: z.array(identifierSchema).min(1).max(32),
  reason: shortTextSchema, evidence: evidenceSchema, limitations: limitationsSchema, validity: validitySchema,
}).strict().refine((rule) => ({
  DIRECT: "SAME_NEED", INDIRECT: "DOCUMENTED_SUBSTITUTION", POTENTIAL: "DOCUMENTED_POTENTIAL", NOT_COMPARABLE: "DOCUMENTED_EXCLUSION",
})[rule.relationship] === rule.criterion, "Relationship must match the explicitly evidenced criterion, not name/proximity/broad category");
export const competitorEvidenceSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.evidence/v1"),
  inputs: z.array(engineInputSchema).max(32),
  permissions: z.array(z.object({
    inputId: identifierSchema, analysisUsage: z.enum(["ALLOWED", "DENIED", "NOT_VERIFIED"]),
    policy: definitionRefSchema, validity: validitySchema,
  }).strict()).max(32),
  sourceRecords: z.array(competitorSourceRecordSchema).max(2_000),
  entities: z.array(competitorEntitySchema).max(2_000),
  locations: z.array(competitorLocationSchema).max(2_000),
  rules: z.array(matchingRuleSchema).max(100),
}).strict();
export type CompetitorEvidence = z.infer<typeof competitorEvidenceSchema>;
export type CompetitorEntity = z.infer<typeof competitorEntitySchema>;
export type CompetitorLocation = z.infer<typeof competitorLocationSchema>;
export type SourceRecordRef = z.infer<typeof sourceRecordRefSchema>;
export type CompetitorScope = z.infer<typeof scopeSchema>;
export const measurementMethodFor = (records: readonly z.infer<typeof competitorSourceRecordSchema>[]) =>
  records.length === 0 || records.some((row) => row.measurementMethod === "UNSUPPORTED") ? "UNSUPPORTED" as const
    : records.some((row) => row.measurementMethod === "LIMITED") ? "LIMITED" as const : "DOCUMENTED" as const;
export const activeAt = (validity: z.infer<typeof validitySchema>, at: string) => validity.start <= at && (validity.end === null || at < validity.end);
export const refKey = (ref: SourceRecordRef) => canonicalize([ref.inputId, ref.sourceNamespace, ref.sourceRecordId]);
export const recordReference = ({ inputId, sourceNamespace, sourceRecordId }: SourceRecordRef): SourceRecordRef => ({ inputId, sourceNamespace, sourceRecordId });
export const sortedText = (values: readonly string[]) => [...new Set(values)].sort(compareText);
export const sortedEvidence = (values: readonly SourceRecordRef[]) => [...new Map(values.map((ref) => [refKey(ref), ref])).values()]
  .sort((a, b) => compareText(refKey(a), refKey(b)));
export function ensureSize(value: unknown): void {
  if (Buffer.byteLength(canonicalize(value), "utf8") > MAX_RUN_JSON_BYTES) throw new EngineError("REQUEST_TOO_LARGE", { first: "Competitor JSON exceeds the existing 2 MiB limit; no evidence was truncated" });
}

/** Exact repeated rows collapse; conflicting rows with the same identity fail instead of choosing one. */
function uniqueRows<T>(rows: T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const id = key(row);
    if (map.has(id) && canonicalize(map.get(id)) !== canonicalize(row)) throw new EngineError("INVALID_INPUT", { first: "Conflicting rows for one declared identity", identity: id });
    map.set(id, row);
  }
  return [...map.entries()].sort(([a], [b]) => compareText(a, b)).map(([, row]) => row);
}
export function normalizeCompetitorEvidence(raw: unknown): CompetitorEvidence {
  ensureSize(raw);
  const result = competitorEvidenceSchema.parse(raw);
  for (const input of result.inputs) if (input.kind !== "DATA_CENTER_VERSION" || input.governance !== "DC_PUBLISHED" || !input.checksum
    || input.roles.some((role) => !(competitorRoles as readonly string[]).includes(role))) throw new EngineError("INVALID_INPUT", { first: "M1 evidence requires exact governed descriptors; this does not verify a live Data Center connection" });
  if (!result.inputs.every(hasCanonicalInputDates)) throw new EngineError("INVALID_INPUT", { first: "Evidence dates must use canonical UTC millisecond timestamps" });
  result.inputs = uniqueRows(result.inputs, (row) => row.id);
  result.permissions = uniqueRows(result.permissions, (row) => row.inputId);
  if (canonicalize(result.permissions.map((row) => row.inputId)) !== canonicalize(result.inputs.map((row) => row.id))) throw new EngineError("INVALID_INPUT", { first: "Every input needs an explicit independently supplied usage decision; missing permission is never assumed" });
  if (new Set(result.inputs.map((input) => input.ref.id)).size !== result.inputs.length) throw new EngineError("INVALID_INPUT", { first: "One exact Data Center version cannot be aliased as multiple inputs" });
  result.sourceRecords = uniqueRows(result.sourceRecords, refKey);
  const records = new Map(result.sourceRecords.map((row) => [refKey(row), row]));
  const inputs = new Map(result.inputs.map((row) => [row.id, row]));
  for (const row of result.sourceRecords) if (!inputs.has(row.inputId)) throw new EngineError("INVALID_INPUT", { first: "Source record input is unresolved" });
  for (const input of result.inputs) if (result.sourceRecords.filter((row) => row.inputId === input.id).length > 2_000) throw new EngineError("REQUEST_TOO_LARGE", { first: "At most 2000 source records per version" });
  const refs = (values: SourceRecordRef[], validity: z.infer<typeof validitySchema>) => {
    for (const ref of values) {
      const record = records.get(refKey(ref));
      if (!record || record.validity.start > validity.start || record.validity.end !== null && (validity.end === null || record.validity.end < validity.end)) {
        throw new EngineError("INVALID_INPUT", { first: "Evidence reference or its validity is unresolved" });
      }
    }
    return sortedEvidence(values);
  };
  for (const row of [...result.entities, ...result.locations, ...result.rules]) {
    row.evidence = refs(row.evidence, row.validity); row.limitations = sortedText(row.limitations);
  }
  for (const row of [...result.entities, ...result.locations]) if (row.identityState === "RESOLVED" && row.identityMethod === "UNRESOLVED") throw new EngineError("INVALID_INPUT", { first: "Resolved identity needs an authoritative identifier or explicit source link" });
  for (const row of result.locations) {
    row.entityLinkEvidence = refs(row.entityLinkEvidence, row.validity);
    row.operationalEvidence = refs(row.operationalEvidence, row.validity);
    row.activityCodes = sortedText(row.activityCodes);
  }
  for (const row of result.rules) row.requiredActivityCodes = sortedText(row.requiredActivityCodes);
  result.entities = uniqueRows(result.entities, (row) => row.competitorEntityId);
  result.locations = uniqueRows(result.locations, (row) => row.locationId);
  result.rules = uniqueRows(result.rules, (row) => canonicalize(row.rule));
  const entities = new Map(result.entities.map((row) => [row.competitorEntityId, row]));
  for (const row of result.locations) if (row.competitorEntityId !== null) {
    const entity = entities.get(row.competitorEntityId);
    if (!entity || entity.identityState !== "RESOLVED" || entity.validity.start > row.validity.start
      || entity.validity.end !== null && (row.validity.end === null || entity.validity.end < row.validity.end)) throw new EngineError("INVALID_INPUT", { first: "Location entity link does not resolve to a valid unified entity" });
  }
  return result;
}
