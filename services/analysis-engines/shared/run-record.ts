import { z } from "zod";
import { canonicalize } from "./canonical";
import {
  completenessLevels, engineInputSchema, findEnvelopeViolations, inputGovernances, inputKinds, limitsShape, referenceSystems, timingSchema,
  type EngineInput, type EngineMetric, type EnvelopeView,
} from "./contracts";
import { EngineError, engineErrorCodes } from "./errors";
import { summarizeGaps } from "./gaps";
import { identifierSchema, sha256Schema, timestampSchema } from "./primitives";
import { bandRank, confidenceBands, engineEnvironments, runStatuses, type ConfidenceBand } from "./states";

/**
 * Shape of the append-only record every engine run leaves behind (`AnalysisEngineRun` with its `AnalysisEngineRunInput` rows).
 * It is a contract only: this module has no database access. Persistence arrives with its own additive migration, and the
 * record never holds a foreign key to Projects or to the Map. `subject` is an opaque reference the caller may attach later.
 *
 * Reproducibility: the record keeps the full normalized request, the full result, the checksum of every input and the three
 * hashes. Running the same engine version with the stored request and the stored `evaluatedAt` against the same input
 * checksums must give the same output hash.
 */
export const ENGINE_RUN_RECORD_CONTRACT = "jenan.analysis-engine.run-record/v1";
/** A stored request or result is limited to 2 MiB of canonical JSON. */
export const MAX_RUN_JSON_BYTES = 2 * 1024 * 1024;
export const actorKinds = ["USER", "ROBOT", "SYSTEM"] as const;

function withinJsonLimit(value: unknown) {
  try { return Buffer.byteLength(canonicalize(value), "utf8") <= MAX_RUN_JSON_BYTES; } catch { return false; }
}
const jsonObjectSchema = z.custom<Record<string, unknown>>((value) => typeof value === "object" && value !== null && !Array.isArray(value) && withinJsonLimit(value), "A JSON object of at most 2 MiB");

export const runInputRecordSchema = z.object({
  inputId: identifierSchema,
  roles: z.array(z.string().min(1).max(80)).min(1).max(32),
  kind: z.enum(inputKinds),
  governance: z.enum(inputGovernances),
  completeness: z.enum(completenessLevels),
  refSystem: z.enum(referenceSystems),
  refId: identifierSchema,
  refVersion: z.number().int().min(1).nullable(),
  checksum: sha256Schema.nullable(),
  // The complete descriptor as it was when the run happened; later changes to the dataset never rewrite history.
  snapshot: engineInputSchema,
}).strict().superRefine((row, context) => {
  const { snapshot } = row;
  const same = snapshot.id === row.inputId && snapshot.kind === row.kind && snapshot.governance === row.governance && snapshot.completeness === row.completeness
    && snapshot.ref.system === row.refSystem && snapshot.ref.id === row.refId && snapshot.ref.version === row.refVersion
    && (snapshot.checksum?.value ?? null) === row.checksum && canonicalize(snapshot.roles) === canonicalize(row.roles);
  if (!same) context.addIssue({ code: "custom", message: "The columns must repeat what the snapshot says" });
});
export type RunInputRecord = z.infer<typeof runInputRecordSchema>;

export function toRunInputRecord(input: EngineInput): RunInputRecord {
  return {
    inputId: input.id, roles: [...input.roles], kind: input.kind, governance: input.governance, completeness: input.completeness,
    refSystem: input.ref.system, refId: input.ref.id, refVersion: input.ref.version, checksum: input.checksum?.value ?? null, snapshot: input,
  };
}

export const confidenceSummarySchema = z.object({
  metricCount: z.number().int().min(0),
  valuedCount: z.number().int().min(0),
  lowestBand: z.enum(confidenceBands).nullable(),
  bands: z.object({ HIGH: z.number().int().min(0), MEDIUM: z.number().int().min(0), LOW: z.number().int().min(0), INSUFFICIENT: z.number().int().min(0) }).strict(),
  policies: z.array(z.string().min(1).max(100)).max(8),
}).strict();
export type ConfidenceSummary = z.infer<typeof confidenceSummarySchema>;

/** Counts of valued measurements per confidence band; valueless measurements carry no confidence and are not counted in a band. */
export function summarizeConfidence(metrics: readonly EngineMetric[]): ConfidenceSummary {
  const bands: Record<ConfidenceBand, number> = { HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 };
  const policies = new Set<string>();
  let lowest: ConfidenceBand | null = null;
  for (const metric of metrics) {
    if (!metric.confidence) continue;
    bands[metric.confidence.band] += 1;
    policies.add(`${metric.confidence.policyId}@${metric.confidence.policyVersion}`);
    if (lowest === null || bandRank(metric.confidence.band) < bandRank(lowest)) lowest = metric.confidence.band;
  }
  return { metricCount: metrics.length, valuedCount: metrics.filter((metric) => metric.value !== null).length, lowestBand: lowest, bands, policies: [...policies].sort() };
}

export const runRecordSchema = z.object({
  contract: z.literal(ENGINE_RUN_RECORD_CONTRACT),
  runId: identifierSchema,
  engineKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  engineVersion: z.string().min(1).max(32),
  requestContract: z.string().min(1).max(120),
  resultContract: z.string().min(1).max(120),
  environment: z.enum(engineEnvironments),
  status: z.enum(runStatuses),
  requestHash: sha256Schema,
  inputsHash: sha256Schema.nullable(),
  outputHash: sha256Schema.nullable(),
  request: jsonObjectSchema,
  result: jsonObjectSchema.nullable(),
  errorCode: z.enum(engineErrorCodes).nullable(),
  confidence: confidenceSummarySchema.nullable(),
  gaps: z.object({ BLOCKING: z.number().int().min(0), WARNING: z.number().int().min(0), INFO: z.number().int().min(0) }).strict(),
  actor: z.object({ kind: z.enum(actorKinds), id: identifierSchema.nullable() }).strict(),
  subject: z.string().min(1).max(128).nullable(),
  timing: timingSchema,
  cost: z.object(limitsShape).strict(),
  runtime: jsonObjectSchema,
  createdAt: timestampSchema,
  inputs: z.array(runInputRecordSchema).max(200),
}).strict().superRefine((record, context) => {
  const failedBeforeResult = record.result === null;
  if (failedBeforeResult && (record.status !== "FAILED" || record.errorCode === null)) context.addIssue({ code: "custom", message: "A run without a result is FAILED and names its error code" });
  if (!failedBeforeResult && record.errorCode !== null) context.addIssue({ code: "custom", message: "A run with a result has no error code" });
  if (failedBeforeResult !== (record.outputHash === null)) context.addIssue({ code: "custom", message: "outputHash exists exactly when the result exists" });
  if (failedBeforeResult !== (record.inputsHash === null)) context.addIssue({ code: "custom", message: "inputsHash exists exactly when the result exists" });
  if (failedBeforeResult && (record.confidence !== null || record.inputs.length > 0)) context.addIssue({ code: "custom", message: "A run without a result has no confidence summary and no inputs" });
  const ids = record.inputs.map((row) => row.inputId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Input ids must be unique within a run" });
});
export type RunRecord = z.infer<typeof runRecordSchema>;

export interface RunEnvelope extends EnvelopeView {
  runId: string;
  engine: EnvelopeView["engine"] & { key: string; version: string; contracts: { request: string; result: string }; runtime?: Record<string, unknown> };
}
export interface RunRecordContext {
  actor: { kind: typeof actorKinds[number]; id: string | null };
  subject?: string | null;
  createdAt: string;
}

/** Builds the append-only record of a finished run. A result that breaks its own contract is refused instead of being stored. */
export function buildRunRecord(envelope: RunEnvelope, context: RunRecordContext): RunRecord {
  const violations = findEnvelopeViolations(envelope);
  if (violations.length > 0) throw new EngineError("CONTRACT_VIOLATION", { count: violations.length, first: `${violations[0]?.path}: ${violations[0]?.detail}` });
  if (!withinJsonLimit(envelope)) throw new EngineError("CONTRACT_VIOLATION", { reason: "result_too_large" });
  const metrics = envelope.results.flatMap((result) => result.metrics);
  const record: RunRecord = {
    contract: ENGINE_RUN_RECORD_CONTRACT,
    runId: envelope.runId,
    engineKey: envelope.engine.key,
    engineVersion: envelope.engine.version,
    requestContract: envelope.engine.contracts.request,
    resultContract: envelope.engine.contracts.result,
    environment: envelope.engine.environment,
    status: envelope.status,
    requestHash: envelope.determinism.requestHash,
    inputsHash: envelope.determinism.inputsHash,
    outputHash: envelope.determinism.outputHash,
    request: envelope.request,
    result: envelope as unknown as Record<string, unknown>,
    errorCode: null,
    confidence: summarizeConfidence(metrics),
    gaps: summarizeGaps(envelope.gaps),
    actor: context.actor,
    subject: context.subject ?? null,
    timing: { startedAt: envelope.timing.startedAt, finishedAt: envelope.timing.finishedAt, durationMs: envelope.timing.durationMs },
    cost: { costUnits: envelope.limits.costUnits, budgetUnits: envelope.limits.budgetUnits },
    runtime: envelope.engine.runtime ?? {},
    createdAt: context.createdAt,
    inputs: envelope.inputs.map(toRunInputRecord),
  };
  return record;
}
