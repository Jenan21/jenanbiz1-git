import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { completenessLevels } from "../shared/contracts";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { quantityDimensionsSchema, temporalReferenceSchema, unitDefinitionSchema } from "../shared/quantities";
import { contextSubjects, demandSubjects, marketObservationSchema } from "./model";

const referenceSchema = z.object({ versionId: identifierSchema.optional(), observationId: identifierSchema }).strict();
const assumptionSchema = z.object({
  id: identifierSchema, description: shortTextSchema, sourceRefs: z.array(referenceSchema).min(1).max(32),
}).strict();
const fields = marketObservationSchema.shape;
export const marketDatasetRowSchema = z.object({
  id: identifierSchema, subject: fields.subject, semantics: fields.semantics,
  status: fields.status, value: fields.value, geographicCoverage: fields.geographicCoverage,
  temporalCoverage: fields.temporalCoverage, measurementMethod: fields.measurementMethod,
  method: fields.method, sourceRefs: z.array(referenceSchema).min(1).max(32),
  assumptions: z.array(assumptionSchema).max(20), limitations: fields.limitations,
  partition: fields.partition,
}).strict();
export const marketDatasetCoverageSchema = z.object({
  geographies: z.array(quantityDimensionsSchema.shape.geography).min(1).max(100).nullable(),
  sectors: z.array(quantityDimensionsSchema.shape.sector).min(1).max(100).nullable(),
  cohorts: z.array(quantityDimensionsSchema.shape.cohort).min(1).max(100).nullable(),
  periods: z.array(temporalReferenceSchema).min(1).max(120).nullable(),
  completeness: z.enum(completenessLevels),
}).strict();
const common = { coverage: marketDatasetCoverageSchema };
const measurement = { ...common, rows: z.array(marketDatasetRowSchema).min(1).max(2000) };
const observations = z.object({
  ...measurement, contract: z.literal("jenan.market.observations/v1"),
  role: z.literal("demand.observations"), declares: z.literal("ACTUAL_DEMAND_MEASUREMENTS"),
}).strict();
const context = z.object({
  ...measurement, contract: z.literal("jenan.market.context/v1"),
  role: z.literal("context.indicators"), declares: z.literal("CONTEXT_ONLY"),
}).strict();
export const marketAssumptionRowSchema = z.object({
  id: identifierSchema, kind: z.enum(["ADOPTION_FRACTION", "CONSUMPTION_FREQUENCY"]),
  value: z.number().nonnegative(), unit: unitDefinitionSchema,
  time: temporalReferenceSchema, dimensions: quantityDimensionsSchema,
  evidenceNature: z.enum(["OBSERVATION", "ESTIMATE", "DERIVED"]),
  method: shortTextSchema, sourceRefs: z.array(referenceSchema).min(1).max(32),
  assumptions: z.array(assumptionSchema).max(20), limitations: z.array(shortTextSchema).max(10),
}).strict().superRefine((row, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (row.kind === "ADOPTION_FRACTION" && (row.unit.dimension !== "FRACTION" || row.value > 1 || row.unit.per !== null)) fail("Adoption is a fraction in [0,1]");
  if (row.kind === "CONSUMPTION_FREQUENCY" && row.unit.dimension !== "FREQUENCY") fail("Frequency requires an explicit entity/time denominator");
  if (row.unit.per && (row.time.kind !== "INTERVAL" || row.unit.per.frequency !== row.time.frequency)) fail("Frequency denominator must match its reporting period");
  if (row.evidenceNature === "ESTIMATE" && (!row.assumptions.length || !row.limitations.length)) fail("Estimated assumptions require declared basis and limitations");
  if (row.evidenceNature !== "ESTIMATE" && row.assumptions.length) fail("An assumption cannot hide in non-estimated evidence");
});
const assumptions = z.object({
  ...common, contract: z.literal("jenan.market.assumptions/v1"), role: z.literal("demand.assumptions"),
  declares: z.literal("EXPLICIT_ASSUMPTIONS"), rows: z.array(marketAssumptionRowSchema).min(1).max(2000),
}).strict();
export const marketMetricDefinitionSchema = z.object({
  metricDefinition: quantityDimensionsSchema.shape.metricDefinition,
  subject: fields.subject, unit: unitDefinitionSchema,
  measureKind: z.enum(["FLOW", "STOCK", "RATE", "SHARE", "INDEX"]),
  methodology: quantityDimensionsSchema.shape.methodology,
}).strict();
const dictionary = z.object({
  ...common, contract: z.literal("jenan.market.dimensions/v1"), role: z.literal("dimensions.dictionary"),
  declares: z.literal("DIMENSION_DEFINITIONS"), definitions: z.array(marketMetricDefinitionSchema).min(1).max(2000),
}).strict();
export const marketDatasetSchema = z.discriminatedUnion("role", [observations, context, assumptions, dictionary]).superRefine((dataset, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  for (const entries of [dataset.coverage.geographies, dataset.coverage.sectors, dataset.coverage.cohorts, dataset.coverage.periods]) {
    if (entries && new Set(entries.map((entry) => canonicalize(entry))).size !== entries.length) fail("Duplicate coverage declaration");
  }
  const identities = dataset.role === "dimensions.dictionary" ? dataset.definitions.map((definition) => canonicalize(definition.metricDefinition)) : dataset.rows.map((row) => row.id);
  if (new Set(identities).size !== identities.length) fail("Duplicate/conflicting row or metric definition id");
  if (dataset.role === "demand.observations" || dataset.role === "context.indicators") {
    for (const row of dataset.rows) {
      const subjects: readonly string[] = dataset.role === "demand.observations" ? demandSubjects : contextSubjects;
      if (!subjects.includes(row.subject)) fail("Observation role and measured subject disagree");
      const dimensions = row.semantics.dimensions;
      for (const [entries, expected] of [
        [dataset.coverage.geographies, dimensions.geography], [dataset.coverage.sectors, dimensions.sector],
        [dataset.coverage.cohorts, dimensions.cohort], [dataset.coverage.periods, row.semantics.time],
      ] as const) if (entries && !entries.some((entry) => canonicalize(entry) === canonicalize(expected))) fail("Row lies outside its declared dataset coverage");
      // Check M1 measurement semantics here; actual identities and alias collisions are checked after authorized binding.
      const result = marketObservationSchema.safeParse({
        subject: row.subject, semantics: row.semantics, status: row.status, value: row.value,
        geographicCoverage: row.geographicCoverage, temporalCoverage: row.temporalCoverage,
        measurementMethod: row.measurementMethod, method: row.method, limitations: row.limitations,
        ...(row.partition ? { partition: row.partition } : {}),
        ref: { inputId: "dc:validation", observationId: row.id },
        sourceRefs: row.sourceRefs.map((ref, index) => ({ inputId: `dc:validation-${index}`, observationId: ref.observationId })),
        assumptions: row.assumptions.map((assumption) => ({ ...assumption, sourceRefs: assumption.sourceRefs.map((ref, index) => ({ inputId: `dc:validation-${index}`, observationId: ref.observationId })) })),
      });
      if (!result.success) fail("Invalid observation value, unit, evidence, method or semantics");
    }
  }
  if (dataset.role !== "dimensions.dictionary") for (const row of dataset.rows) {
    const refs = [...row.sourceRefs, ...row.assumptions.flatMap((assumption) => assumption.sourceRefs)];
    if (new Set(row.sourceRefs.map((ref) => canonicalize(ref))).size !== row.sourceRefs.length) fail("Duplicate source reference");
    if (new Set(row.assumptions.map((assumption) => assumption.id)).size !== row.assumptions.length) fail("Duplicate assumption id");
    for (const assumption of row.assumptions) if (new Set(assumption.sourceRefs.map((ref) => canonicalize(ref))).size !== assumption.sourceRefs.length) fail("Duplicate assumption source reference");
    if (refs.some((ref) => ref.versionId === undefined && !dataset.rows.some((candidate) => candidate.id === ref.observationId))) fail("Unresolved self observation reference");
    if (dataset.role === "demand.assumptions") {
      const assumption = dataset.rows.find((entry) => entry.id === row.id)!;
      for (const [entries, expected] of [
        [dataset.coverage.geographies, assumption.dimensions.geography], [dataset.coverage.sectors, assumption.dimensions.sector],
        [dataset.coverage.cohorts, assumption.dimensions.cohort], [dataset.coverage.periods, assumption.time],
      ] as const) if (entries && !entries.some((entry) => canonicalize(entry) === canonicalize(expected))) fail("Assumption lies outside its declared coverage");
    }
  }
});
export type MarketDataset = z.infer<typeof marketDatasetSchema>;
export type MarketDatasetRow = z.infer<typeof marketDatasetRowSchema>;
export type MarketAssumptionRow = z.infer<typeof marketAssumptionRowSchema>;
export type MarketDatasetRole = MarketDataset["role"];
export const typeKeyByMarketRole: Record<MarketDatasetRole, string> = {
  "demand.observations": "market-demand-observations",
  "context.indicators": "market-context-indicators",
  "demand.assumptions": "market-demand-assumptions",
  "dimensions.dictionary": "market-dimensions",
};
