import { z } from "zod";
import { engineInputSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema, shortTextSchema, timestampSchema } from "../shared/primitives";
import { intervalSchema, quantityDimensionsSchema } from "../shared/quantities";
import { compareOperationalDecimals, operationalDecimalSchema, operationalWhole } from "./decimal";

export const OPERATIONAL_REQUEST_CONTRACT = "jenan.operational-feasibility.request/v1";
export const OPERATIONAL_DATASET_CONTRACT = "jenan.operational-feasibility.dataset/v1";
export const OPERATIONAL_RESULT_CONTRACT = "jenan.operational-feasibility.result/v1";
export const OPERATIONAL_VERSION = "1.0.0-m1";
export const operationalAnalyses = ["CAPACITY", "WORKFORCE", "SUPPLY", "INVENTORY", "REORDER", "QUALITY", "PREREQUISITES", "SCENARIOS", "SENSITIVITY"] as const;
export const operationalStates = ["COMPUTED", "ESTIMATED", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_SUPPORTED"] as const;
export const operationalTimestamp = timestampSchema.refine((value) => new Date(value).toISOString() === value, "Canonical UTC timestamp required");
export const operationalMethodSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const operationalEvidenceSchema = z.object({
  inputId: identifierSchema, versionId: identifierSchema, checksum: sha256Schema, sourceRecordId: identifierSchema,
}).strict();
export const operationalUnitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("QUANTITY"), entity: identifierSchema, whole: z.boolean() }).strict(),
  z.object({ kind: z.literal("TIME"), basis: z.enum(["MINUTE", "HOUR"]) }).strict(),
  z.object({ kind: z.literal("RESOURCE_TIME"), poolId: identifierSchema, basis: z.enum(["MINUTE", "HOUR"]) }).strict(),
  z.object({ kind: z.literal("TIME_PER_UNIT"), poolId: identifierSchema, entity: identifierSchema, basis: z.enum(["MINUTE", "HOUR"]) }).strict(),
  z.object({ kind: z.literal("RATE"), entity: identifierSchema, per: z.enum(["MINUTE", "HOUR", "CALENDAR_DAY", "WORKING_DAY"]) }).strict(),
  z.object({ kind: z.literal("LEAD_TIME"), basis: z.enum(["CALENDAR_DAY", "WORKING_DAY"]) }).strict(),
  z.object({ kind: z.literal("HOURS_PER_FTE"), roleId: identifierSchema, calendarId: identifierSchema }).strict(),
  z.object({ kind: z.literal("FTE"), roleId: identifierSchema }).strict(),
  z.object({ kind: z.literal("FRACTION") }).strict(),
  z.object({ kind: z.literal("LOAD_PERCENT") }).strict(),
]);
export const operationalValueSchema = z.object({
  id: identifierSchema, periodId: identifierSchema, siteId: identifierSchema,
  value: operationalDecimalSchema.nullable(), unit: operationalUnitSchema,
  nature: z.enum(["OBSERVED", "DECLARED_ASSUMPTION"]), author: shortTextSchema,
  declaredAt: operationalTimestamp, approval: z.enum(["OWNER_APPROVED", "UNREVIEWED"]),
  approvedAt: operationalTimestamp.nullable(), approvedBy: shortTextSchema.nullable(),
  rationale: shortTextSchema, method: operationalMethodSchema,
  evidence: z.array(operationalEvidenceSchema).min(1).max(32),
  limitations: z.array(shortTextSchema).min(1).max(10),
}).strict().superRefine((entry, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (entry.approval === "OWNER_APPROVED") {
    if (!entry.approvedAt || !entry.approvedBy || entry.approvedAt < entry.declaredAt) fail("Approved values need a dated attestation after declaration");
  } else if (entry.approvedAt !== null || entry.approvedBy !== null) fail("Unreviewed values cannot carry approval");
  if (entry.value === null || !operationalDecimalSchema.safeParse(entry.value).success) return;
  if (compareOperationalDecimals(entry.value, "0") < 0) fail("Operational operands are nonnegative; inventory adjustments use an explicit direction");
  if (entry.unit.kind === "FRACTION" && compareOperationalDecimals(entry.value, "1") > 0) fail("A fraction is within [0,1]");
  if (entry.unit.kind === "QUANTITY" && entry.unit.whole && !operationalWhole(entry.value)) fail("Whole-unit quantities cannot be fractional");
});
export const operationalInputSchema = engineInputSchema.refine((input) =>
  input.kind === "DATA_CENTER_VERSION" && input.governance === "DC_PUBLISHED" && input.ref.system === "DATA_CENTER"
  && input.checksum?.algorithm === "SHA-256", "Exact checksummed governed Data Center descriptor required");
export type OperationalValue = z.infer<typeof operationalValueSchema>;
export type OperationalInput = z.infer<typeof operationalInputSchema>;

const rowSchema = z.object({
  id: identifierSchema, periodId: identifierSchema, siteId: identifierSchema, entityId: identifierSchema,
  valueId: identifierSchema, direction: z.enum(["ADD", "SUBTRACT"]),
  supplierStatus: z.enum(["COMMITTED", "QUOTATION", "UNKNOWN"]).nullable(),
  effectiveDate: z.iso.date().nullable(),
}).strict();
export const operationalScheduleKinds = ["TARGET", "RESOURCE_TIME", "CYCLE_TIME", "LABOR_TIME", "STAFF_AVAILABILITY", "FTE_HOURS", "SUPPLIER", "OPENING_STOCK", "RECEIPTS", "CONSUMPTION", "ADJUSTMENTS", "CONSUMPTION_RATE", "LEAD_TIME", "SAFETY_STOCK", "INSPECTED", "ACCEPTED", "REJECTED"] as const;
export const operationalScheduleSchema = z.object({
  id: identifierSchema, kind: z.enum(operationalScheduleKinds),
  interpretation: z.enum(["PLAN", "OBSERVED"]), completeness: z.enum(["COMPLETE", "PARTIAL", "MISSING"]),
  coveredPeriodIds: z.array(identifierSchema).max(120), noApplicableItems: z.boolean(),
  cohortId: identifierSchema.nullable(),
  evidence: z.array(operationalEvidenceSchema).min(1).max(32), rows: z.array(rowSchema).max(1000),
}).strict().superRefine((schedule, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (schedule.kind === "TARGET" && schedule.interpretation !== "PLAN") fail("Production/service targets are PLAN, never demand or sales");
  const quality = ["INSPECTED", "ACCEPTED", "REJECTED"].includes(schedule.kind);
  if (quality && (schedule.cohortId === null || schedule.interpretation !== "OBSERVED")) fail("Observed quality needs an explicit inspection cohort");
  if (!quality && schedule.cohortId !== null) fail("Inspection cohort belongs only to quality schedules");
  if (schedule.noApplicableItems && (schedule.rows.length || schedule.completeness !== "COMPLETE")) fail("No applicable items requires complete empty evidence");
  if (schedule.completeness === "COMPLETE" && !schedule.rows.length && !schedule.noApplicableItems) fail("Empty does not mean complete zero");
  if (schedule.completeness === "MISSING" && schedule.rows.length) fail("Missing schedule cannot contain rows");
  if (new Set(schedule.coveredPeriodIds).size !== schedule.coveredPeriodIds.length) fail("Duplicate coverage");
  if (new Set(schedule.rows.map((row) => row.id)).size !== schedule.rows.length) fail("Duplicate schedule row");
  for (const row of schedule.rows) {
    if (!schedule.coveredPeriodIds.includes(row.periodId)) fail("Row outside declared schedule coverage");
    if ((schedule.kind === "SUPPLIER") !== (row.supplierStatus !== null)) fail("Supplier rows require explicit commitment classification only");
    if (schedule.kind !== "ADJUSTMENTS" && row.direction !== "ADD") fail("Only inventory adjustments use signed directions");
  }
});
const disclosure = {
  author: shortTextSchema, declaredAt: operationalTimestamp, rationale: shortTextSchema,
  evidence: z.array(operationalEvidenceSchema).min(1).max(32),
};
const calculationSemanticsSchema = z.object({
  resources: z.array(z.object({
    stageId: identifierSchema, periodId: identifierSchema,
    scheduledValueId: identifierSchema, setupValueId: identifierSchema, unavailableValueId: identifierSchema,
    lossAccounting: z.literal("COMPLETE_NONOVERLAPPING"),
    productivity: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("CYCLE_TIME"), valueId: identifierSchema }).strict(),
      z.object({ kind: z.literal("NET_RATE"), valueId: identifierSchema }).strict(),
    ]),
  }).strict()).max(1000),
  workforce: z.array(z.object({
    roleId: identifierSchema, outputId: identifierSchema, periodId: identifierSchema,
    laborPerUnitValueId: identifierSchema, fixedTimeValueId: identifierSchema,
    method: z.enum(["CONTINUOUS_FTE", "HOMOGENEOUS_FULL_TIME"]),
    allocation: z.literal("COMPLETE_NONOVERLAPPING"),
  }).strict()).max(1000),
}).strict();
export const operationalRequestSchema = z.object({
  contract: z.literal(OPERATIONAL_REQUEST_CONTRACT), subject: identifierSchema,
  scope: z.object({ geography: quantityDimensionsSchema.shape.geography, sector: quantityDimensionsSchema.shape.sector }).strict(),
  siteId: identifierSchema, analyses: z.array(z.enum(operationalAnalyses)).min(1).max(9),
  periods: z.array(intervalSchema).min(1).max(120),
  network: z.object({
    kind: z.enum(["SIMPLE_SERIAL", "BRANCHED", "PARALLEL", "REWORK", "SHARED_RESOURCE"]),
    stages: z.array(z.object({ id: identifierSchema, poolId: identifierSchema, outputId: identifierSchema }).strict()).min(1).max(100),
    lossBasis: z.enum(["NET_GOOD_OUTPUT", "GROSS_OR_UNKNOWN"]),
  }).strict(),
  values: z.array(operationalValueSchema).max(1000),
  schedules: z.array(operationalScheduleSchema).max(200),
  requirements: z.object({
    applicabilityComplete: z.boolean(), evidence: z.array(operationalEvidenceSchema).min(1).max(32),
    entries: z.array(z.object({
      id: identifierSchema, status: z.enum(["EVIDENCED", "MISSING", "EXPIRED", "CONFLICTED", "NOT_APPLICABLE"]),
      rationale: shortTextSchema, evidence: z.array(operationalEvidenceSchema).max(32),
    }).strict()).max(1000),
  }).strict(),
  scenarios: z.array(z.object({
    ...disclosure, id: identifierSchema,
    overrides: z.array(z.object({ valueId: identifierSchema, value: operationalDecimalSchema.nullable() }).strict()).min(1).max(1000),
  }).strict()).max(9),
  sensitivity: z.array(z.object({
    ...disclosure, id: identifierSchema, valueId: identifierSchema,
    low: operationalDecimalSchema, base: operationalDecimalSchema, high: operationalDecimalSchema,
  }).strict()).max(20),
  calculationSemantics: calculationSemanticsSchema.optional(),
}).strict().superRefine((request, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(request.analyses) || !unique(request.periods.map((p) => p.id)) || !unique(request.values.map((v) => v.id))
    || !unique(request.schedules.map((s) => s.id)) || !unique(request.schedules.map((s) => s.kind))
    || !unique(request.network.stages.map((s) => s.id)) || !unique(request.requirements.entries.map((e) => e.id))
    || !unique(request.scenarios.map((s) => s.id)) || !unique(request.sensitivity.map((s) => s.id))) fail("Duplicate model identity or schedule kind");
  if (!unique(request.schedules.flatMap((s) => s.rows.map((row) => row.id)))
    || !unique(request.schedules.flatMap((s) => s.rows.map((row) => row.valueId)))) fail("A schedule operand/row cannot be counted twice");
  request.periods.forEach((period, index) => {
    if (period.timeZone !== request.periods[0]!.timeZone || (index && request.periods[index - 1]!.endDate !== period.startDate)) fail("Ordered contiguous periods and one explicit timezone required");
  });
  const periodIds = new Set(request.periods.map((p) => p.id));
  for (const value of request.values) if (!periodIds.has(value.periodId) || value.siteId !== request.siteId) fail("Operand period/site mismatch");
  const byId = new Map(request.values.map((v) => [v.id, v]));
  if (request.calculationSemantics) {
    const { resources, workforce } = request.calculationSemantics;
    if (!unique(resources.map((r) => JSON.stringify([r.stageId, r.periodId])))
      || !unique(workforce.map((r) => JSON.stringify([r.roleId, r.periodId])))) fail("Duplicate resource or role/period calculation");
    const references = [
      ...resources.flatMap((r) => [r.scheduledValueId, r.setupValueId, r.unavailableValueId, r.productivity.valueId]),
      ...workforce.flatMap((r) => [r.laborPerUnitValueId, r.fixedTimeValueId]),
    ];
    if (!unique(references)) fail("Calculation operands cannot be allocated twice");
    if (references.some((id) => !byId.has(id))
      || resources.some((r) => !periodIds.has(r.periodId) || !request.network.stages.some((s) => s.id === r.stageId))
      || workforce.some((r) => !periodIds.has(r.periodId))) fail("Unknown calculation operand, stage or period");
    const scheduleKinds = new Map(request.schedules.flatMap((s) => s.rows.map((r) => [r.valueId, s.kind] as const)));
    if (resources.some((r) => scheduleKinds.has(r.setupValueId) || scheduleKinds.has(r.unavailableValueId))
      || workforce.some((r) => scheduleKinds.has(r.laborPerUnitValueId) || scheduleKinds.has(r.fixedTimeValueId))) {
      fail("Dedicated loss/labor operands cannot also be consumed by another schedule");
    }
  }
  for (const schedule of request.schedules) {
    if (schedule.coveredPeriodIds.some((id) => !periodIds.has(id))) fail("Unknown coverage period");
    for (const row of schedule.rows) {
      const value = byId.get(row.valueId);
      if (!value || value.periodId !== row.periodId || value.siteId !== row.siteId || row.siteId !== request.siteId) { fail("Unknown or incompatible row operand"); continue; }
      const expected = schedule.kind === "RESOURCE_TIME" || schedule.kind === "LABOR_TIME" || schedule.kind === "STAFF_AVAILABILITY" ? "RESOURCE_TIME"
        : schedule.kind === "CYCLE_TIME" ? "TIME_PER_UNIT" : schedule.kind === "FTE_HOURS" ? "HOURS_PER_FTE"
          : schedule.kind === "CONSUMPTION_RATE" ? "RATE" : schedule.kind === "LEAD_TIME" ? "LEAD_TIME" : "QUANTITY";
      if (value.unit.kind !== expected) fail("Schedule operand unit mismatch");
      if (["INSPECTED", "ACCEPTED", "REJECTED"].includes(schedule.kind) && value.unit.kind === "QUANTITY" && !value.unit.whole) fail("Inspection counts must be whole units");
      if ("entity" in value.unit && value.unit.entity !== row.entityId) fail("Output/material unit mismatch");
      if ("poolId" in value.unit && value.unit.poolId !== row.entityId && value.unit.kind === "RESOURCE_TIME") fail("Resource pool mismatch");
      if (value.unit.kind === "HOURS_PER_FTE" && (value.unit.roleId !== row.entityId || value.unit.calendarId !== row.periodId)) fail("FTE needs the declared role and reporting calendar");
      if (row.effectiveDate !== null) {
        const period = request.periods.find((p) => p.id === row.periodId);
        if (!period || row.effectiveDate < period.startDate || row.effectiveDate >= period.endDate) fail("Dated receipt/commitment must belong to its declared period");
      }
      if (schedule.interpretation === "OBSERVED" && value.nature !== "OBSERVED") fail("Assumptions cannot become observed operations");
      if ((schedule.kind === "TARGET" || row.supplierStatus === "COMMITTED") && value.nature !== "DECLARED_ASSUMPTION") fail("Targets and future commitments remain declared plans");
    }
  }
  for (const entry of request.requirements.entries) if (["EVIDENCED", "NOT_APPLICABLE"].includes(entry.status) && !entry.evidence.length) fail("Supported/not-applicable requirements need explicit evidence");
  const validateOverride = (id: string, raw: string | null) => {
    const original = byId.get(id);
    if (!original || original.nature !== "DECLARED_ASSUMPTION" || !operationalValueSchema.safeParse({ ...original, value: raw }).success) fail("Override must retain a declared operand and its dimensional bounds");
  };
  for (const scenario of request.scenarios) {
    if (!unique(scenario.overrides.map((v) => v.valueId))) fail("Duplicate scenario override");
    scenario.overrides.forEach((v) => validateOverride(v.valueId, v.value));
  }
  if (!unique(request.sensitivity.map((s) => s.valueId))) fail("One sensitivity driver per operand");
  for (const point of request.sensitivity) {
    [point.low, point.base, point.high].forEach((v) => validateOverride(point.valueId, v));
    const original = byId.get(point.valueId)?.value;
    if ([point.low, point.base, point.high].every((value) => operationalDecimalSchema.safeParse(value).success)
      && original !== null && original !== undefined && operationalDecimalSchema.safeParse(original).success) {
      if (compareOperationalDecimals(point.low, point.base) > 0 || compareOperationalDecimals(point.base, point.high) > 0
        || compareOperationalDecimals(point.base, original) !== 0) fail("Ordered sensitivity points and explicit original base required");
    } else fail("Sensitivity needs valid explicit decimal operands");
  }
});
export type OperationalRequest = z.infer<typeof operationalRequestSchema>;
export const operationalDatasetSchema = z.object({
  contract: z.literal(OPERATIONAL_DATASET_CONTRACT), sourceId: identifierSchema, model: operationalRequestSchema,
  approval: z.object({ approvedBy: shortTextSchema, approvedAt: operationalTimestamp, evidence: z.array(operationalEvidenceSchema).min(1).max(32) }).strict(),
}).strict().superRefine((dataset, context) => {
  if (dataset.model.values.some((value) => value.approval !== "OWNER_APPROVED" || value.approvedAt! > dataset.approval.approvedAt)) {
    context.addIssue({ code: "custom", message: "Dataset approval must follow approval of every model operand" });
  }
});
