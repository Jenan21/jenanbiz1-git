import { z } from "zod";
import { canonicalize, omitKeys } from "../shared/canonical";
import { computeDeterminism, deriveRunStatus, engineInputSchema, engineMetricSchema, findEnvelopeViolations } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { gapSchema } from "../shared/gaps";
import { identifierSchema } from "../shared/primitives";
import { assumptionSchema, observationRefSchema } from "../shared/quantities";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { marketAdvancedTraceSchema } from "./advanced-calculations";
import { marketConfidencePolicy } from "./confidence";
import { marketM1ResultSchema, marketMetricSchema, marketResultObject } from "./contracts";
import { marketDiscoverySchema, marketSourceReferenceSchema, type MarketDataPort } from "./data-port";
import { buildMarketSourceEvidence, finalizeMarketSources, prepareMarketData, requiredMarketRoles } from "./data-sources";
import { marketAssumptionRowSchema, marketDatasetSchema, typeKeyByMarketRole } from "./datasets";
import { evaluatePreparedMarket } from "./engine";
import { marketGapCatalog } from "./gaps";
import { marketAnalyses, marketObservationSchema, marketRoles } from "./model";
import { normalizeMarketRequest } from "./request";

export const MARKET_CALCULATION_VERSION = "1.0.0-m3";
const sourceSchema = z.object({
  role: z.enum(marketRoles), status: z.enum(["AVAILABLE", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
  requestedVersionId: identifierSchema.nullable(), selection: marketDiscoverySchema.nullable(),
  reference: marketSourceReferenceSchema.nullable(), input: engineInputSchema.nullable(), dataset: marketDatasetSchema.nullable(),
  observations: z.array(marketObservationSchema).max(2000),
  assumptionInputs: z.array(z.object({
    ...marketAssumptionRowSchema.shape, ref: observationRefSchema,
    sourceRefs: z.array(observationRefSchema).min(1).max(32), assumptions: z.array(assumptionSchema).max(20),
  }).strict()).max(2000),
  matches: z.array(z.object({
    seriesId: identifierSchema, periodId: identifierSchema,
    status: z.enum(["AVAILABLE", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
    observationRefs: z.array(observationRefSchema).max(2000),
  }).strict()).max(0), gaps: z.array(gapSchema).max(100),
}).strict();
export const marketM3MetricSchema = engineMetricSchema.safeExtend({
  ...marketMetricSchema.shape, trace: marketAdvancedTraceSchema,
});
const workSchema = z.object({
  discoveries: z.number().int().min(0).max(32), reads: z.number().int().min(0).max(32), parsedRows: z.number().int().min(0).max(10_000),
}).strict();
const resultObject = z.object({
  ...marketResultObject.shape,
  engine: z.object({ ...marketResultObject.shape.engine.shape, version: z.literal(MARKET_CALCULATION_VERSION) }).strict(),
  results: z.array(z.object({ analysis: z.enum(marketAnalyses), seriesId: identifierSchema, metrics: z.array(marketM3MetricSchema).max(500) }).strict()).max(100),
  outcomes: z.array(z.object({
    key: identifierSchema, analysis: z.enum(marketAnalyses), seriesId: identifierSchema,
    periodIds: z.array(identifierSchema).min(1).max(2), operation: z.enum(["LEVEL", "ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX", "EXPLICIT_ESTIMATE"]),
    metricKey: identifierSchema.nullable(), status: marketM3MetricSchema.shape.status,
    value: z.number().nullable(), resultClass: marketM3MetricSchema.shape.resultClass,
  }).strict()).max(500),
  sourceEvidence: z.array(sourceSchema).max(32), work: workSchema,
  gaps: z.array(gapSchema).max(5000),
}).strict();
export type MarketM3Result = z.infer<typeof resultObject>;
export const marketRunContextSchema = z.object({
  runId: identifierSchema, evaluatedAt: marketResultObject.shape.evaluatedAt,
  environment: marketResultObject.shape.engine.shape.environment, timing: marketResultObject.shape.timing,
}).strict();
export type MarketRunContext = z.infer<typeof marketRunContextSchema>;

function availability(prepared: Awaited<ReturnType<typeof prepareMarketData>>) {
  return marketRoles.flatMap((role) => {
    const sources = prepared.sources.filter((source) => source.role === role);
    if (!sources.length) return [];
    const inputIds = [...new Set(sources.flatMap((source) => source.input ? [source.input.id] : []))].sort();
    // Shared availability describes dataset presence; outcomes retain metric-level NOT_COMPUTABLE / NOT_AVAILABLE.
    const status = !inputIds.length ? "NOT_AVAILABLE" as const : sources.every((source) => source.status === "NO_COVERAGE") ? "NO_COVERAGE" as const
      : sources.filter((source) => source.input).every((source) => source.input!.freshness.status === "EXPIRED") ? "EXPIRED" as const : "AVAILABLE" as const;
    return [{ role, status, inputIds }];
  });
}
function cost(prepared: Awaited<ReturnType<typeof prepareMarketData>>, metricCount: number) {
  return { costUnits: prepared.work.discoveries + prepared.work.reads + prepared.work.parsedRows + metricCount, budgetUnits: 20_000 };
}
export const marketM3ResultSchema = resultObject.superRefine((result, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (Buffer.byteLength(canonicalize(result), "utf8") > MAX_RUN_JSON_BYTES) { fail("Market result exceeds the shared 2 MiB envelope limit"); return; }
  const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
  if (!same(result.engine.policies, [marketConfidencePolicy])) fail("M3 requires exact market-confidence-v1@1.0.0");
  if (result.request.evaluatedAt !== result.evaluatedAt) fail("Evaluation instants must agree");
  try {
    const normalized = normalizeMarketRequest(result.request.normalized, { evaluatedAt: result.evaluatedAt }).normalized;
    if (!same(normalized, result.request.normalized)) fail("M3 request must be normalized");
    const roles = requiredMarketRoles(normalized);
    if (result.sourceEvidence.some((source) => !roles.includes(source.role))) fail("Unrequested Market source role");
    for (const role of roles) {
      const selected = normalized.data.roles[role];
      const sources = result.sourceEvidence.filter((source) => source.role === role);
      if (Array.isArray(selected) ? !same(sources.map((source) => source.requestedVersionId).sort(), selected.map((pin) => pin.versionId).sort()) : sources.length !== 1) fail("Every exact pin or implicit type selection must retain exactly one explicit outcome; no fallback or omitted selection");
    }
    for (const source of result.sourceEvidence) {
      const selector = normalized.data.roles[source.role];
      if (source.input && source.dataset && source.reference) {
        if (source.role !== source.dataset.role || source.reference.dataset.typeKey !== typeKeyByMarketRole[source.role]
          || source.requestedVersionId !== source.reference.version.versionId
          || !source.selection || !same(source, buildMarketSourceEvidence(source.role, source.reference, source.dataset, source.selection, normalized, result.evaluatedAt))) fail("Source evidence must reproduce its exact governed validation, dataset, source metadata and bound rows");
        if (selector && Array.isArray(selector) && !selector.some((pin) => pin.versionId === source.reference!.version.versionId
          && (!pin.expectedChecksum || pin.expectedChecksum === source.reference!.version.checksum.value))) fail("Source does not match its exact pin");
        if (!source.selection || source.selection.mode === "BY_TYPE" && source.selection.selected?.reference.version.versionId !== source.reference.version.versionId) fail("Source lacks its exact governed discovery decision");
        if (source.selection && (source.selection.mode !== (Array.isArray(selector) ? "EXACT" : "BY_TYPE")
          || !source.selection.candidates.some((candidate) => same(omitKeys(candidate.reference, ["resolvedAt"]), omitKeys(source.reference!, ["resolvedAt"])))
          || !source.reference.rights.allowRetrieval)) fail("Source discovery, retrieval rights or selection mode is inconsistent");
        if (source.selection && !Array.isArray(selector) && (source.selection.policy !== "dc-version-selection-v1"
          || source.selection.asOf !== new Date(selector?.asOf ?? result.evaluatedAt).toISOString()
          || source.selection.status !== "FOUND")) fail("Source selection policy/asOf must match the actual normalized request");
      } else if (source.status === "AVAILABLE" || source.observations.length || source.assumptionInputs.length) fail("Available evidence requires complete source, version, dataset and metadata");
    }
    const prepared = finalizeMarketSources(result.sourceEvidence, normalized, result.evaluatedAt, result.work);
    const calculated = evaluatePreparedMarket(normalized, prepared);
    if (!same(result.results, calculated.results) || !same(result.outcomes, calculated.outcomes) || !same(result.gaps, calculated.gaps)) fail("M3 outcomes, arithmetic, weakest-input confidence, gaps and lineage must exactly reproduce from their governed evidence");
    if (!same(result.inputs, prepared.inputs) || !same(result.dataAvailability, availability(prepared))
      || !same(result.attribution, prepared.attribution) || !same(result.rights, prepared.rights)
      || !same(result.limits, cost(prepared, calculated.outcomes.length))) fail("M3 source metadata, availability, rights, attribution and work budget must be derived without widening or omission");
    for (const violation of findEnvelopeViolations(result, { catalog: marketGapCatalog })) fail(`${violation.code}: ${violation.detail}`);
  } catch (error) {
    if (!(error instanceof EngineError) && !(error instanceof z.ZodError)) throw error;
    fail(`Invalid M3 evidence or calculation: ${error instanceof EngineError ? error.code : "schema violation"}`);
  }
});
export const marketAnalysisResultSchema = z.union([marketM1ResultSchema, marketM3ResultSchema]);
export type MarketAnalysisResult = z.infer<typeof marketAnalysisResultSchema>;

export async function runMarketAnalysis(request: unknown, port: MarketDataPort, rawContext: MarketRunContext): Promise<MarketM3Result> {
  const context = marketRunContextSchema.parse(rawContext);
  const normalized = normalizeMarketRequest(request, { evaluatedAt: context.evaluatedAt });
  const prepared = await prepareMarketData(port, normalized.normalized, normalized.evaluatedAt);
  const calculated = evaluatePreparedMarket(normalized.normalized, prepared);
  const result: MarketM3Result = {
    contract: "jenan.market-demand.result/v1", runId: context.runId, evaluatedAt: normalized.evaluatedAt,
    engine: { key: "market-demand", version: MARKET_CALCULATION_VERSION, contracts: { request: "jenan.market-demand.request/v1", result: "jenan.market-demand.result/v1" },
      environment: context.environment, policies: [marketConfidencePolicy] },
    request: { normalized: normalized.normalized, evaluatedAt: normalized.evaluatedAt },
    inputs: prepared.inputs, dataAvailability: availability(prepared), ...calculated,
    sourceEvidence: prepared.sourceEvidence, work: prepared.work,
    rights: prepared.rights, attribution: prepared.attribution,
    status: deriveRunStatus(calculated.results.flatMap((entry) => entry.metrics), calculated.gaps),
    determinism: { requestHash: "0".repeat(64), inputsHash: "0".repeat(64), outputHash: "0".repeat(64) },
    limits: cost(prepared, calculated.outcomes.length), timing: context.timing,
  };
  result.determinism = computeDeterminism(result);
  if (Buffer.byteLength(canonicalize(result), "utf8") > MAX_RUN_JSON_BYTES) throw new EngineError("REQUEST_TOO_LARGE", { first: "Market source evidence and outputs exceed the shared 2 MiB envelope limit; no evidence was truncated" });
  const parsed = marketM3ResultSchema.safeParse(result);
  if (!parsed.success) throw new EngineError("CONTRACT_VIOLATION", { first: parsed.error.issues[0]?.message });
  return parsed.data;
}
