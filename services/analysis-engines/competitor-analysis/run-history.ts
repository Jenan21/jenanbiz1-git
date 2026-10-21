import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import { identifierSchema } from "../shared/primitives";
import { buildRunRecord, ENGINE_RUN_RECORD_CONTRACT, MAX_RUN_JSON_BYTES, runRecordSchema, type RunRecord } from "../shared/run-record";
import { COMPETITOR_ANALYTICS_VERSION } from "./analytics";
import { assertCompetitorAnalyticsResult, competitorAnalyticsResultSchema, type CompetitorAnalyticsResult, type CompetitorExecution } from "./engine";
import { COMPETITOR_REQUEST_CONTRACT, COMPETITOR_RESULT_CONTRACT, competitorTimestampSchema } from "./model";

export const competitorHistoryContextSchema = z.object({
  specialty: z.string().trim().min(1).max(80).optional(),
  missionContext: z.string().trim().min(1).max(80).optional(),
  organizationId: identifierSchema.optional(),
}).strict();
export type CompetitorHistoryContext = z.infer<typeof competitorHistoryContextSchema>;
export const competitorRecordContextSchema = z.object({
  actor: z.object({ kind: z.enum(["USER", "ROBOT"]), id: identifierSchema }).strict(),
  subject: z.string().min(1).max(128).optional(), createdAt: competitorTimestampSchema,
  access: competitorHistoryContextSchema,
}).strict();
export type CompetitorRecordContext = z.infer<typeof competitorRecordContextSchema>;
const historyContract = "jenan.competitor-analysis.run-history/v1";

export function buildCompetitorRunRecord(result: CompetitorAnalyticsResult, rawContext: CompetitorRecordContext): RunRecord {
  const context = competitorRecordContextSchema.parse(rawContext);
  assertCompetitorAnalyticsResult(result);
  return runRecordSchema.parse(buildRunRecord(result, {
    actor: context.actor, subject: context.subject, createdAt: context.createdAt,
    runtime: { contract: historyContract, replayAuthorizationContext: context.access },
  }));
}
export function validateCompetitorRunRecord(candidate: unknown) {
  const record = runRecordSchema.parse(candidate);
  const fail = (first: string): never => { throw new EngineError("CONTRACT_VIOLATION", { first }); };
  if (record.engineKey !== "competitor-analysis" || record.engineVersion !== COMPETITOR_ANALYTICS_VERSION
    || record.requestContract !== COMPETITOR_REQUEST_CONTRACT || record.resultContract !== COMPETITOR_RESULT_CONTRACT) {
    fail("Unsupported Competitor historical contract/version; historical arithmetic is never silently upgraded");
  }
  const runtime = z.object({
    contract: z.literal(historyContract), replayAuthorizationContext: competitorHistoryContextSchema,
    errorDetails: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }).strict().parse(record.runtime);
  const actor = competitorRecordContextSchema.shape.actor.parse(record.actor);
  if (record.result === null) {
    z.union([
      z.object({ submitted: z.unknown() }).strict().refine((value) => Object.hasOwn(value, "submitted")),
      z.object({ omitted: z.literal(true), sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().nonnegative() }).strict(),
    ]).parse(record.request);
    if (record.status !== "FAILED" || runtime.errorDetails === undefined || record.cost.costUnits !== 0 || record.cost.budgetUnits !== 20_000
      || Object.values(record.gaps).some((count) => count !== 0) || record.requestHash !== canonicalHash(record.request)) fail("Invalid Competitor failure history");
    return { record, result: null, access: runtime.replayAuthorizationContext };
  }
  const result = competitorAnalyticsResultSchema.parse(record.result);
  const expected = buildCompetitorRunRecord(result, {
    actor, createdAt: record.createdAt, access: runtime.replayAuthorizationContext,
    ...(record.subject === null ? {} : { subject: record.subject }),
  });
  if (canonicalize(expected) !== canonicalize(record)) fail("Competitor history columns, snapshots and full result disagree");
  return { record, result, access: runtime.replayAuthorizationContext };
}
export function buildCompetitorFailureRecord(request: unknown, error: EngineError, execution: CompetitorExecution, rawContext: CompetitorRecordContext): RunRecord {
  const context = competitorRecordContextSchema.parse(rawContext);
  const serialized = canonicalize(request);
  const submitted = { submitted: JSON.parse(serialized) as unknown };
  const captured = Buffer.byteLength(canonicalize(submitted), "utf8") <= MAX_RUN_JSON_BYTES
    ? submitted : { omitted: true, sha256: canonicalHash(request), byteLength: Buffer.byteLength(serialized, "utf8") };
  return runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: execution.runId, engineKey: "competitor-analysis",
    engineVersion: COMPETITOR_ANALYTICS_VERSION, requestContract: COMPETITOR_REQUEST_CONTRACT, resultContract: COMPETITOR_RESULT_CONTRACT,
    environment: execution.environment, status: "FAILED", requestHash: canonicalHash(captured), inputsHash: null, outputHash: null,
    request: captured, result: null, errorCode: error.code, confidence: null, gaps: { BLOCKING: 0, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: execution.timing, cost: { costUnits: 0, budgetUnits: 20_000 },
    runtime: { contract: historyContract, replayAuthorizationContext: context.access, errorDetails: error.details },
    createdAt: context.createdAt, inputs: [],
  });
}
export function competitorHistorySources(result: CompetitorAnalyticsResult) {
  return [result.preparation.current, ...result.preparation.baseline ? [result.preparation.baseline] : []].flatMap((prepared) =>
    prepared.sources.map((source) => ({ snapshot: prepared === result.preparation.current ? "CURRENT" as const : "BASELINE" as const, source })));
}
export function competitorInputProvenance(result: CompetitorAnalyticsResult, inputId: string) {
  return { contract: "jenan.competitor-analysis.input-provenance/v1",
    sources: competitorHistorySources(result).filter(({ source }) => source.input?.id === inputId)
      .map(({ snapshot, source }) => ({ snapshot, role: source.role, reference: source.reference, selection: source.selection })) };
}
export function competitorUsageIntent(result: CompetitorAnalyticsResult, inputId: string) {
  const input = result.inputs.find((entry) => entry.id === inputId);
  if (!input?.checksum) throw new EngineError("CONTRACT_VIOLATION", { first: "Competitor history requires an exact governed input" });
  const analyses = [...new Set(result.results.filter((entry) => entry.metrics.some((metric) => metric.inputRefs.includes(inputId))).map((entry) => entry.key))].sort(compareText);
  return { contract: "jenan.competitor-analysis.input-usage/v1", consumer: "competitor-analysis", runId: result.runId,
    versionId: input.ref.id, checksum: input.checksum.value, roles: input.roles, analyses,
    purpose: analyses.length ? "CALCULATION_EVIDENCE" : "SOURCE_VALIDATION" };
}
