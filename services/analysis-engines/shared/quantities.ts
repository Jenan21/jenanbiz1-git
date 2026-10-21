import { z } from "zod";
import { canonicalize } from "./canonical";
import { identifierSchema, shortTextSchema } from "./primitives";

export const dateSchema = z.iso.date();
const timeZoneSchema = z.string().min(1).max(80).refine((value) => {
  try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone.length > 0; }
  catch (error) { if (error instanceof RangeError) return false; throw error; }
}, "An IANA reporting time zone is required");
export const frequencies = ["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"] as const;
export const timeWindowSchema = z.object({ startDate: dateSchema, endDate: dateSchema }).strict()
  .refine((window) => window.startDate < window.endDate, "A time window is a nonempty half-open interval");

export const intervalSchema = z.object({
  kind: z.literal("INTERVAL"), id: identifierSchema,
  startDate: dateSchema, endDate: dateSchema, frequency: z.enum(frequencies),
  calendar: z.literal("GREGORIAN"), timeZone: timeZoneSchema,
}).strict().superRefine((period, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (period.startDate >= period.endDate) fail("Period must be a nonempty half-open interval");
  if (period.frequency === "CUSTOM") return;
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);
  const months = period.frequency === "MONTHLY" ? 1 : period.frequency === "QUARTERLY" ? 3 : 12;
  if (start.getUTCDate() !== 1 || end.getUTCDate() !== 1
    || end.getUTCFullYear() * 12 + end.getUTCMonth() - start.getUTCFullYear() * 12 - start.getUTCMonth() !== months
    || (period.frequency === "QUARTERLY" && start.getUTCMonth() % 3 !== 0)
    || (period.frequency === "ANNUAL" && start.getUTCMonth() !== 0)) fail("Period must match a complete calendar frequency");
});
export const snapshotSchema = z.object({
  kind: z.literal("SNAPSHOT"), id: identifierSchema, date: dateSchema,
  calendar: z.literal("GREGORIAN"), timeZone: timeZoneSchema,
}).strict();
export const temporalReferenceSchema = z.discriminatedUnion("kind", [intervalSchema, snapshotSchema]);
export type TemporalReference = z.infer<typeof temporalReferenceSchema>;

export const unitDimensions = ["EVENTS", "ITEMS", "PEOPLE", "HOUSEHOLDS", "ENTITIES", "FREQUENCY", "FRACTION", "PERCENT", "INDEX"] as const;
export const unitDefinitionSchema = z.object({
  id: identifierSchema, version: identifierSchema, dimension: z.enum(unitDimensions),
  entity: identifierSchema,
  per: z.object({ entity: identifierSchema, frequency: z.enum(frequencies) }).strict().nullable(),
}).strict().refine((unit) => (unit.dimension === "FREQUENCY") === (unit.per !== null), "Only a frequency unit has an entity/time denominator");
export type UnitDefinition = z.infer<typeof unitDefinitionSchema>;
const dimensionRefSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const quantityDimensionsSchema = z.object({
  geography: z.object({ countryCode: z.string().regex(/^[A-Z]{2}$/), authority: identifierSchema, level: identifierSchema, code: identifierSchema, version: identifierSchema }).strict(),
  sector: z.object({ taxonomy: identifierSchema, version: identifierSchema, code: identifierSchema }).strict(),
  cohort: dimensionRefSchema, metricDefinition: dimensionRefSchema,
  methodology: dimensionRefSchema, universe: dimensionRefSchema, adjustment: identifierSchema,
}).strict();
export const evidenceNatures = ["OBSERVATION", "ESTIMATE", "DERIVED"] as const;
export const quantitySemanticsSchema = z.object({
  measuredSubject: identifierSchema,
  unit: unitDefinitionSchema,
  measureKind: z.enum(["FLOW", "STOCK", "RATE", "SHARE", "INDEX"]),
  evidenceNature: z.enum(evidenceNatures),
  time: temporalReferenceSchema,
  dimensions: quantityDimensionsSchema,
  comparison: z.object({
    operation: z.enum(["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"]),
    from: temporalReferenceSchema, to: temporalReferenceSchema, operandUnit: unitDefinitionSchema,
  }).strict().optional(),
}).strict().superRefine((semantics, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (!semantics.comparison && (semantics.measureKind === "STOCK") !== (semantics.time.kind === "SNAPSHOT")) fail("Stock uses a snapshot; other measures use reporting intervals");
  if ((semantics.measureKind === "RATE") !== (semantics.unit.dimension === "FREQUENCY") && !semantics.comparison) fail("A rate requires a frequency unit");
  if ((semantics.measureKind === "SHARE") !== (["FRACTION", "PERCENT"].includes(semantics.unit.dimension) && !semantics.comparison)) fail("A share requires a fraction or percent unit");
  if ((semantics.measureKind === "INDEX") !== (semantics.unit.dimension === "INDEX")) fail("An index requires an index unit");
  if (semantics.comparison) {
    const expected = semantics.comparison.operation === "PERCENT_CHANGE" ? "PERCENT" : semantics.comparison.operation === "INDEX" ? "INDEX" : semantics.comparison.operandUnit.dimension;
    if (semantics.unit.dimension !== expected) fail("Comparison output unit does not match its operation");
    if (semantics.comparison.operation === "ABSOLUTE_CHANGE" && canonicalize(semantics.unit) !== canonicalize(semantics.comparison.operandUnit)) fail("Absolute change retains the exact operand unit");
    if (canonicalize(semantics.time) !== canonicalize(semantics.comparison.to)) fail("Comparison time must be the target time");
  }
});
export type QuantitySemantics = z.infer<typeof quantitySemanticsSchema>;

export function quantityValueProblems(value: number, semantics: QuantitySemantics, signed: boolean): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(value) || (!signed && value < 0)) problems.push("Quantity must be finite and nonnegative unless it is a signed change");
  const dimension = semantics.unit.dimension;
  if (["EVENTS", "PEOPLE", "HOUSEHOLDS", "ENTITIES"].includes(dimension) && !Number.isSafeInteger(value)) problems.push("Discrete quantities require a safe whole number");
  if (!signed && ((dimension === "FRACTION" && value > 1) || (dimension === "PERCENT" && value > 100))) problems.push("Share is outside its unit bounds");
  return problems;
}

export const observationRefSchema = z.object({ inputId: identifierSchema, observationId: identifierSchema }).strict();
export const assumptionSchema = z.object({
  id: identifierSchema, description: shortTextSchema, sourceRefs: z.array(observationRefSchema).min(1).max(32),
}).strict();
