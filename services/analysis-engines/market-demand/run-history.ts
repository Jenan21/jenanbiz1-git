import { z } from "zod";
import { canonicalHash, canonicalize } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import { identifierSchema, timestampSchema } from "../shared/primitives";
import { buildRunRecord, ENGINE_RUN_RECORD_CONTRACT, MAX_RUN_JSON_BYTES, runRecordSchema, type RunRecord } from "../shared/run-record";
import { MARKET_ENGINE_KEY, MARKET_REQUEST_CONTRACT, MARKET_RESULT_CONTRACT } from "./model";
import { MARKET_CALCULATION_VERSION, marketM3ResultSchema, type MarketM3Result } from "./result";

export const marketHistoryContextSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: identifierSchema.optional(),
}).strict();
export type MarketHistoryContext = z.infer<typeof marketHistoryContextSchema>;
export const marketRecordContextSchema = z.object({
  actor: z.object({ kind: z.enum(["USER", "ROBOT"]), id: identifierSchema }).strict(),
  subject: z.string().min(1).max(128).optional(), createdAt: timestampSchema,
  access: marketHistoryContextSchema,
}).strict();
export type MarketRecordContext = z.infer<typeof marketRecordContextSchema>;
export function buildMarketRunRecord(result: MarketM3Result, rawContext: MarketRecordContext): RunRecord {
  const context = marketRecordContextSchema.parse(rawContext);
  const validated = marketM3ResultSchema.parse(result);
  return runRecordSchema.parse(buildRunRecord(validated, {
    actor: context.actor, subject: context.subject, createdAt: context.createdAt,
    runtime: { contract: "jenan.market-demand.run-history/v1", replayAuthorizationContext: context.access },
  }));
}
export function validateMarketRunRecord(candidate: unknown): { record: RunRecord; result: MarketM3Result | null; access: MarketHistoryContext } {
  const record = runRecordSchema.parse(candidate);
  if (record.engineKey !== MARKET_ENGINE_KEY || record.engineVersion !== MARKET_CALCULATION_VERSION
    || record.requestContract !== MARKET_REQUEST_CONTRACT || record.resultContract !== MARKET_RESULT_CONTRACT) {
    throw new EngineError("CONTRACT_VIOLATION", { first: "Unsupported Market run contract or engine version; historical arithmetic was not upgraded" });
  }
  const runtime = z.object({
    contract: z.literal("jenan.market-demand.run-history/v1"), replayAuthorizationContext: marketHistoryContextSchema,
    errorDetails: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).strict().parse(record.runtime);
  const actor = marketRecordContextSchema.shape.actor.parse(record.actor);
  if (record.result === null) {
    z.union([
      z.object({ submitted: z.unknown() }).strict().refine((value) => Object.hasOwn(value, "submitted")),
      z.object({ omitted: z.literal(true), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().min(0) }).strict(),
    ]).parse(record.request);
    if (record.status !== "FAILED" || record.inputs.length || record.confidence !== null
      || runtime.errorDetails === undefined || record.cost.costUnits !== 0 || record.cost.budgetUnits !== 20_000
      || Object.values(record.gaps).some((count) => count !== 0)
      || record.requestHash !== canonicalHash(record.request)) throw new EngineError("CONTRACT_VIOLATION", { first: "Invalid Market failure history" });
    return { record, result: null, access: runtime.replayAuthorizationContext };
  }
  const result = marketM3ResultSchema.parse(record.result);
  const expected = buildMarketRunRecord(result, {
    actor, createdAt: record.createdAt, access: runtime.replayAuthorizationContext,
    ...(record.subject === null ? {} : { subject: record.subject }),
  });
  if (canonicalize(expected) !== canonicalize(record)) throw new EngineError("CONTRACT_VIOLATION", { first: "Market history columns, input snapshots and complete result disagree" });
  return { record, result, access: runtime.replayAuthorizationContext };
}
export function buildMarketFailureRecord(
  request: unknown, error: EngineError,
  execution: { runId: string; environment: MarketM3Result["engine"]["environment"]; timing: MarketM3Result["timing"] },
  rawContext: MarketRecordContext,
): RunRecord {
  const context = marketRecordContextSchema.parse(rawContext);
  const serialized = canonicalize(request);
  const submitted = { submitted: JSON.parse(serialized) as unknown };
  const captured = Buffer.byteLength(canonicalize(submitted), "utf8") <= MAX_RUN_JSON_BYTES
    ? submitted : { omitted: true, sha256: canonicalHash(request), byteLength: Buffer.byteLength(serialized, "utf8") };
  return runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: execution.runId, engineKey: MARKET_ENGINE_KEY,
    engineVersion: MARKET_CALCULATION_VERSION, requestContract: MARKET_REQUEST_CONTRACT, resultContract: MARKET_RESULT_CONTRACT,
    environment: execution.environment, status: "FAILED", requestHash: canonicalHash(captured), inputsHash: null, outputHash: null,
    request: captured, result: null, errorCode: error.code, confidence: null, gaps: { BLOCKING: 0, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: execution.timing, cost: { costUnits: 0, budgetUnits: 20_000 },
    runtime: { contract: "jenan.market-demand.run-history/v1", replayAuthorizationContext: context.access, errorDetails: error.details },
    createdAt: context.createdAt, inputs: [],
  });
}

export function marketUsageIntent(result: MarketM3Result, inputId: string) {
  const input = result.inputs.find((entry) => entry.id === inputId);
  if (!input?.checksum) throw new EngineError("CONTRACT_VIOLATION", { first: "Market usage requires an exact governed input" });
  const analyses = result.results.filter((entry) => entry.metrics.some((metric) => metric.inputRefs.includes(inputId))).map((entry) => entry.analysis);
  return {
    contract: "jenan.market-demand.input-usage/v1", consumer: MARKET_ENGINE_KEY, runId: result.runId,
    versionId: input.ref.id, checksum: input.checksum.value, roles: input.roles,
    analyses: [...new Set(analyses)].sort(), purpose: analyses.length ? "CALCULATION_EVIDENCE" : "SOURCE_VALIDATION",
  };
}
