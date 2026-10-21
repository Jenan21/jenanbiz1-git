import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import { normalizeGaps, type Gap } from "../shared/gaps";
import type { TemporalReference } from "../shared/quantities";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { advancedObservations, calculateAdvancedMarketMetric, type MarketAdvancedMetric, type MarketAdvancedTrace, type marketSupportingEvidenceSchema } from "./advanced-calculations";
import { marketCoverageStatus, type prepareMarketData, type PreparedMarketSource, type MarketSourceStatus } from "./data-sources";
import type { MarketDatasetRole } from "./datasets";
import { marketGap } from "./gaps";
import { isContextSubject, type MarketObservation } from "./model";
import type { MarketNormalizedRequest } from "./request";
import type { z } from "zod";

type Prepared = Awaited<ReturnType<typeof prepareMarketData>>;
type Analysis = MarketNormalizedRequest["analyses"][number];
type SupportingEvidence = z.infer<typeof marketSupportingEvidenceSchema>;
export interface MarketOutcome {
  key: string; analysis: Analysis; seriesId: string; periodIds: string[]; operation: "LEVEL" | "ABSOLUTE_CHANGE" | "PERCENT_CHANGE" | "INDEX" | "EXPLICIT_ESTIMATE";
  metricKey: string | null; status: MarketAdvancedMetric["status"]; value: number | null;
  resultClass: MarketAdvancedMetric["resultClass"];
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const blockingCode = (status: MarketSourceStatus) => status === "NO_COVERAGE" ? "MARKET_NO_COVERAGE" as const : status === "NOT_AVAILABLE" ? "MARKET_NOT_AVAILABLE" as const : "MARKET_NOT_COMPARABLE" as const;
function worstStatus(statuses: MarketSourceStatus[]): MarketSourceStatus {
  return statuses.includes("NOT_COMPUTABLE") ? "NOT_COMPUTABLE" : statuses.includes("NO_COVERAGE") ? "NO_COVERAGE" : "NOT_AVAILABLE";
}
function supportingEvidence(trace: MarketAdvancedTrace, sources: PreparedMarketSource[]): SupportingEvidence[] {
  const byRef = new Map<string, SupportingEvidence>();
  for (const source of sources) {
    for (const row of source.observations) byRef.set(canonicalize(row.ref), { kind: "OBSERVATION", row });
    if (source.dataset?.role === "demand.assumptions" && source.input) for (const row of source.dataset.rows) {
      byRef.set(canonicalize({ inputId: source.input.id, observationId: row.id }), { kind: "ASSUMPTION", inputId: source.input.id, row });
    }
  }
  const refs = advancedObservations(trace).map((row) => row.ref).concat(trace.operation === "EXPLICIT_ESTIMATE" ? [
    { inputId: trace.adoption.inputId, observationId: trace.adoption.row.id }, { inputId: trace.frequency.inputId, observationId: trace.frequency.row.id },
  ] : []);
  const roots = new Set(refs.map((ref) => canonicalize(ref)));
  const visited = new Set<string>();
  const result: SupportingEvidence[] = [];
  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]!; const key = canonicalize(ref);
    if (visited.has(key)) continue;
    visited.add(key);
    const entry = byRef.get(key);
    if (!entry) throw new EngineError("INVALID_INPUT", { first: "Validated Market lineage lost an exact observation" });
    if (!roots.has(key)) result.push(entry);
    if (entry.kind === "DEFINITION") throw new EngineError("INVALID_INPUT", { first: "A metric definition is not an observation lineage reference" });
    const declared = entry.kind === "OBSERVATION"
      ? [...entry.row.sourceRefs, ...entry.row.assumptions.flatMap((assumption) => assumption.sourceRefs)]
      : [...entry.row.sourceRefs, ...entry.row.assumptions.flatMap((assumption) => assumption.sourceRefs)];
    for (const sourceRef of declared) {
      const bound = "inputId" in sourceRef ? sourceRef : { inputId: sourceRef.versionId ? `dc:${sourceRef.versionId}` : ref.inputId, observationId: sourceRef.observationId };
      if (!visited.has(canonicalize(bound))) refs.push(bound);
    }
  }
  return result.sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
}

/** Pure M3 arithmetic over the already authorized M2 preparation. No persistence or historical replay. */
export function evaluatePreparedMarket(request: MarketNormalizedRequest, prepared: Prepared) {
  const results: { analysis: Analysis; seriesId: string; metrics: MarketAdvancedMetric[] }[] = [];
  const outcomes: MarketOutcome[] = [];
  const gaps: Gap[] = [...prepared.gaps];
  let metricBytes = 0;
  const sourcesFor = (role: MarketDatasetRole) => prepared.sources.filter((source) => source.role === role);
  const select = (role: MarketDatasetRole, seriesId: string, periodId: string): { rows: MarketObservation[]; status: MarketSourceStatus } => {
    const sources = sourcesFor(role);
    if (!sources.length) return { rows: [], status: "NOT_AVAILABLE" };
    const failed = sources.filter((source) => !source.dataset || !source.input || !source.reference || source.status === "NOT_COMPUTABLE");
    if (failed.length) return { rows: [], status: worstStatus(failed.map((source) => source.status)) };
    const matches = sources.flatMap((source) => source.matches.filter((match) => match.seriesId === seriesId && match.periodId === periodId).map((match) => ({ source, match })));
    const rows = matches.flatMap(({ source, match }) => match.status === "AVAILABLE" ? source.observations.filter((row) => match.observationRefs.some((ref) => same(ref, row.ref))) : []);
    const series = request.series.find((entry) => entry.id === seriesId)!;
    if (rows.length && (series.aggregation === "SUM_DISJOINT" || rows.length === 1)) return { rows, status: "AVAILABLE" };
    return { rows: [], status: rows.length > 1 ? "NOT_COMPUTABLE" : worstStatus(matches.length ? matches.map(({ match }) => match.status) : sources.map((source) => source.status)) };
  };
  const dictionaryStatus = (series: MarketNormalizedRequest["series"][number], period: TemporalReference) => {
    const dictionaries = sourcesFor("dimensions.dictionary");
    if (!dictionaries.length || dictionaries.some((source) => !source.dataset || !source.input)) return { status: "NOT_AVAILABLE" as MarketSourceStatus, definition: null };
    const usable = dictionaries.filter((source) => source.status === "AVAILABLE" && source.dataset && marketCoverageStatus(source.dataset, request, period) === "AVAILABLE");
    const definitions = usable.flatMap((source) => source.dataset?.role === "dimensions.dictionary" ? source.dataset.definitions : []).filter((definition) => same(definition.metricDefinition, series.metricDefinition));
    if (!definitions.length) return { status: worstStatus(dictionaries.map((source) => source.dataset ? marketCoverageStatus(source.dataset, request, period) : source.status)), definition: null };
    if (new Set(definitions.map((definition) => canonicalize(definition))).size !== 1 || !same(definitions[0]!.unit, series.unit)) return { status: "NOT_COMPUTABLE" as const, definition: null };
    return { status: "AVAILABLE" as const, definition: definitions[0]! };
  };
  for (const analysis of request.analyses) for (const series of request.series) {
    const metrics: MarketAdvancedMetric[] = [];
    const emit = (periodIds: string[], operation: MarketOutcome["operation"], trace: MarketAdvancedTrace | null, status: MarketSourceStatus, discriminator = "") => {
      const key = `market.${canonicalHash([analysis, series.id, periodIds, operation, discriminator]).slice(0, 32)}`;
      let metric: MarketAdvancedMetric | null = null;
      if (trace && status === "AVAILABLE") {
        trace.supporting = supportingEvidence(trace, prepared.sources);
        const semantics = trace.operation === "EXPLICIT_ESTIMATE" ? trace.outputSemantics
          : trace.operation === "MARKET_COMPARISON" ? trace.to[0]!.semantics : trace.operands[0]!.semantics;
        for (const source of sourcesFor("dimensions.dictionary")) if (source.input && source.status === "AVAILABLE" && source.dataset?.role === "dimensions.dictionary") {
          for (const definition of source.dataset.definitions) if (same(definition.metricDefinition, series.metricDefinition)) {
            trace.supporting.push({ kind: "DEFINITION", inputId: source.input.id, definition, time: semantics.time });
          }
        }
        const estimatedLineage = trace.supporting.some((entry) => entry.kind === "OBSERVATION" ? entry.row.semantics.evidenceNature === "ESTIMATE" : entry.kind === "ASSUMPTION" && entry.row.evidenceNature === "ESTIMATE");
        if (analysis === "OBSERVED_DEMAND" && estimatedLineage) status = "NOT_COMPUTABLE";
        else {
          metric = calculateAdvancedMarketMetric({ key, label: { ar: "مؤشر السوق ضمن نطاقه الموثق", en: `${analysis}: ${series.id} / ${operation}` } }, trace, prepared.inputs, prepared.evaluatedAt);
          metricBytes += Buffer.byteLength(canonicalize(metric), "utf8");
          if (metricBytes > MAX_RUN_JSON_BYTES) throw new EngineError("REQUEST_TOO_LARGE", { first: "Market metric evidence exceeds the shared 2 MiB envelope limit; no trace was truncated" });
          metrics.push(metric); gaps.push(...metric.gaps);
        }
      }
      if (!metric) gaps.push(marketGap(blockingCode(status), key));
      outcomes.push({ key, analysis, seriesId: series.id, periodIds, operation, metricKey: metric?.key ?? null,
        status: metric?.status ?? (status === "AVAILABLE" ? "NOT_COMPUTABLE" : status), value: metric?.value ?? null, resultClass: metric?.resultClass ?? null });
    };
    if (analysis === "DEMAND_TREND") {
      for (const pair of request.parameters.comparisons.filter((pair) => pair.seriesId === series.id)) for (const measure of pair.measures) {
        const from = select("demand.observations", series.id, pair.fromPeriodId);
        const to = select("demand.observations", series.id, pair.toPeriodId);
        emit([pair.fromPeriodId, pair.toPeriodId], measure,
          from.rows.length && to.rows.length ? { operation: "MARKET_COMPARISON", measure, from: from.rows, to: to.rows, aggregation: series.aggregation, supporting: [] } : null,
          from.status === "AVAILABLE" && to.status === "AVAILABLE" ? "AVAILABLE" : worstStatus([from.status, to.status]));
      }
    } else if (analysis === "ASSUMPTION_BASED_DEMAND") {
      for (const estimate of request.parameters.estimates.filter((estimate) => estimate.seriesId === series.id)) {
        const period = series.periods.find((entry) => entry.id === estimate.periodId)!;
        const operands = prepared.operandAvailability.filter((entry) => entry.estimateId === estimate.id);
        const dictionary = dictionaryStatus(series, period);
        const status = operands.length === 3 && operands.every((entry) => entry.status === "AVAILABLE") ? dictionary.status : worstStatus(operands.map((entry) => entry.status));
        const cohort = sourcesFor("context.indicators").flatMap((source) => source.observations).find((row) => same(row.ref, estimate.cohortObservationRef));
        const assumption = (ref: MarketObservation["ref"]) => {
          const source = sourcesFor("demand.assumptions").find((entry) => entry.input?.id === ref.inputId);
          const row = source?.dataset?.role === "demand.assumptions" ? source.dataset.rows.find((entry) => entry.id === ref.observationId) : null;
          return row ? { inputId: ref.inputId, row } : null;
        };
        const adoption = assumption(estimate.adoptionObservationRef); const frequency = assumption(estimate.frequencyObservationRef);
        const trace: MarketAdvancedTrace | null = cohort && adoption && frequency && dictionary.definition ? {
          operation: "EXPLICIT_ESTIMATE", cohort, adoption, frequency, supporting: [],
          outputSemantics: {
            measuredSubject: dictionary.definition.subject, unit: estimate.outputUnit, measureKind: dictionary.definition.measureKind,
            evidenceNature: "ESTIMATE", time: period, dimensions: { ...cohort.semantics.dimensions, metricDefinition: series.metricDefinition, methodology: dictionary.definition.methodology },
          },
          formula: "cohort * adoptionFraction * consumptionFrequency",
          assumptions: [{ id: "explicit-cohort-adoption-frequency", description: "Apply the explicitly selected adoption fraction and per-cohort consumption frequency to the cohort measured at the reporting period start.",
            sourceRefs: [estimate.cohortObservationRef, estimate.adoptionObservationRef, estimate.frequencyObservationRef] }],
          limitations: ["A declared assumption-based scenario, not observed demand or a revenue forecast."],
        } : null;
        emit([period.id], "EXPLICIT_ESTIMATE", trace, trace ? status : status === "AVAILABLE" ? "NOT_AVAILABLE" : status, estimate.id);
      }
    } else {
      const role = analysis === "OBSERVED_DEMAND" ? "demand.observations" : "context.indicators";
      for (const period of series.periods) {
        const selected = select(role, series.id, period.id);
        let status = selected.status;
        if (selected.rows.some((row) => analysis === "OBSERVED_DEMAND" ? isContextSubject(row.subject) || row.semantics.evidenceNature !== "OBSERVATION"
          : !isContextSubject(row.subject) || analysis === "AUDIENCE_CONTEXT" && !["population_count", "household_count"].includes(row.subject))) status = "NOT_COMPUTABLE";
        const trace: MarketAdvancedTrace | null = !selected.rows.length ? null : series.aggregation === "SUM_DISJOINT"
          ? { operation: "SUM_DISJOINT", operands: selected.rows, supporting: [] }
          : { operation: "MARKET_LEVEL", operands: [selected.rows[0]!], supporting: [] };
        emit([period.id], "LEVEL", trace, status);
      }
    }
    metrics.sort((a, b) => compareText(a.key, b.key));
    results.push({ analysis, seriesId: series.id, metrics });
  }
  outcomes.sort((a, b) => compareText(a.key, b.key));
  if (outcomes.length > 500 || results.reduce((sum, entry) => sum + entry.metrics.length, 0) > 500) throw new EngineError("REQUEST_TOO_LARGE", { first: "M3 output exceeds 500 metrics" });
  return { results, outcomes, gaps: normalizeGaps(gaps) };
}
