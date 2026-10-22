import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { benchmarkSchema, definitionSchema, opportunityFactSchema, opportunityRoles, scopeSchema, textListSchema, timestamp, type OpportunityFact } from "./model";
import type { OpportunitySourceReference } from "./data-port";

export const typeKeyByOpportunityRole = {
  "need.observations": "opportunity-need-observations",
  "supply.capacity": "opportunity-supply-capacity",
  "provision.observations": "opportunity-provision-observations",
  "benchmarks.targets": "opportunity-benchmarks",
  "context.indicators": "opportunity-context-indicators",
  "dimensions.dictionary": "opportunity-dimensions",
} as const;
export type OpportunityDatasetRole = keyof typeof typeKeyByOpportunityRole;
const sourceRecordSchema = z.object({
  id: identifierSchema, reference: shortTextSchema, description: shortTextSchema, recordedAt: timestamp,
}).strict();
const rowSchema = z.object({
  ...opportunityFactSchema.shape,
  evidence: z.array(identifierSchema).min(1).max(32),
  benchmark: z.object({ ...benchmarkSchema.shape, source: identifierSchema }).strict()
    .refine((value) => value.validFrom < value.validUntil, "Benchmark validity is a nonempty interval").nullable(),
}).strict();
export const opportunityDatasetSchema = z.object({
  contract: z.literal("jenan.opportunity-gap.dataset/v1"), role: z.enum(opportunityRoles), sourceId: identifierSchema,
  scope: scopeSchema, definition: definitionSchema,
  coverage: z.object({
    status: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
    completeness: z.enum(["INVENTORY", "SAMPLE", "UNKNOWN"]), evidence: z.array(identifierSchema).min(1).max(32),
  }).strict(),
  sourceRecords: z.array(sourceRecordSchema).min(1).max(10_000),
  rows: z.array(rowSchema).max(10_000), limitations: textListSchema,
}).strict().superRefine((dataset, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  for (const group of [dataset.rows, dataset.sourceRecords]) if (new Set(group.map((row) => row.id)).size !== group.length) fail("Dataset record identities must be unique");
  if (dataset.coverage.status === "COMPLETE" && dataset.coverage.completeness !== "INVENTORY") fail("Complete scoped coverage requires an inventory");
  if ((dataset.coverage.status !== "COMPLETE" || dataset.coverage.completeness !== "INVENTORY") && !dataset.limitations.length) fail("Partial/unknown coverage requires limitations");
  const records = new Set(dataset.sourceRecords.map((record) => record.id));
  for (const id of dataset.coverage.evidence) if (!records.has(id)) fail("Coverage evidence must name a documented source record");
  for (const row of dataset.rows) {
    if (row.role !== dataset.role) fail("Every row must belong to the dataset role");
    if (canonicalize({ dimensions: row.semantics.dimensions, time: row.semantics.time }) !== canonicalize(dataset.scope)
      || canonicalize({ measuredSubject: row.semantics.measuredSubject, unit: row.semantics.unit, measureKind: row.semantics.measureKind }) !== canonicalize(dataset.definition)) fail("Row scope/definition must match its declared dataset");
    if (row.coverage === "COMPLETE" && dataset.coverage.status !== "COMPLETE") fail("A row cannot upgrade partial dataset coverage");
    if (dataset.coverage.status === "NONE" && row.coverage !== "NONE") fail("Uncovered dataset cannot contain covered observations");
    for (const id of row.evidence) if (!records.has(id)) fail("Unresolved source record");
    if (row.benchmark && !row.evidence.includes(row.benchmark.source)) fail("Benchmark source must be retained among row evidence");
  }
});
export type OpportunityDataset = z.infer<typeof opportunityDatasetSchema>;
/** Local source-record IDs avoid circular version-checksum references inside the bytes being hashed. */
export function bindOpportunityDataset(dataset: OpportunityDataset, reference: OpportunitySourceReference): OpportunityFact[] {
  const ref = (sourceRecordId: string) => ({
    inputId: `dc:${reference.version.versionId}`, versionId: reference.version.versionId,
    checksum: reference.version.checksum.value, sourceRecordId,
  });
  return dataset.rows.map((row) => opportunityFactSchema.parse({
    ...row, id: `${reference.version.versionId}/${row.id}`,
    evidence: row.evidence.map(ref),
    benchmark: row.benchmark ? { ...row.benchmark, source: ref(row.benchmark.source) } : null,
  }));
}
