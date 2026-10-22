import { z } from "zod";
import { canonicalize, sha256Hex } from "../shared/canonical";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecord } from "../shared/run-record";
import { identifierSchema } from "../shared/primitives";
import { buildFinancialCalculationResult, FINANCIAL_CALCULATION_VERSION, validateFinancialCalculationResult, type FinancialCalculationResult } from "./calculations";
import { type FinancialContext } from "./contracts";
import { financialDiscoverySchema, financialReadSchema, type FinancialDataPort } from "./data-port";
import { prepareFinancialData } from "./data-sources";
import { financialTimestamp } from "./model";
import { ensureFinancialSize } from "./request";

export const financialHistoryAccessSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: identifierSchema.optional(),
}).strict();
export const financialRecordContextSchema = z.object({
  actor: z.object({ kind: z.enum(["USER", "ROBOT"]), id: identifierSchema }).strict(),
  createdAt: financialTimestamp, subject: z.string().min(1).max(128).optional(),
  access: financialHistoryAccessSchema,
}).strict();
export type FinancialHistoryAccess = z.infer<typeof financialHistoryAccessSchema>;
export type FinancialRecordContext = z.infer<typeof financialRecordContextSchema>;
const transcriptEntrySchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("DISCOVER"),
    query: z.object({ versionIds: z.array(identifierSchema).length(1) }).strict(), response: financialDiscoverySchema,
  }).strict(),
  z.object({
    operation: z.literal("READ"),
    query: z.object({ versionId: identifierSchema, expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    response: financialReadSchema,
  }).strict(),
]);
export const financialHistoryRuntimeSchema = z.object({
  contract: z.literal("jenan.financial-feasibility.run-history/v1"),
  replayAuthorizationContext: financialHistoryAccessSchema,
  transcript: z.array(transcriptEntrySchema).length(2),
  policies: z.object({
    calculations: z.literal("financial-calculation-v1/1.0.0"),
    decimal: z.literal("financial-decimal-v1/1.0.0"),
    rounding: z.literal("currency-minor-units+6-decimal-percentage-quantity/HALF_EVEN"),
    confidence: z.literal("financial-confidence-v1/1.0.0"),
  }).strict(),
}).strict();
export type FinancialReadTranscript = z.infer<typeof financialHistoryRuntimeSchema>["transcript"];
export type FinancialHistoryRuntime = z.infer<typeof financialHistoryRuntimeSchema>;

export class FinancialHistoryUnavailable extends Error {
  constructor() { super("This Financial run or its historical inputs are unavailable"); this.name = "FinancialHistoryUnavailable"; }
}
export class FinancialHistoryMismatch extends Error {
  constructor(readonly reason: "ENGINE_VERSION" | "STORED_EVIDENCE" | "VERSION_CHECKSUM" | "OUTPUT_HASH") {
    super(`Financial historical integrity mismatch: ${reason}`); this.name = "FinancialHistoryMismatch";
  }
}
export class FinancialPreparationRejected extends Error {
  constructor(readonly status: string, readonly reason: string) {
    super(`Financial input preparation rejected: ${status} / ${reason}`); this.name = "FinancialPreparationRejected";
  }
}
export function captureFinancialReads(port: FinancialDataPort) {
  const transcript: FinancialReadTranscript = [];
  const capture = (entry: FinancialReadTranscript[number]) => {
    if (transcript.length >= 2) throw new RangeError("Financial historical transcript exceeds two exact model operations");
    transcript.push(structuredClone(entry)); ensureFinancialSize(transcript);
  };
  return {
    transcript,
    port: {
      async discover(query) {
        const response = financialDiscoverySchema.parse(await port.discover(query));
        capture({ operation: "DISCOVER", query, response }); return response;
      },
      async read(query) {
        const response = financialReadSchema.parse(await port.read(query));
        capture({ operation: "READ", query, response }); return response;
      },
    } satisfies FinancialDataPort,
  };
}
export async function analyzeFinancialData(port: FinancialDataPort, request: unknown, context: FinancialContext) {
  const prepared = await prepareFinancialData(port, request, context.evaluatedAt);
  if (!prepared.ready || !prepared.validated) {
    if (prepared.status === "NOT_AVAILABLE") throw new FinancialHistoryUnavailable();
    throw new FinancialPreparationRejected(prepared.status, prepared.reason);
  }
  return buildFinancialCalculationResult(prepared.validated.model, prepared.inputs, context);
}
export async function reproduceFinancialTranscript(result: FinancialCalculationResult, rawTranscript: FinancialReadTranscript) {
  const transcript = z.array(transcriptEntrySchema).length(2).parse(rawTranscript);
  let index = 0;
  const take = (operation: "DISCOVER" | "READ", query: unknown) => {
    const entry = transcript[index++];
    if (!entry || entry.operation !== operation || canonicalize(entry.query) !== canonicalize(query)) throw new FinancialHistoryMismatch("STORED_EVIDENCE");
    return entry;
  };
  const port: FinancialDataPort = {
    async discover(query) {
      const entry = take("DISCOVER", query);
      if (entry.operation !== "DISCOVER") throw new FinancialHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
    async read(query) {
      const entry = take("READ", query);
      if (entry.operation !== "READ") throw new FinancialHistoryMismatch("STORED_EVIDENCE");
      return structuredClone(entry.response);
    },
  };
  const reproduced = await analyzeFinancialData(port, result.request.normalized, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (index !== transcript.length || canonicalize(reproduced) !== canonicalize(result)) throw new FinancialHistoryMismatch("OUTPUT_HASH");
  return reproduced;
}
export async function buildFinancialRunRecord(rawResult: FinancialCalculationResult, rawContext: FinancialRecordContext, transcript: FinancialReadTranscript): Promise<RunRecord> {
  const context = financialRecordContextSchema.parse(rawContext);
  const result = validateFinancialCalculationResult(rawResult);
  const runtime = financialHistoryRuntimeSchema.parse({
    contract: "jenan.financial-feasibility.run-history/v1", replayAuthorizationContext: context.access, transcript,
    policies: {
      calculations: "financial-calculation-v1/1.0.0", decimal: "financial-decimal-v1/1.0.0",
      rounding: "currency-minor-units+6-decimal-percentage-quantity/HALF_EVEN", confidence: "financial-confidence-v1/1.0.0",
    },
  });
  ensureFinancialSize(runtime);
  await reproduceFinancialTranscript(result, runtime.transcript);
  const metrics = [...result.metrics, ...result.scenarios.flatMap((scenario) => scenario.metrics),
    ...result.sensitivities.flatMap((driver) => driver.points.flatMap((point) => point.metrics))];
  return runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: result.runId, engineKey: result.engine.key, engineVersion: result.engine.version,
    requestContract: "jenan.financial-feasibility.request/v1", resultContract: result.contract,
    environment: result.engine.environment, status: result.status, ...result.determinism,
    request: result.request, result, errorCode: null, confidence: null,
    gaps: { BLOCKING: metrics.filter((metric) => metric.value === null).length, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: result.timing, cost: result.limits,
    runtime, createdAt: context.createdAt, inputs: result.inputs.map(toRunInputRecord),
  });
}
export async function validateFinancialRunRecord(raw: unknown) {
  const record = runRecordSchema.parse(raw);
  if (record.engineKey !== "financial-feasibility" || record.engineVersion !== FINANCIAL_CALCULATION_VERSION
    || record.requestContract !== "jenan.financial-feasibility.request/v1" || record.resultContract !== "jenan.financial-feasibility.result/v1") {
    throw new FinancialHistoryMismatch("ENGINE_VERSION");
  }
  const runtime = financialHistoryRuntimeSchema.parse(record.runtime);
  const result = validateFinancialCalculationResult(record.result);
  const expected = await buildFinancialRunRecord(result, {
    actor: financialRecordContextSchema.shape.actor.parse(record.actor), createdAt: record.createdAt,
    access: runtime.replayAuthorizationContext, ...(record.subject === null ? {} : { subject: record.subject }),
  }, runtime.transcript);
  if (canonicalize(expected) !== canonicalize(record)) throw new FinancialHistoryMismatch("STORED_EVIDENCE");
  return { record, result, runtime };
}
export function financialInputHistory(result: FinancialCalculationResult, transcript: FinancialReadTranscript, inputId: string) {
  const input = result.inputs.find((entry) => entry.id === inputId);
  const read = transcript.find((entry) => entry.operation === "READ");
  if (!input || read?.operation !== "READ" || read.response.status !== "AVAILABLE"
    || read.response.reference.version.versionId !== input.ref.id || read.query.expectedChecksum !== input.checksum?.value) {
    throw new FinancialHistoryMismatch("STORED_EVIDENCE");
  }
  return {
    reference: read.response.reference, contentHash: sha256Hex(read.response.content),
    provenance: { contract: "jenan.financial-feasibility.input-provenance/v1", reference: read.response.reference,
      assumptions: result.request.normalized.assumptions, schedules: result.request.normalized.schedules },
    usageIntent: { contract: "jenan.financial-feasibility.input-usage/v1", consumer: "financial-feasibility",
      runId: result.runId, versionId: input.ref.id, checksum: input.checksum?.value, roles: input.roles,
      analyses: result.request.normalized.analyses },
  };
}
