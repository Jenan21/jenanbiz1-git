import { z } from "zod";
import { canonicalHash, canonicalize, sha256Hex } from "../shared/canonical";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecord } from "../shared/run-record";
import { identifierSchema } from "../shared/primitives";
import { OPERATIONAL_CALCULATION_VERSION, validateOperationalCalculationResult, type OperationalCalculationResult } from "./calculations";
import { type OperationalContext } from "./contracts";
import { operationalDiscoverySchema, operationalReadSchema, type OperationalDataPort } from "./data-port";
import { calculateOperationalData } from "./data-sources";
import { operationalTimestamp } from "./model";
import { ensureOperationalSize } from "./request";

export const operationalHistoryAccessSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: identifierSchema.optional(),
}).strict();
export const operationalRecordContextSchema = z.object({
  actor: z.object({ kind: z.enum(["USER", "ROBOT"]), id: identifierSchema }).strict(),
  createdAt: operationalTimestamp, subject: z.string().min(1).max(128).optional(),
  access: operationalHistoryAccessSchema,
}).strict();
export type OperationalHistoryAccess = z.infer<typeof operationalHistoryAccessSchema>;
export type OperationalRecordContext = z.infer<typeof operationalRecordContextSchema>;
const transcriptEntrySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("DISCOVER"),
    query: z.object({ versionIds: z.array(identifierSchema).length(1) }).strict(),
    response: operationalDiscoverySchema,
  }).strict(),
  z.object({
    operation: z.literal("READ"),
    query: z.object({ versionId: identifierSchema, expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    response: operationalReadSchema,
  }).strict(),
]);
export const operationalHistoryRuntimeSchema = z.object({
  contract: z.literal("jenan.operational-feasibility.run-history/v1"),
  replayAuthorizationContext: operationalHistoryAccessSchema,
  transcript: z.array(transcriptEntrySchema).length(2),
  policies: z.object({
    calculations: z.literal(OPERATIONAL_CALCULATION_VERSION),
    decimal: z.literal("operational-decimal-v1/1.0.0"),
    rounding: z.literal("6-decimal/HALF_EVEN+declared-whole-deliverables-down+homogeneous-staff-up"),
    confidence: z.literal("operational-confidence-v1/1.0.0"),
  }).strict(),
}).strict();
export type OperationalReadTranscript = z.infer<typeof operationalHistoryRuntimeSchema>["transcript"];
export type OperationalHistoryRuntime = z.infer<typeof operationalHistoryRuntimeSchema>;
export class OperationalHistoryUnavailable extends Error {
  constructor() { super("This Operational run or its historical inputs are unavailable"); this.name = "OperationalHistoryUnavailable"; }
}
export class OperationalHistoryMismatch extends Error {
  constructor(readonly reason: "ENGINE_VERSION" | "STORED_EVIDENCE" | "VERSION_CHECKSUM" | "OUTPUT_HASH") {
    super(`Operational historical integrity mismatch: ${reason}`); this.name = "OperationalHistoryMismatch";
  }
}
export class OperationalPreparationRejected extends Error {
  constructor(readonly status: string, readonly reason: string) {
    super(`Operational input preparation rejected: ${status} / ${reason}`); this.name = "OperationalPreparationRejected";
  }
}
export function captureOperationalReads(port: OperationalDataPort) {
  const transcript: OperationalReadTranscript = [];
  const capture = (entry: OperationalReadTranscript[number]) => {
    if (transcript.length >= 2) throw new RangeError("Operational historical transcript exceeds two exact model operations");
    transcript.push(structuredClone(entry)); ensureOperationalSize(transcript);
  };
  return {
    transcript,
    port: {
      async discover(query) {
        const response = operationalDiscoverySchema.parse(await port.discover(query));
        capture({ operation: "DISCOVER", query, response }); return response;
      },
      async read(query) {
        const response = operationalReadSchema.parse(await port.read(query));
        capture({ operation: "READ", query, response }); return response;
      },
    } satisfies OperationalDataPort,
  };
}
export async function analyzeOperationalData(port: OperationalDataPort, request: unknown, context: OperationalContext) {
  const output = await calculateOperationalData(port, request, context);
  if (!output.result) {
    if (output.preparation.status === "NOT_AVAILABLE") throw new OperationalHistoryUnavailable();
    throw new OperationalPreparationRejected(output.preparation.status, output.preparation.reason);
  }
  return output.result;
}
export async function reproduceOperationalTranscript(result: OperationalCalculationResult, rawTranscript: OperationalReadTranscript) {
  ensureOperationalSize(rawTranscript);
  const transcript = z.array(transcriptEntrySchema).length(2).parse(rawTranscript);
  const read = transcript[1];
  if (read?.operation !== "READ" || read.response.status !== "AVAILABLE") throw new OperationalHistoryMismatch("STORED_EVIDENCE");
  const reference = read.response.reference;
  let index = 0;
  const take = (operation: "DISCOVER" | "READ", query: unknown) => {
    const entry = transcript[index++];
    if (!entry || entry.operation !== operation || canonicalize(entry.query) !== canonicalize(query)) throw new OperationalHistoryMismatch("STORED_EVIDENCE");
    return entry;
  };
  const port: OperationalDataPort = {
    async discover(query) {
      const entry = take("DISCOVER", query);
      if (entry.operation !== "DISCOVER") throw new OperationalHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
    async read(query) {
      const entry = take("READ", query);
      if (entry.operation !== "READ") throw new OperationalHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
  };
  const reproduced = await analyzeOperationalData(port, {
    model: result.request.normalized,
    source: { sourceId: reference.source.sourceId, versionId: reference.version.versionId, checksum: reference.version.checksum.value },
  }, { runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing });
  if (index !== transcript.length || canonicalize(reproduced) !== canonicalize(result)) throw new OperationalHistoryMismatch("OUTPUT_HASH");
  return reproduced;
}
export async function buildOperationalRunRecord(
  rawResult: OperationalCalculationResult, rawContext: OperationalRecordContext, transcript: OperationalReadTranscript,
): Promise<RunRecord> {
  const context = operationalRecordContextSchema.parse(rawContext);
  const result = validateOperationalCalculationResult(rawResult);
  const runtime = operationalHistoryRuntimeSchema.parse({
    contract: "jenan.operational-feasibility.run-history/v1", replayAuthorizationContext: context.access, transcript,
    policies: {
      calculations: OPERATIONAL_CALCULATION_VERSION, decimal: "operational-decimal-v1/1.0.0",
      rounding: "6-decimal/HALF_EVEN+declared-whole-deliverables-down+homogeneous-staff-up", confidence: "operational-confidence-v1/1.0.0",
    },
  });
  ensureOperationalSize(runtime);
  if (context.createdAt < result.evaluatedAt) throw new RangeError("Operational record cannot predate evaluation");
  await reproduceOperationalTranscript(result, runtime.transcript);
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: result.runId, engineKey: result.engine.key, engineVersion: result.engine.version,
    requestContract: "jenan.operational-feasibility.request/v1", resultContract: result.contract,
    environment: result.engine.environment, status: result.status, ...result.determinism,
    request: result.request, result, errorCode: null, confidence: null,
    gaps: { BLOCKING: result.metrics.filter((metric) => metric.value === null).length, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: result.timing,
    cost: { costUnits: result.limits.totalCostUnits, budgetUnits: 20_000 },
    runtime, createdAt: context.createdAt, inputs: result.inputs.map(toRunInputRecord),
  });
  ensureOperationalSize(record);
  ensureOperationalSize({ record, inputHistory: result.inputs.map((input) => operationalInputHistory(result, runtime.transcript, input.id)) });
  return record;
}
export async function validateOperationalRunRecord(raw: unknown) {
  ensureOperationalSize(raw);
  const record = runRecordSchema.parse(raw);
  if (record.engineKey !== "operational-feasibility" || record.engineVersion !== OPERATIONAL_CALCULATION_VERSION
    || record.requestContract !== "jenan.operational-feasibility.request/v1"
    || record.resultContract !== "jenan.operational-feasibility.calculation-result/v1") throw new OperationalHistoryMismatch("ENGINE_VERSION");
  const runtime = operationalHistoryRuntimeSchema.parse(record.runtime);
  const result = validateOperationalCalculationResult(record.result);
  const expected = await buildOperationalRunRecord(result, {
    actor: operationalRecordContextSchema.shape.actor.parse(record.actor), createdAt: record.createdAt,
    access: runtime.replayAuthorizationContext, ...(record.subject === null ? {} : { subject: record.subject }),
  }, runtime.transcript);
  if (canonicalize(expected) !== canonicalize(record)) throw new OperationalHistoryMismatch("STORED_EVIDENCE");
  return { record, result, runtime };
}
export function operationalInputHistory(result: OperationalCalculationResult, transcript: OperationalReadTranscript, inputId: string) {
  const input = result.inputs.find((entry) => entry.id === inputId);
  const read = transcript.find((entry) => entry.operation === "READ");
  if (!input || read?.operation !== "READ" || read.response.status !== "AVAILABLE"
    || read.response.reference.version.versionId !== input.ref.id || read.query.expectedChecksum !== input.checksum?.value) {
    throw new OperationalHistoryMismatch("STORED_EVIDENCE");
  }
  return {
    reference: read.response.reference, contentHash: sha256Hex(read.response.content),
    provenance: {
      contract: "jenan.operational-feasibility.input-provenance/v1", reference: read.response.reference,
      modelHash: canonicalHash(result.request.normalized), model: result.request.normalized,
    },
    usageIntent: {
      contract: "jenan.operational-feasibility.input-usage/v1", consumer: "operational-feasibility",
      runId: result.runId, versionId: input.ref.id, checksum: input.checksum?.value, roles: input.roles,
      analyses: result.request.normalized.analyses,
    },
  };
}
