import { z } from "zod";
import { canonicalize, compareText, roundTo } from "../shared/canonical";
import { engineInputSchema, engineMetricSchema, type EngineInput } from "../shared/contracts";
import { buildConfidenceBreakdown } from "../shared/confidence";
import { EngineError } from "../shared/errors";
import { normalizeGaps } from "../shared/gaps";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { assumptionSchema, quantitySemanticsSchema, quantityValueProblems, temporalReferenceSchema } from "../shared/quantities";
import { comparableSeriesProblems, marketMetricSeedSchema, metricWithoutMarketFields, type MarketCalculatedMetric, type MarketMetricSeed } from "./calculations";
import { calculateMarketEvidenceConfidence, marketConfidencePolicy, type MarketConfidenceEvidence } from "./confidence";
import { marketAssumptionRowSchema, marketMetricDefinitionSchema } from "./datasets";
import { marketGap } from "./gaps";
import { isContextSubject, marketObservationSchema, normalizeMarketObservation, type MarketObservation } from "./model";

const observations = z.array(marketObservationSchema).min(1).max(2000);
export const marketEstimateInputSchema = z.object({ inputId: identifierSchema, row: marketAssumptionRowSchema }).strict();
export const marketSupportingEvidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("OBSERVATION"), row: marketObservationSchema }).strict(),
  z.object({ kind: z.literal("ASSUMPTION"), ...marketEstimateInputSchema.shape }).strict(),
  z.object({ kind: z.literal("DEFINITION"), inputId: identifierSchema, definition: marketMetricDefinitionSchema, time: temporalReferenceSchema }).strict(),
]);
const supporting = z.array(marketSupportingEvidenceSchema).max(10_000);
export const marketAdvancedTraceSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("MARKET_LEVEL"), operands: z.tuple([marketObservationSchema]), supporting }).strict(),
  z.object({ operation: z.literal("SUM_DISJOINT"), operands: observations, supporting }).strict(),
  z.object({
    operation: z.literal("MARKET_COMPARISON"), measure: z.enum(["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"]),
    from: observations, to: observations, aggregation: z.enum(["IDENTITY", "SUM_DISJOINT"]), supporting,
  }).strict(),
  z.object({
    operation: z.literal("EXPLICIT_ESTIMATE"), cohort: marketObservationSchema,
    adoption: marketEstimateInputSchema, frequency: marketEstimateInputSchema,
    outputSemantics: quantitySemanticsSchema,
    formula: z.literal("cohort * adoptionFraction * consumptionFrequency"),
    assumptions: z.array(assumptionSchema).min(1).max(20), limitations: z.array(shortTextSchema).min(1).max(10),
    supporting,
  }).strict(),
]);
export type MarketAdvancedTrace = z.infer<typeof marketAdvancedTraceSchema>;
export type MarketAdvancedMetric = Omit<MarketCalculatedMetric, "trace"> & { trace: MarketAdvancedTrace };
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const bindRef = (inputId: string, ref: { versionId?: string; observationId: string }) => ({ inputId: ref.versionId ? `dc:${ref.versionId}` : inputId, observationId: ref.observationId });
export function advancedObservations(trace: MarketAdvancedTrace): MarketObservation[] {
  return trace.operation === "EXPLICIT_ESTIMATE" ? [trace.cohort] : trace.operation === "MARKET_COMPARISON" ? [...trace.from, ...trace.to] : trace.operands;
}
export function advancedSemantics(trace: MarketAdvancedTrace) {
  return trace.operation === "EXPLICIT_ESTIMATE" ? trace.outputSemantics : trace.operation === "MARKET_COMPARISON" ? trace.to[0]!.semantics : trace.operands[0]!.semantics;
}
export function confidenceEvidence(row: MarketObservation): MarketConfidenceEvidence {
  return {
    ref: row.ref, role: isContextSubject(row.subject) ? "context.indicators" : "demand.observations",
    nature: row.semantics.evidenceNature, time: row.semantics.time, status: row.status,
    geographicCoverage: row.geographicCoverage, temporalCoverage: row.temporalCoverage, measurementMethod: row.measurementMethod,
    sourceRefs: [...row.sourceRefs, ...row.assumptions.flatMap((assumption) => assumption.sourceRefs)],
    identity: canonicalize(row),
  };
}
function sumProblems(rows: MarketObservation[]): string[] {
  if (rows.length < 1) return ["No operands"];
  const first = rows[0]!;
  const problems: string[] = [];
  if (!["FLOW", "STOCK"].includes(first.semantics.measureKind)
    || !["EVENTS", "ITEMS", "PEOPLE", "HOUSEHOLDS", "ENTITIES"].includes(first.semantics.unit.dimension)) problems.push("Only additive quantities can be summed; rates, shares and indices need a separate weighting contract");
  if (new Set(rows.map((row) => canonicalize(row.ref))).size !== rows.length) problems.push("Duplicate operand");
  for (const row of rows) {
    if (!same(row.semantics, first.semantics) || row.subject !== first.subject || row.method !== first.method
      || row.measurementMethod !== first.measurementMethod || row.geographicCoverage !== first.geographicCoverage
      || row.temporalCoverage !== first.temporalCoverage) problems.push("Incompatible aggregation operands");
  }
  if (rows.length > 1 && (rows.some((row) => !row.partition || !same(row.partition.scheme, first.partition?.scheme))
    || new Set(rows.map((row) => row.partition?.key)).size !== rows.length)) problems.push("Explicit unique disjoint partition keys in one versioned scheme are required");
  return problems;
}
export function calculateAdvancedMarketMetric(seedInput: MarketMetricSeed, rawTrace: MarketAdvancedTrace, rawInputs: readonly EngineInput[], evaluatedAt: string): MarketAdvancedMetric {
  const seed = marketMetricSeedSchema.parse(seedInput);
  const parsed = marketAdvancedTraceSchema.parse(rawTrace);
  const order = (rows: MarketObservation[]) => rows.map(normalizeMarketObservation).sort((a, b) => compareText(canonicalize(a.ref), canonicalize(b.ref)));
  const trace: MarketAdvancedTrace = parsed.operation === "MARKET_LEVEL" ? { ...parsed, operands: [normalizeMarketObservation(parsed.operands[0])] } : parsed.operation === "SUM_DISJOINT" ? { ...parsed, operands: order(parsed.operands) }
    : parsed.operation === "MARKET_COMPARISON" ? { ...parsed, from: order(parsed.from), to: order(parsed.to) }
      : { ...parsed, cohort: normalizeMarketObservation(parsed.cohort),
        assumptions: [...parsed.assumptions].sort((a, b) => compareText(a.id, b.id)).map((assumption) => ({ ...assumption, sourceRefs: [...assumption.sourceRefs].sort((a, b) => compareText(canonicalize(a), canonicalize(b))) })),
        limitations: [...new Set(parsed.limitations)].sort(compareText) };
  trace.supporting = [...trace.supporting].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  const inputs = engineInputSchema.array().max(32).parse(rawInputs);
  if (new Set(inputs.map((input) => input.id)).size !== inputs.length) throw new EngineError("INVALID_INPUT", { first: "Duplicate source identities" });
  const rows = advancedObservations(trace);
  const allRows = [...rows, ...trace.supporting.flatMap((entry) => entry.kind === "OBSERVATION" ? [entry.row] : [])];
  const assumptions = [...(trace.operation === "EXPLICIT_ESTIMATE" ? [trace.adoption, trace.frequency] : []), ...trace.supporting.flatMap((entry) => entry.kind === "ASSUMPTION" ? [entry] : [])];
  const evidence = allRows.map(confidenceEvidence);
  for (const entry of assumptions) evidence.push({
    ref: { inputId: entry.inputId, observationId: entry.row.id }, role: "demand.assumptions",
    nature: entry.row.evidenceNature, time: entry.row.time, status: "AVAILABLE",
    geographicCoverage: "EXACT", temporalCoverage: "COMPLETE", measurementMethod: "DOCUMENTED",
    sourceRefs: [...entry.row.sourceRefs, ...entry.row.assumptions.flatMap((assumption) => assumption.sourceRefs)].map((ref) => bindRef(entry.inputId, ref)),
    identity: canonicalize({ inputId: entry.inputId, row: entry.row }),
  });
  for (const entry of trace.supporting) if (entry.kind === "DEFINITION") {
    const ref = { inputId: entry.inputId, observationId: entry.definition.metricDefinition.id };
    evidence.push({ ref, role: "dimensions.dictionary", nature: "DERIVED", time: entry.time, status: "AVAILABLE",
      geographicCoverage: "EXACT", temporalCoverage: "COMPLETE", measurementMethod: "DOCUMENTED", sourceRefs: [ref], identity: canonicalize(entry) });
  }
  const inputRefs = [...new Set(evidence.flatMap((row) => [row.ref.inputId, ...row.sourceRefs.map((ref) => ref.inputId)]).concat(
    trace.operation === "EXPLICIT_ESTIMATE" ? trace.assumptions.flatMap((assumption) => assumption.sourceRefs.map((ref) => ref.inputId)) : [],
  ))].sort(compareText);
  if (inputRefs.some((id) => !inputs.some((input) => input.id === id))) throw new EngineError("INVALID_INPUT", { first: "Unresolved advanced calculation input" });
  const comparison = trace.operation === "MARKET_COMPARISON";
  const estimated = trace.operation === "EXPLICIT_ESTIMATE" || evidence.some((row) => row.nature === "ESTIMATE");
  const baseSemantics = advancedSemantics(trace);
  const subject = baseSemantics.measuredSubject;
  const measure = comparison ? trace.measure : null;
  const semantics = quantitySemanticsSchema.parse({
    ...baseSemantics, evidenceNature: estimated ? "ESTIMATE" : trace.operation === "MARKET_LEVEL" ? baseSemantics.evidenceNature : "DERIVED",
    ...(comparison ? {
      unit: measure === "ABSOLUTE_CHANGE" ? baseSemantics.unit : {
        id: measure === "INDEX" ? "base-100" : "percent-change", version: "1", dimension: measure === "INDEX" ? "INDEX" : "PERCENT", entity: subject, per: null,
      },
      measureKind: measure === "INDEX" ? "INDEX" : baseSemantics.measureKind === "SHARE" ? "FLOW" : baseSemantics.measureKind,
      comparison: { operation: measure, from: trace.from[0]!.semantics.time, to: trace.to[0]!.semantics.time, operandUnit: baseSemantics.unit },
    } : {}),
  });
  const limitations = [...new Set([...allRows.flatMap((row) => row.limitations), ...assumptions.flatMap((entry) => entry.row.limitations), ...(trace.operation === "EXPLICIT_ESTIMATE" ? trace.limitations : [])])].sort(compareText);
  if (limitations.length > 10) throw new EngineError("REQUEST_TOO_LARGE", { first: "Calculation requires more than ten distinct limitations; none were discarded" });
  const metric: MarketAdvancedMetric = {
    ...seed, status: "NOT_COMPUTABLE", platformState: "UNAVAILABLE", valueKind: measure === "INDEX" ? "INDEX" : comparison ? "CHANGE" : "QUANTITY",
    unit: measure === "INDEX" ? "index_points" : measure === "PERCENT_CHANGE" ? "percent" : "quantity",
    value: null, interpretation: "DERIVED_QUANTITY", inputRefs, confidence: null, limitations,
    method: trace.operation === "EXPLICIT_ESTIMATE" ? "market-explicit-cohort-adoption-frequency-v1" : trace.operation === "SUM_DISJOINT" ? "market-sum-disjoint-v1" : trace.operation === "MARKET_LEVEL" ? "market-level-v1" : `market-${trace.measure.toLowerCase().replaceAll("_", "-")}-v1`,
    semantics, resultClass: null, signalRole: isContextSubject(subject) ? "CONTEXT" : "DEMAND", lineageNature: null, trace, gaps: [],
  };
  const finish = () => {
    engineMetricSchema.parse(metricWithoutMarketFields(metric));
    return metric;
  };
  const unavailable = (status: "NOT_AVAILABLE" | "NO_COVERAGE" | "NOT_COMPUTABLE", code: Parameters<typeof marketGap>[0]) => {
    metric.status = status; metric.gaps = [marketGap(code, seed.key)]; return finish();
  };
  if (allRows.some((row) => row.status !== "AVAILABLE")) return unavailable("NOT_AVAILABLE", "MARKET_NOT_AVAILABLE");
  if (allRows.some((row) => row.geographicCoverage === "OUTSIDE")) return unavailable("NO_COVERAGE", "MARKET_NO_COVERAGE");
  const evidenceRefs = new Set(evidence.map((entry) => canonicalize(entry.ref)));
  if (evidence.some((entry) => entry.sourceRefs.some((ref) => !evidenceRefs.has(canonicalize(ref))))) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  if (trace.operation === "SUM_DISJOINT" && sumProblems(trace.operands).length) return unavailable("NOT_COMPUTABLE", "MARKET_NOT_COMPARABLE");
  if (comparison && (sumProblems(trace.from).length || sumProblems(trace.to).length
    || (trace.aggregation === "IDENTITY" && (trace.from.length !== 1 || trace.to.length !== 1))
    || comparableSeriesProblems(trace.from[0]!, trace.to[0]!).length
    || (trace.from.length > 1 || trace.to.length > 1) && !same(trace.from[0]!.partition?.scheme, trace.to[0]!.partition?.scheme)
    || !same(trace.from.map((row) => row.partition?.key ?? "").sort(compareText), trace.to.map((row) => row.partition?.key ?? "").sort(compareText)))) return unavailable("NOT_COMPUTABLE", "MARKET_NOT_COMPARABLE");
  if (trace.operation === "EXPLICIT_ESTIMATE") {
    const { cohort, adoption, frequency, outputSemantics: output } = trace;
    const a = adoption.row; const f = frequency.row;
    const dimensions = (value: typeof output.dimensions) => ({ geography: value.geography, sector: value.sector, cohort: value.cohort, universe: value.universe, adjustment: value.adjustment });
    if (!["population_count", "household_count"].includes(cohort.subject) || cohort.semantics.time.kind !== "SNAPSHOT" || output.time.kind !== "INTERVAL"
      || cohort.semantics.time.date !== output.time.startDate
      || cohort.semantics.time.calendar !== output.time.calendar || cohort.semantics.time.timeZone !== output.time.timeZone
      || a.kind !== "ADOPTION_FRACTION" || f.kind !== "CONSUMPTION_FREQUENCY"
      || !same(a.time, output.time) || !same(f.time, output.time)
      || [cohort.semantics.dimensions, a.dimensions, f.dimensions].some((dimension) => !same(dimensions(dimension), dimensions(output.dimensions)))
      || a.unit.entity !== cohort.subject || f.unit.per?.entity !== cohort.subject || f.unit.entity !== output.measuredSubject
      || f.unit.per.frequency !== output.time.frequency || output.unit.entity !== output.measuredSubject
      || !["purchase_transactions", "service_use", "product_units"].includes(output.measuredSubject)
      || output.measureKind !== "FLOW" || output.evidenceNature !== "ESTIMATE" || output.comparison
      || (output.measuredSubject === "product_units" ? output.unit.dimension !== "ITEMS" : output.unit.dimension !== "EVENTS")
      || [cohort.ref, { inputId: adoption.inputId, observationId: a.id }, { inputId: frequency.inputId, observationId: f.id }].some((ref) =>
        !trace.assumptions.some((assumption) => assumption.sourceRefs.some((source) => same(source, ref))))) return unavailable("NOT_COMPUTABLE", "MARKET_NOT_COMPARABLE");
  }
  const confidence = calculateMarketEvidenceConfidence(evidence.map((observation) => ({ observation, input: inputs.find((input) => input.id === observation.ref.inputId)! })), evaluatedAt);
  if (confidence.kind !== "SCORED") return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  const total = (operands: MarketObservation[]) => operands.reduce((sum, row) => sum + row.value!, 0);
  let rawValue: number;
  if (trace.operation === "EXPLICIT_ESTIMATE") rawValue = trace.cohort.value! * trace.adoption.row.value * trace.frequency.row.value;
  else if (trace.operation === "SUM_DISJOINT" || trace.operation === "MARKET_LEVEL") rawValue = total(trace.operands);
  else {
    const from = total(trace.from); const to = total(trace.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from) > Number.MAX_SAFE_INTEGER || Math.abs(to) > Number.MAX_SAFE_INTEGER) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
    if (trace.measure !== "ABSOLUTE_CHANGE" && from <= 0) return unavailable("NOT_COMPUTABLE", "MARKET_INVALID_BASE");
    rawValue = trace.measure === "ABSOLUTE_CHANGE" ? to - from : trace.measure === "PERCENT_CHANGE" ? 100 * ((to - from) / from) : 100 * to / from;
  }
  if (!Number.isFinite(rawValue) || Math.abs(rawValue) > Number.MAX_SAFE_INTEGER) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  if (!comparison && ["EVENTS", "PEOPLE", "HOUSEHOLDS", "ENTITIES"].includes(semantics.unit.dimension) && !Number.isSafeInteger(rawValue)) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  const value = roundTo(rawValue, 6);
  if (quantityValueProblems(value, semantics, comparison).length) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  const estimatedCap = marketConfidencePolicy.caps.find((cap) => cap.code === "MARKET_ESTIMATED")!;
  metric.confidence = estimated ? buildConfidenceBreakdown(marketConfidencePolicy, confidence.confidence.factors, [
    ...confidence.confidence.caps, { code: estimatedCap.code, maxBand: estimatedCap.maxBand, reason: estimatedCap.appliesWhen },
  ]) : confidence.confidence;
  const partial = allRows.some((row) => row.geographicCoverage !== "EXACT" || row.temporalCoverage !== "COMPLETE")
    || inputs.filter((input) => inputRefs.includes(input.id)).some((input) => input.completeness !== "INVENTORY");
  metric.status = estimated ? "ESTIMATED" : partial ? "PARTIAL" : "COMPUTED";
  metric.platformState = estimated ? "ESTIMATED" : "COMPUTED"; metric.value = value;
  metric.interpretation = estimated ? "ESTIMATE" : semantics.evidenceNature === "OBSERVATION" ? "SOURCE_OBSERVATION" : "DERIVED_QUANTITY";
  metric.resultClass = isContextSubject(subject) ? "CONTEXTUAL" : estimated ? "ESTIMATED" : semantics.evidenceNature === "OBSERVATION" ? "OBSERVED" : "DERIVED";
  metric.lineageNature = semantics.evidenceNature;
  if (estimated || partial || limitations.length || metric.confidence.band !== "HIGH") metric.gaps = normalizeGaps([marketGap("MARKET_LIMITED_EVIDENCE", seed.key)]);
  return finish();
}
