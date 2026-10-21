import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import {
  attributionEntrySchema, dataAvailabilitySchema, determinismSchema, engineIdentityShape, engineInputSchema, engineMetricSchema,
  findEnvelopeViolations, limitsShape, rightsSchema, timingSchema,
} from "../shared/contracts";
import { gapSchema, hasGap } from "../shared/gaps";
import { EngineError } from "../shared/errors";
import { identifierSchema, timestampSchema } from "../shared/primitives";
import { quantitySemanticsSchema } from "../shared/quantities";
import { runStatuses } from "../shared/states";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { calculateMarketMetric, marketCalculationTraceSchema } from "./calculations";
import { marketConfidencePolicy } from "./confidence";
import { marketGapCatalog } from "./gaps";
import { MARKET_ENGINE_KEY, MARKET_REQUEST_CONTRACT, MARKET_RESULT_CONTRACT, MARKET_VERSION, isContextSubject, marketAnalyses, marketResultClasses, marketRoles } from "./model";
import { marketNormalizedRequestSchema, normalizeMarketRequest } from "./request";

export const marketMetricSchema = engineMetricSchema.safeExtend({
  status: z.enum(["COMPUTED", "PARTIAL", "ESTIMATED", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
  valueKind: z.enum(["QUANTITY", "CHANGE", "INDEX"]),
  value: z.number().nullable(),
  semantics: quantitySemanticsSchema,
  resultClass: z.enum(marketResultClasses).nullable(),
  signalRole: z.enum(["DEMAND", "CONTEXT"]),
  lineageNature: z.enum(["OBSERVATION", "ESTIMATE", "DERIVED"]).nullable(),
  trace: marketCalculationTraceSchema,
  gaps: z.array(gapSchema).max(20),
}).superRefine((metric, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const target = metric.trace.operands[metric.trace.operands.length - 1]!;
  const expectedRole = isContextSubject(target.subject) ? "CONTEXT" : "DEMAND";
  if (metric.signalRole !== expectedRole) fail("Signal role must follow the measured subject");
  if (metric.value === null) {
    if (metric.resultClass !== null || metric.lineageNature !== null) fail("Unavailable values have no result class or lineage nature");
    if (!metric.gaps.some((gap) => gap.severity === "BLOCKING")) fail("Unavailable values require a blocking gap");
  } else {
    const estimated = metric.trace.operands.some((row) => row.semantics.evidenceNature === "ESTIMATE");
    const nature = estimated ? "ESTIMATE" : metric.trace.operation === "LEVEL" ? target.semantics.evidenceNature : "DERIVED";
    const resultClass = expectedRole === "CONTEXT" ? "CONTEXTUAL" : estimated ? "ESTIMATED" : nature === "OBSERVATION" ? "OBSERVED" : "DERIVED";
    if (metric.resultClass !== resultClass || metric.lineageNature !== nature || metric.semantics.evidenceNature !== nature) fail("Evidence classification must follow every required operand");
    if (estimated && (metric.status !== "ESTIMATED" || metric.confidence?.band === "HIGH")) fail("Estimates require estimated state and at most MEDIUM confidence");
  }
});
const resultObject = z.object({
  contract: z.literal(MARKET_RESULT_CONTRACT), runId: identifierSchema, evaluatedAt: timestampSchema,
  engine: z.object({
    ...engineIdentityShape, key: z.literal(MARKET_ENGINE_KEY), version: z.literal(MARKET_VERSION),
    contracts: z.object({ request: z.literal(MARKET_REQUEST_CONTRACT), result: z.literal(MARKET_RESULT_CONTRACT) }).strict(),
  }).strict(),
  status: z.enum(runStatuses),
  request: z.object({ normalized: marketNormalizedRequestSchema, evaluatedAt: timestampSchema }).strict(),
  inputs: z.array(engineInputSchema).max(32),
  dataAvailability: z.array(dataAvailabilitySchema).max(4),
  results: z.array(z.object({
    analysis: z.enum(marketAnalyses), seriesId: identifierSchema,
    metrics: z.array(marketMetricSchema).max(500),
  }).strict()).max(100),
  gaps: z.array(gapSchema).max(500),
  attribution: z.array(attributionEntrySchema).max(32), rights: rightsSchema, determinism: determinismSchema,
  limits: z.object(limitsShape).strict(), timing: timingSchema,
}).strict();
export type MarketResult = z.infer<typeof resultObject>;

export function findMarketResultProblems(result: MarketResult): string[] {
  if (Buffer.byteLength(canonicalize(result), "utf8") > MAX_RUN_JSON_BYTES) return ["Market result exceeds the shared 2 MiB run JSON limit"];
  const problems = findEnvelopeViolations(result, { catalog: marketGapCatalog }).map((violation) => `${violation.code} at ${violation.path}: ${violation.detail}`);
  const normalized = result.request.normalized;
  try {
    const canonical = normalizeMarketRequest(normalized, { evaluatedAt: result.evaluatedAt }).normalized;
    if (canonicalize(canonical) !== canonicalize(normalized)) problems.push("Request is not normalized");
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    problems.push("Request has invalid evaluation or selection instants");
  }
  if (result.request.evaluatedAt !== result.evaluatedAt) problems.push("Evaluation instants must agree");
  if (canonicalize(result.engine.policies) !== canonicalize([marketConfidencePolicy])) problems.push("Market requires its exact confidence policy");
  if (result.inputs.some((input) => input.kind !== "DATA_CENTER_VERSION" || input.roles.some((role) => !(marketRoles as readonly string[]).includes(role)))) problems.push("Market v1 accepts governed Data Center inputs with explicit Market roles only");
  if (result.results.reduce((count, entry) => count + entry.metrics.length, 0) > 500) problems.push("At most 500 metrics per run");
  const keys = result.results.map((entry) => `${marketAnalyses.indexOf(entry.analysis)}/${entry.seriesId}`);
  if (new Set(keys).size !== keys.length || canonicalize(keys) !== canonicalize([...keys].sort(compareText))) problems.push("Results must be unique and ordered by analysis and series");
  const availabilityRoles = result.dataAvailability.map((entry) => entry.role);
  if (new Set(availabilityRoles).size !== availabilityRoles.length || availabilityRoles.some((role) => !(marketRoles as readonly string[]).includes(role))) problems.push("Availability roles must be unique Market roles");
  for (const analysis of normalized.analyses) for (const series of normalized.series) {
    if (!result.results.some((entry) => entry.analysis === analysis && entry.seriesId === series.id)
      && !result.gaps.some((gap) => gap.severity === "BLOCKING" && gap.subject === `${analysis}/${series.id}`)) problems.push("A requested analysis/series is missing without a scoped blocking gap");
  }
  for (const entry of result.results) {
    const series = normalized.series.find((candidate) => candidate.id === entry.seriesId);
    if (!normalized.analyses.includes(entry.analysis) || !series) { problems.push("Unrequested analysis or series"); continue; }
    if (entry.metrics.length === 0 && !result.gaps.some((gap) => gap.severity === "BLOCKING")) problems.push("Empty result needs a blocking gap");
    const semanticKeys = entry.metrics.map((metric) => canonicalize([metric.trace.operation, ...metric.trace.operands.map((row) => row.semantics.time.id)]));
    if (new Set(semanticKeys).size !== semanticKeys.length) problems.push("Duplicate metric for the same operation and periods");
    if (entry.analysis !== "DEMAND_TREND" && entry.analysis !== "ASSUMPTION_BASED_DEMAND") {
      for (const period of series.periods) {
        if (!entry.metrics.some((metric) => metric.trace.operation === "LEVEL" && metric.trace.operands[0].semantics.time.id === period.id)
          && !result.gaps.some((gap) => gap.severity === "BLOCKING" && gap.subject === `${entry.analysis}/${series.id}/${period.id}`)) problems.push("Selected period is missing without a scoped blocking gap");
      }
    }
    if (entry.analysis === "DEMAND_TREND") for (const pair of normalized.parameters.comparisons.filter((pair) => pair.seriesId === series.id)) for (const operation of pair.measures) {
      if (!entry.metrics.some((metric) => metric.trace.operation === operation && metric.trace.operands[0].semantics.time.id === pair.fromPeriodId && metric.trace.operands[1]?.semantics.time.id === pair.toPeriodId)
        && !result.gaps.some((gap) => gap.severity === "BLOCKING" && gap.subject === `${series.id}/${pair.fromPeriodId}/${pair.toPeriodId}/${operation}`)) problems.push("Requested comparison is missing without a scoped blocking gap");
    }
    for (const metric of entry.metrics) {
      const target = metric.trace.operands[metric.trace.operands.length - 1]!;
      const context = isContextSubject(target.subject);
      if (["MARKET_CONTEXT", "AUDIENCE_CONTEXT"].includes(entry.analysis) !== context) problems.push("Contextual indicators cannot become demand results");
      if (entry.analysis === "AUDIENCE_CONTEXT" && !["population_count", "household_count"].includes(target.subject)) problems.push("Audience context requires population or households");
      if (entry.analysis === "OBSERVED_DEMAND" && metric.value !== null && metric.resultClass !== "OBSERVED") problems.push("Observed demand requires actual observed evidence");
      if (entry.analysis === "ASSUMPTION_BASED_DEMAND" && metric.value !== null && metric.resultClass !== "ESTIMATED") problems.push("Assumption analysis requires estimated evidence");
      if (entry.analysis === "ASSUMPTION_BASED_DEMAND" && metric.value !== null) {
        const refs = metric.trace.operands.flatMap((row) => [...row.sourceRefs, ...row.assumptions.flatMap((assumption) => assumption.sourceRefs)]).map((ref) => canonicalize(ref));
        if (!normalized.parameters.estimates.some((estimate) => estimate.seriesId === series.id && estimate.periodId === target.semantics.time.id
          && [estimate.cohortObservationRef, estimate.adoptionObservationRef, estimate.frequencyObservationRef].every((ref) => refs.includes(canonicalize(ref))))) problems.push("Estimate evidence does not match the explicit requested assumption inputs");
      }
      if ((entry.analysis === "DEMAND_TREND") !== (metric.trace.operation !== "LEVEL")) problems.push("Only trend results carry comparisons in M1");
      const dimension = target.semantics.dimensions;
      if (canonicalize({ geography: dimension.geography, sector: dimension.sector, cohort: dimension.cohort }) !== canonicalize(normalized.scope)
        || canonicalize(dimension.metricDefinition) !== canonicalize(series.metricDefinition)
        || canonicalize(target.semantics.unit) !== canonicalize(series.unit)) problems.push("Metric dimensions/unit must match the requested scope and series");
      for (const row of metric.trace.operands) {
        if (!series.periods.some((period) => canonicalize(period) === canonicalize(row.semantics.time))) problems.push("Observation is not in a selected exact period");
        const input = result.inputs.find((candidate) => candidate.id === row.ref.inputId);
        const expectedRole = isContextSubject(row.subject) ? "context.indicators" : "demand.observations";
        if (!input?.roles.includes(expectedRole)) problems.push("Observation input lacks its semantic role");
      }
      if (metric.trace.operation !== "LEVEL") {
        const operation = metric.trace.operation;
        const from = metric.trace.operands[0].semantics.time.id;
        const to = target.semantics.time.id;
        if (!normalized.parameters.comparisons.some((pair) => pair.seriesId === series.id && pair.fromPeriodId === from && pair.toPeriodId === to && pair.measures.includes(operation))) problems.push("Metric comparison was not requested");
      }
      const requiredInputIds = [...metric.inputRefs, ...metric.trace.operands.flatMap((row) => [row.ref.inputId, ...row.sourceRefs.map((ref) => ref.inputId), ...row.assumptions.flatMap((assumption) => assumption.sourceRefs.map((ref) => ref.inputId))])];
      if (new Set(result.inputs.map((input) => input.id)).size !== result.inputs.length) problems.push("Duplicate Market calculation inputs");
      else if (requiredInputIds.some((id) => !result.inputs.some((input) => input.id === id))) problems.push("Unresolved Market calculation input");
      else {
        const expected = calculateMarketMetric({ key: metric.key, label: metric.label }, metric.trace, result.inputs, result.evaluatedAt);
        if (canonicalize(expected) !== canonicalize(metric)) problems.push("Market metric disagrees with its deterministic evidence, calculation or confidence");
      }
      for (const gap of metric.gaps) if (!hasGap(result.gaps, gap.code, gap.inputId) || !result.gaps.some((candidate) => canonicalize(candidate) === canonicalize(gap))) problems.push("Metric gap is missing from the result envelope");
    }
  }
  for (const input of result.inputs) {
    for (const role of input.roles) {
      const selector = normalized.data.roles[role as typeof marketRoles[number]];
      if (!selector || Array.isArray(selector) && !selector.some((pin) => pin.versionId === input.ref.id && (!pin.expectedChecksum || pin.expectedChecksum === input.checksum?.value))) problems.push("Input does not match its requested source selection");
    }
  }
  return problems;
}
export const marketResultSchema = resultObject.superRefine((result, context) => {
  for (const message of findMarketResultProblems(result)) context.addIssue({ code: "custom", message });
});
