import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { competitorIdentityLinkSchema } from "./identity";
import { competitorCoverageSchema } from "./counts";
import {
  competitorEntitySchema, competitorLocationSchema, competitorSourceRecordSchema, definitionRefSchema,
  evidenceSchema, matchingRuleSchema, scopeSchema, validitySchema,
} from "./model";

export const typeKeyByCompetitorRole = {
  "competitor.entities": "competitor-entities", "competitor.locations": "competitor-locations",
  "competitor.attributes": "competitor-attributes", "competitor.identity-links": "competitor-identity-links",
  "competitor.matching-rules": "competitor-matching-rules", "competitor.dimensions": "competitor-dimensions",
} as const;
export type CompetitorDatasetRole = keyof typeof typeKeyByCompetitorRole;
const datasetCoverageSchema = z.object({
  geographies: z.array(scopeSchema.shape.geography).min(1).max(100),
  activities: z.array(scopeSchema.shape.activity).min(1).max(100),
  entityDefinitions: z.array(definitionRefSchema).min(1).max(100),
  segments: z.array(definitionRefSchema.nullable()).min(1).max(100),
  validity: validitySchema, completeness: z.enum(["INVENTORY", "SAMPLE", "UNKNOWN"]),
}).strict();
const common = {
  sourceId: identifierSchema, sourceRecords: z.array(competitorSourceRecordSchema).min(1).max(2_000),
  coverage: datasetCoverageSchema, limitations: z.array(shortTextSchema).max(10),
};
const attributeSchema = z.object({
  id: identifierSchema, subjectKind: z.enum(["ENTITY", "LOCATION"]), subjectId: identifierSchema,
  definition: definitionRefSchema, unit: definitionRefSchema, scope: scopeSchema,
  value: z.union([z.number().finite(), shortTextSchema]).nullable(),
  evidenceClass: z.enum(["OBSERVED", "CONTEXTUAL"]), evidence: evidenceSchema,
  validity: validitySchema, limitations: z.array(shortTextSchema).max(10),
}).strict();
const dimensionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GEOGRAPHY"), definition: scopeSchema.shape.geography }).strict(),
  z.object({ kind: z.literal("ACTIVITY"), definition: scopeSchema.shape.activity }).strict(),
  z.object({ kind: z.literal("ENTITY_DEFINITION"), definition: definitionRefSchema }).strict(),
]);
export const competitorDatasetSchema = z.discriminatedUnion("role", [
  z.object({ ...common, contract: z.literal("jenan.competitor.entities/v1"), role: z.literal("competitor.entities"), rows: z.array(competitorEntitySchema).max(2_000) }).strict(),
  z.object({ ...common, contract: z.literal("jenan.competitor.locations/v1"), role: z.literal("competitor.locations"), rows: z.array(competitorLocationSchema).max(2_000), inventory: competitorCoverageSchema }).strict(),
  z.object({ ...common, contract: z.literal("jenan.competitor.matching-rules/v1"), role: z.literal("competitor.matching-rules"), rows: z.array(matchingRuleSchema).max(100) }).strict(),
  z.object({ ...common, contract: z.literal("jenan.competitor.identity-links/v1"), role: z.literal("competitor.identity-links"), rows: z.array(competitorIdentityLinkSchema).max(2_000) }).strict(),
  z.object({ ...common, contract: z.literal("jenan.competitor.attributes/v1"), role: z.literal("competitor.attributes"), rows: z.array(attributeSchema).max(2_000) }).strict(),
  z.object({ ...common, contract: z.literal("jenan.competitor.dimensions/v1"), role: z.literal("competitor.dimensions"), rows: z.array(dimensionSchema).max(2_000) }).strict(),
]).superRefine((dataset, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (dataset.sourceRecords.some((record) => record.inputId !== "SELF")) fail("Dataset source records bind only to SELF; cannot impersonate another version");
  const keys = dataset.sourceRecords.map((row) => canonicalize([row.sourceNamespace, row.sourceRecordId]));
  if (new Set(keys).size !== keys.length) fail("Duplicate original source record identity");
  const allRows = dataset.rows.length + dataset.sourceRecords.length;
  if (allRows > 2_000) fail("At most 2000 rows including source records per version");
  if (dataset.role === "competitor.locations" && dataset.inventory.status === "COMPLETE" && dataset.coverage.completeness !== "INVENTORY") fail("Complete location inventory requires declared inventory completeness");
});
export type CompetitorDataset = z.infer<typeof competitorDatasetSchema>;
export function competitorDatasetCoverage(dataset: CompetitorDataset, scope: z.infer<typeof scopeSchema>, entityDefinition: z.infer<typeof definitionRefSchema>) {
  const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
  const coverage = dataset.coverage;
  if (scope.asOf < coverage.validity.start || coverage.validity.end !== null && scope.asOf >= coverage.validity.end) return "NO_COVERAGE" as const;
  for (const [values, expected] of [[coverage.geographies, scope.geography], [coverage.activities, scope.activity], [coverage.entityDefinitions, entityDefinition], [coverage.segments, scope.segment]] as const) {
    if (!values.some((value) => same(value, expected))) return "NO_COVERAGE" as const;
  }
  return "AVAILABLE" as const;
}
