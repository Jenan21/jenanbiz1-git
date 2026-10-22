import { z } from "zod";
import { canonicalHash, canonicalize, omitKeys } from "../shared/canonical";
import { attributionEntrySchema, deriveAttribution, deriveRights, rightsSchema, timingSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecordContext } from "../shared/run-record";
import { engineEnvironments } from "../shared/states";
import { operationalConfidencePolicy } from "./confidence";
import { compareOperationalDecimals, operationalDecimalPolicy } from "./decimal";
import {
  OPERATIONAL_REQUEST_CONTRACT, OPERATIONAL_RESULT_CONTRACT, OPERATIONAL_VERSION,
  operationalAnalyses, operationalInputSchema, operationalRequestSchema, operationalTimestamp, type OperationalRequest,
} from "./model";
import { ensureOperationalSize, normalizeOperationalInputs, normalizeOperationalRequest, operationalBounds, operationalEvidence, operationalWork } from "./request";

export const operationalContextSchema = z.object({
  runId: identifierSchema, evaluatedAt: operationalTimestamp, environment: z.enum(engineEnvironments), timing: timingSchema,
}).strict();
export type OperationalContext = z.infer<typeof operationalContextSchema>;
export const operationalReasons = [
  "M1_CALCULATIONS_DEFERRED", "UNSUPPORTED_PROCESS_NETWORK", "MISSING_REQUIRED_SCHEDULE", "INCOMPLETE_COVERAGE",
  "MISSING_OPERAND", "INPUT_NOT_AVAILABLE", "APPROVAL_REQUIRED", "QUOTATION_NOT_COMMITMENT",
  "INCOMPLETE_APPLICABILITY", "SCENARIO_NOT_DECLARED", "SENSITIVITY_NOT_DECLARED", "INCOMPATIBLE_UNITS",
  "ZERO_DENOMINATOR", "INCOMPLETE_TIMING", "INCOMPATIBLE_COHORT", "INCOMPATIBLE_RESOURCE",
] as const;
type Reason = typeof operationalReasons[number];
export const operationalFoundationResultSchema = z.object({
  contract: z.literal(OPERATIONAL_RESULT_CONTRACT), phase: z.literal("M1_FOUNDATION"),
  runId: identifierSchema, evaluatedAt: operationalTimestamp,
  engine: z.object({ key: z.literal("operational-feasibility"), version: z.literal(OPERATIONAL_VERSION), environment: z.enum(engineEnvironments) }).strict(),
  request: z.object({ normalized: operationalRequestSchema, evaluatedAt: operationalTimestamp }).strict(),
  inputs: z.array(operationalInputSchema).max(32),
  metrics: z.array(z.object({
    key: identifierSchema, analysis: z.enum(operationalAnalyses), status: z.enum(["NOT_SUPPORTED", "NOT_COMPUTABLE"]),
    value: z.null(), confidence: z.null(), interpretation: z.literal("UNAVAILABLE"),
    method: z.object({ id: z.literal("operational-m1-foundation"), version: z.literal("1.0.0") }).strict(),
    reasons: z.array(z.enum(operationalReasons)).min(1).max(16),
    limitations: z.array(z.string().min(1).max(500)).min(1).max(10),
  }).strict()).min(1).max(9),
  rights: rightsSchema, attribution: z.array(attributionEntrySchema).max(32),
  policies: z.object({
    decimal: z.object({
      id: z.literal(operationalDecimalPolicy.id), version: z.literal("1.0.0"), precision: z.literal(34),
      rounding: z.literal("HALF_EVEN"), maxIntegerDigits: z.literal(18), maxInputScale: z.literal(16), reportingScale: z.literal(6),
    }).strict(),
    confidence: z.object({
      id: z.literal(operationalConfidencePolicy.id), version: z.literal("1.0.0"), kind: z.literal("EVIDENCE_QUALITY_BANDS"),
      isProbability: z.literal(false), rules: z.array(z.string().min(1).max(500)).length(5),
    }).strict(),
  }).strict(),
  status: z.literal("COMPLETED_WITH_GAPS"), realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
  limits: z.object({ costUnits: z.number().int().nonnegative().max(20_000), budgetUnits: z.literal(20_000) }).strict(),
  timing: timingSchema, determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
}).strict();
const scheduleRequirements: Record<typeof operationalAnalyses[number], readonly string[]> = {
  CAPACITY: ["TARGET", "RESOURCE_TIME", "CYCLE_TIME"], WORKFORCE: ["TARGET", "LABOR_TIME", "STAFF_AVAILABILITY", "FTE_HOURS"],
  SUPPLY: ["CONSUMPTION", "SUPPLIER"], INVENTORY: ["OPENING_STOCK", "RECEIPTS", "CONSUMPTION", "ADJUSTMENTS"],
  REORDER: ["CONSUMPTION_RATE", "LEAD_TIME", "SAFETY_STOCK"], QUALITY: ["INSPECTED", "ACCEPTED", "REJECTED"],
  PREREQUISITES: [], SCENARIOS: [], SENSITIVITY: [],
};
export function supportsOperationalSerial(request: OperationalRequest) {
  const stages = request.network.stages;
  return request.network.kind === "SIMPLE_SERIAL" && request.network.lossBasis === "NET_GOOD_OUTPUT"
    && new Set(stages.map((s) => s.poolId)).size === stages.length && new Set(stages.map((s) => s.outputId)).size === 1;
}
function buildCore(rawRequest: unknown, rawInputs: unknown, rawContext: OperationalContext) {
  const context = operationalContextSchema.parse(rawContext);
  const request = normalizeOperationalRequest(rawRequest, context.evaluatedAt);
  const inputs = normalizeOperationalInputs(rawInputs);
  const referencesAvailable = operationalEvidence(request.normalized).every((ref) =>
    inputs.some((i) => i.id === ref.inputId && i.ref.id === ref.versionId && i.checksum?.value === ref.checksum));
  const rights = deriveRights(inputs);
  const metrics = request.normalized.analyses.map((analysis) => {
    const reasons: Reason[] = ["M1_CALCULATIONS_DEFERRED"];
    const unsupported = !supportsOperationalSerial(request.normalized);
    if (unsupported) reasons.push("UNSUPPORTED_PROCESS_NETWORK");
    if (!referencesAvailable) reasons.push("INPUT_NOT_AVAILABLE");
    if (request.normalized.values.some((v) => v.approval !== "OWNER_APPROVED")) reasons.push("APPROVAL_REQUIRED");
    for (const kind of scheduleRequirements[analysis]) {
      if (kind === "CYCLE_TIME" && request.normalized.calculationSemantics?.resources.length
        && request.normalized.calculationSemantics.resources.every((r) => r.productivity.kind === "NET_RATE")) continue;
      if (kind === "LABOR_TIME" && request.normalized.calculationSemantics?.workforce.length) continue;
      const schedule = request.normalized.schedules.find((s) => s.kind === kind);
      if (!schedule || schedule.completeness === "MISSING") { reasons.push("MISSING_REQUIRED_SCHEDULE"); continue; }
      if (schedule.completeness !== "COMPLETE" || schedule.coveredPeriodIds.length !== request.normalized.periods.length) reasons.push("INCOMPLETE_COVERAGE");
      if (schedule.rows.some((row) => request.normalized.values.find((v) => v.id === row.valueId)?.value === null)) reasons.push("MISSING_OPERAND");
      if (kind === "SUPPLIER" && schedule.rows.some((row) => row.supplierStatus !== "COMMITTED")) reasons.push("QUOTATION_NOT_COMMITMENT");
      if (["SUPPLIER", "RECEIPTS"].includes(kind) && schedule.rows.some((row) => row.effectiveDate === null)) reasons.push("INCOMPLETE_TIMING");
      if (["CYCLE_TIME", "FTE_HOURS", "INSPECTED"].includes(kind) && schedule.rows.some((row) => {
        const value = request.normalized.values.find((v) => v.id === row.valueId)?.value;
        return value !== null && value !== undefined && compareOperationalDecimals(value, "0") === 0;
      })) reasons.push("ZERO_DENOMINATOR");
    }
    if (analysis === "PREREQUISITES" && !request.normalized.requirements.applicabilityComplete) reasons.push("INCOMPLETE_APPLICABILITY");
    if (analysis === "SCENARIOS" && !request.normalized.scenarios.length) reasons.push("SCENARIO_NOT_DECLARED");
    if (analysis === "SENSITIVITY" && !request.normalized.sensitivity.length) reasons.push("SENSITIVITY_NOT_DECLARED");
    if (analysis === "CAPACITY") {
      const cycles = request.normalized.schedules.find((s) => s.kind === "CYCLE_TIME");
      const resources = request.normalized.schedules.find((s) => s.kind === "RESOURCE_TIME");
      for (const stage of request.normalized.network.stages) for (const period of request.normalized.periods) {
        const resourceRows = resources?.rows.filter((row) => row.periodId === period.id && row.entityId === stage.poolId) ?? [];
        const declaredRate = request.normalized.calculationSemantics?.resources.find((r) => r.stageId === stage.id
          && r.periodId === period.id && r.productivity.kind === "NET_RATE");
        const cycleRows = cycles?.rows.filter((row) => {
          const value = request.normalized.values.find((v) => v.id === row.valueId);
          return row.periodId === period.id && value?.unit.kind === "TIME_PER_UNIT"
            && value.unit.poolId === stage.poolId && value.unit.entity === stage.outputId;
        }) ?? [];
        if (resourceRows.length !== 1 || !declaredRate && cycleRows.length !== 1) reasons.push("INCOMPATIBLE_RESOURCE");
      }
    }
    if (analysis === "QUALITY") {
      const schedules = request.normalized.schedules.filter((s) => ["INSPECTED", "ACCEPTED", "REJECTED"].includes(s.kind));
      if (new Set(schedules.map((s) => s.cohortId)).size > 1) reasons.push("INCOMPATIBLE_COHORT");
    }
    if (analysis === "REORDER") {
      const rate = request.normalized.schedules.find((s) => s.kind === "CONSUMPTION_RATE");
      const lead = request.normalized.schedules.find((s) => s.kind === "LEAD_TIME");
      for (const row of rate?.rows ?? []) {
        const rateValue = request.normalized.values.find((v) => v.id === row.valueId);
        const leadRow = lead?.rows.find((r) => r.periodId === row.periodId && r.entityId === row.entityId);
        const leadValue = request.normalized.values.find((v) => v.id === leadRow?.valueId);
        if (rateValue?.unit.kind === "RATE" && leadValue?.unit.kind === "LEAD_TIME" && rateValue.unit.per !== leadValue.unit.basis) reasons.push("INCOMPATIBLE_UNITS");
      }
    }
    return {
      key: `readiness.${analysis.toLowerCase()}`, analysis, status: unsupported ? "NOT_SUPPORTED" as const : "NOT_COMPUTABLE" as const,
      value: null, confidence: null, interpretation: "UNAVAILABLE" as const,
      method: { id: "operational-m1-foundation", version: "1.0.0" }, reasons: [...new Set(reasons)].sort(),
      limitations: ["M1 validates contracts and prerequisites only, not operational capacity, readiness, success or a launch decision."],
    };
  });
  return {
    contract: OPERATIONAL_RESULT_CONTRACT, phase: "M1_FOUNDATION" as const,
    runId: context.runId, evaluatedAt: context.evaluatedAt,
    engine: { key: "operational-feasibility", version: OPERATIONAL_VERSION, environment: context.environment },
    request: { normalized: request.normalized, evaluatedAt: context.evaluatedAt },
    inputs, metrics, rights, attribution: deriveAttribution(inputs),
    policies: { decimal: operationalDecimalPolicy, confidence: operationalConfidencePolicy },
    status: "COMPLETED_WITH_GAPS" as const, realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
    limits: { costUnits: operationalWork(request.normalized).costUnits, budgetUnits: operationalBounds.budgetUnits },
    timing: context.timing,
  };
}
export function buildOperationalFoundationResult(rawRequest: unknown, rawInputs: unknown, context: OperationalContext) {
  const core = buildCore(rawRequest, rawInputs, context);
  const result = operationalFoundationResultSchema.parse({
    ...core, determinism: {
      requestHash: canonicalHash(core.request), inputsHash: canonicalHash(core.inputs),
      outputHash: canonicalHash(omitKeys(core, ["runId", "timing"])),
    },
  });
  ensureOperationalSize(result);
  return result;
}
export type OperationalFoundationResult = ReturnType<typeof buildOperationalFoundationResult>;
export function validateOperationalFoundationResult(raw: unknown): OperationalFoundationResult {
  ensureOperationalSize(raw);
  const shell = z.object({
    runId: identifierSchema, evaluatedAt: operationalTimestamp,
    engine: z.object({ environment: z.enum(engineEnvironments) }),
    request: z.object({ normalized: z.unknown() }), inputs: z.unknown(), timing: timingSchema,
  }).parse(raw);
  const expected = buildOperationalFoundationResult(shell.request.normalized, shell.inputs, {
    runId: shell.runId, evaluatedAt: shell.evaluatedAt, environment: shell.engine.environment, timing: shell.timing,
  });
  if (canonicalize(raw) !== canonicalize(expected)) throw new RangeError("Operational M1 result/hash/semantics mismatch");
  return expected;
}

/** Pure storage compatibility proof only; no authorization, persistence or historical replay. */
export function buildOperationalFoundationRecord(raw: unknown, context: RunRecordContext) {
  const result = validateOperationalFoundationResult(raw);
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: result.runId, engineKey: result.engine.key, engineVersion: result.engine.version,
    requestContract: OPERATIONAL_REQUEST_CONTRACT, resultContract: OPERATIONAL_RESULT_CONTRACT,
    environment: result.engine.environment, status: result.status, ...result.determinism, request: result.request, result,
    errorCode: null, confidence: null, gaps: { BLOCKING: result.metrics.length, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: result.timing, cost: result.limits,
    runtime: { phase: result.phase, decimalPolicy: operationalDecimalPolicy, confidencePolicy: operationalConfidencePolicy },
    createdAt: context.createdAt, inputs: result.inputs.map(toRunInputRecord),
  });
  ensureOperationalSize(record);
  return record;
}
