import { z } from "zod";
import { canonicalHash, canonicalize, omitKeys } from "../shared/canonical";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, type RunRecord } from "../shared/run-record";
import { riskContextSchema } from "./contracts";
import { RISK_INTERPRETATION_VERSION } from "./interpretation";
import { normalizeRiskRequest } from "./request";
import { riskDecimalPolicy, riskTimestampSchema } from "./semantics";
import { ensureRiskJsonSize } from "./snapshots";

export const RISK_HISTORY_VERSION = "1.0.0-m4";
export const riskHistoryContextSchema = riskContextSchema.omit({ evaluatedAt: true }).extend({
  createdAt: riskTimestampSchema,
}).strict().superRefine((value, context) => {
  if (value.timing.finishedAt < value.timing.startedAt || value.createdAt < value.timing.finishedAt ||
    Date.parse(value.timing.finishedAt) - Date.parse(value.timing.startedAt) !== value.timing.durationMs) {
    context.addIssue({ code: "custom", message: "Explicit history timing and creation instant must agree" });
  }
});
export type RiskHistoryContext = z.infer<typeof riskHistoryContextSchema>;
export const riskHistoryAccessSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(), missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: z.string().min(1).max(128).optional(),
}).strict();
export const riskHistoryRuntimeSchema = z.object({
  contract: z.literal("jenan.risk-decision.history/v1"),
  historyVersion: z.literal(RISK_HISTORY_VERSION),
  interpreterVersion: z.literal(RISK_INTERPRETATION_VERSION),
  decimal: z.literal(`${riskDecimalPolicy.id}/${riskDecimalPolicy.version}`),
  rounding: z.literal("NONE_PRESERVE_UPSTREAM"),
  confidence: z.literal("NATIVE_EVIDENCE_QUALITY_ONLY_NO_COMMON_BAND_OR_PROBABILITY"),
  access: riskHistoryAccessSchema, evaluatedAt: riskTimestampSchema,
  policyHash: sha256Schema, preparationHash: sha256Schema,
  parent: z.object({ runId: identifierSchema, recordHash: sha256Schema, outputHash: sha256Schema }).strict().nullable(),
  recordHash: sha256Schema,
}).strict();
export type RiskHistoryRuntime = z.infer<typeof riskHistoryRuntimeSchema>;
export type RiskHistoryParent = RiskHistoryRuntime["parent"];
export class RiskHistoryError extends Error {
  constructor(readonly code: "RISK_HISTORY_UNAVAILABLE" | "RISK_HISTORY_NOT_SUPPORTED" | "RISK_HISTORY_MISMATCH" | "RISK_HISTORY_DUPLICATE") {
    super(code); this.name = "RiskHistoryError";
  }
}
export function riskHistoryRecordHash(record: RunRecord) {
  return canonicalHash({ ...record, runtime: omitKeys(record.runtime, ["recordHash"]) });
}
/** Stored metadata/hash integrity only. Current authorization and exact re-interpretation belong to the server adapter. */
export function validateRiskHistoryRecord(raw: unknown) {
  try {
    return validateRecord(raw);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof RangeError) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
    throw error;
  }
}
function validateRecord(raw: unknown) {
  ensureRiskJsonSize(raw);
  const record = runRecordSchema.parse(raw);
  const runtime = riskHistoryRuntimeSchema.parse(record.runtime);
  const request = normalizeRiskRequest(record.request, runtime.evaluatedAt);
  const result = z.looseObject({
    contract: z.literal("jenan.risk-decision.result/v1"), phase: z.literal("M3_INTERPRETATION"),
    engine: z.object({ key: z.literal("risk-decision"), version: z.literal(RISK_INTERPRETATION_VERSION) }).strict(),
    evaluatedAt: riskTimestampSchema,
    determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
  }).parse(record.result);
  if (!record.result || record.contract !== ENGINE_RUN_RECORD_CONTRACT || record.engineKey !== "risk-decision" ||
    record.engineVersion !== RISK_HISTORY_VERSION || record.requestContract !== "jenan.risk-decision.request/v1" ||
    record.resultContract !== "jenan.risk-decision.result/v1" || record.status !== "COMPLETED_WITH_GAPS" ||
    record.actor.id === null || record.actor.kind === "SYSTEM" || record.subject !== request.normalized.scope.subject ||
    record.requestHash !== request.requestHash || record.inputsHash !== canonicalHash(record.inputs.map((input) => input.snapshot)) ||
    record.outputHash !== canonicalHash(record.result) || runtime.recordHash !== riskHistoryRecordHash(record) ||
    result.evaluatedAt !== runtime.evaluatedAt || result.determinism.requestHash !== record.requestHash ||
    result.determinism.outputHash !== canonicalHash(omitKeys(result, ["determinism"])) ||
    record.confidence !== null || record.errorCode !== null ||
    canonicalize(record.request) !== canonicalize(request.normalized)) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
  riskHistoryContextSchema.parse({ runId: record.runId, environment: record.environment, timing: record.timing, createdAt: record.createdAt });
  if (record.createdAt < runtime.evaluatedAt || runtime.parent?.runId === record.runId) throw new RiskHistoryError("RISK_HISTORY_MISMATCH");
  return { record, runtime, request: request.normalized };
}
