import { z } from "zod";
import { canonicalize, compareText, roundTo } from "../shared/canonical";
import { engineInputSchema, engineMetricSchema, type EngineInput, type EngineMetric } from "../shared/contracts";
import { normalizeGaps, type Gap } from "../shared/gaps";
import { EngineError } from "../shared/errors";
import { bilingualSchema, metricKeySchema } from "../shared/primitives";
import { quantitySemanticsSchema, type QuantitySemantics } from "../shared/quantities";
import { calculateMarketConfidence, observationBases } from "./confidence";
import { marketGap } from "./gaps";
import { classifyMarketEvidence, isContextSubject, marketObservationSchema, normalizeMarketObservation, type MarketObservation, type MarketResultClass } from "./model";

export const marketCalculationTraceSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("LEVEL"), operands: z.tuple([marketObservationSchema]) }).strict(),
  z.object({ operation: z.enum(["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"]), operands: z.tuple([marketObservationSchema, marketObservationSchema]) }).strict(),
]);
export type MarketCalculationTrace = z.infer<typeof marketCalculationTraceSchema>;

export function comparableSeriesProblems(first: MarketObservation, second: MarketObservation): string[] {
  const a = marketObservationSchema.parse(first);
  const b = marketObservationSchema.parse(second);
  const problems: string[] = [];
  if (a.subject !== b.subject || canonicalize(a.semantics.dimensions) !== canonicalize(b.semantics.dimensions)
    || canonicalize(a.semantics.unit) !== canonicalize(b.semantics.unit)
    || a.semantics.measureKind !== b.semantics.measureKind) problems.push("Metric, unit, geography, classification, cohort, universe, adjustment and methodology must agree");
  const from = a.semantics.time;
  const to = b.semantics.time;
  if (a.temporalCoverage !== "COMPLETE" || b.temporalCoverage !== "COMPLETE"
    || a.geographicCoverage !== b.geographicCoverage || a.measurementMethod !== b.measurementMethod || a.method !== b.method) problems.push("Reporting coverage and methods must be comparable");
  if (from.kind !== to.kind || from.calendar !== to.calendar || from.timeZone !== to.timeZone) problems.push("Time bases must agree");
  else if (from.kind === "INTERVAL" && to.kind === "INTERVAL") {
    if (from.frequency !== to.frequency || from.endDate > to.startDate) problems.push("Comparison needs ordered nonoverlapping periods at the same frequency");
    if (from.frequency === "CUSTOM" && Date.parse(from.endDate) - Date.parse(from.startDate) !== Date.parse(to.endDate) - Date.parse(to.startDate)) problems.push("Custom periods need equal durations");
  } else if (from.kind === "SNAPSHOT" && to.kind === "SNAPSHOT" && from.date >= to.date) problems.push("Snapshot comparison must move forward in time");
  return problems;
}

export interface MarketCalculatedMetric extends EngineMetric {
  status: "COMPUTED" | "PARTIAL" | "ESTIMATED" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE";
  valueKind: "QUANTITY" | "CHANGE" | "INDEX";
  value: number | null;
  semantics: QuantitySemantics;
  resultClass: MarketResultClass | null;
  signalRole: "DEMAND" | "CONTEXT";
  lineageNature: "OBSERVATION" | "ESTIMATE" | "DERIVED" | null;
  trace: MarketCalculationTrace;
  gaps: Gap[];
}
export const marketMetricSeedSchema = z.object({ key: metricKeySchema, label: bilingualSchema }).strict();
export type MarketMetricSeed = z.infer<typeof marketMetricSeedSchema>;

/** M1 arithmetic over injected evidence only; it discovers, reads and persists nothing. */
export function calculateMarketMetric(
  rawSeed: MarketMetricSeed, rawTrace: MarketCalculationTrace, rawInputs: readonly EngineInput[], evaluatedAt: string,
): MarketCalculatedMetric {
  const seed = marketMetricSeedSchema.parse(rawSeed);
  const parsedTrace = marketCalculationTraceSchema.parse(rawTrace);
  const trace = marketCalculationTraceSchema.parse({ ...parsedTrace, operands: parsedTrace.operands.map(normalizeMarketObservation) });
  const inputs = z.array(engineInputSchema).max(32).parse(rawInputs);
  if (new Set(inputs.map((input) => input.id)).size !== inputs.length) throw new EngineError("INVALID_INPUT", { first: "Duplicate Market input ids" });
  const target = trace.operands[trace.operands.length - 1]!;
  const base = trace.operands[0];
  const comparison = trace.operation !== "LEVEL";
  const estimated = trace.operands.some((row) => row.semantics.evidenceNature === "ESTIMATE");
  const nature = estimated ? "ESTIMATE" : comparison ? "DERIVED" : target.semantics.evidenceNature;
  const unit = trace.operation === "PERCENT_CHANGE" || trace.operation === "INDEX"
    ? { id: trace.operation === "INDEX" ? "base-100" : "percent-change", version: "1", dimension: trace.operation === "INDEX" ? "INDEX" as const : "PERCENT" as const, entity: target.subject, per: null }
    : target.semantics.unit;
  const semantics = quantitySemanticsSchema.parse({
    ...target.semantics, unit, evidenceNature: nature,
    measureKind: trace.operation === "INDEX" ? "INDEX" : comparison && target.semantics.measureKind === "SHARE" ? "FLOW" : target.semantics.measureKind,
    ...(comparison ? { comparison: { operation: trace.operation, from: base.semantics.time, to: target.semantics.time, operandUnit: target.semantics.unit } } : {}),
  });
  const inputRefs = [...new Set(trace.operands.flatMap((row) => [row.ref.inputId, ...row.sourceRefs.map((ref) => ref.inputId), ...row.assumptions.flatMap((assumption) => assumption.sourceRefs.map((ref) => ref.inputId))]))].sort(compareText);
  if (inputRefs.some((id) => !inputs.some((input) => input.id === id))) throw new EngineError("INVALID_INPUT", { first: "Unresolved calculation source input" });
  const limitations = [...new Set(trace.operands.flatMap((row) => row.limitations))].sort(compareText);
  const metric: MarketCalculatedMetric = {
    ...seed, status: "NOT_COMPUTABLE", platformState: "UNAVAILABLE",
    valueKind: trace.operation === "INDEX" ? "INDEX" : comparison ? "CHANGE" : "QUANTITY",
    unit: trace.operation === "INDEX" ? "index_points" : trace.operation === "PERCENT_CHANGE" ? "percent" : "quantity",
    value: null, interpretation: estimated ? "ESTIMATE" : nature === "OBSERVATION" ? "SOURCE_OBSERVATION" : "DERIVED_QUANTITY",
    inputRefs, confidence: null, limitations, method: `market-${trace.operation.toLowerCase().replaceAll("_", "-")}-v1`,
    semantics, resultClass: null, signalRole: isContextSubject(target.subject) ? "CONTEXT" : "DEMAND", lineageNature: null, trace, gaps: [],
  };
  const unavailable = (status: "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE", code: Parameters<typeof marketGap>[0]) => {
    metric.status = status;
    // Shared unavailable metrics cannot carry ESTIMATE interpretation without ESTIMATED status.
    metric.interpretation = nature === "OBSERVATION" ? "SOURCE_OBSERVATION" : "DERIVED_QUANTITY";
    metric.gaps = [marketGap(code, seed.key)];
    engineMetricSchema.parse(metricWithoutMarketFields(metric));
    return metric;
  };
  if (trace.operands.some((row) => row.status !== "AVAILABLE")) return unavailable("NOT_AVAILABLE", "MARKET_NOT_AVAILABLE");
  if (trace.operands.some((row) => row.geographicCoverage === "OUTSIDE")) return unavailable("NO_COVERAGE", "MARKET_NO_COVERAGE");
  if (comparison && comparableSeriesProblems(base, target).length) return unavailable("NOT_COMPUTABLE", "MARKET_NOT_COMPARABLE");
  const confidence = calculateMarketConfidence(observationBases(trace.operands, inputs), evaluatedAt);
  if (confidence.kind === "NOT_SCORABLE") return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  if (trace.operation !== "LEVEL" && trace.operation !== "ABSOLUTE_CHANGE" && (base.value === null || base.value <= 0)) return unavailable("NOT_COMPUTABLE", "MARKET_INVALID_BASE");
  const currentValue = target.value;
  const baseValue = base.value;
  if (currentValue === null || baseValue === null) return unavailable("NOT_AVAILABLE", "MARKET_NOT_AVAILABLE");
  const rawValue = trace.operation === "LEVEL" ? currentValue : trace.operation === "ABSOLUTE_CHANGE" ? currentValue - baseValue
    : trace.operation === "PERCENT_CHANGE" ? 100 * ((currentValue - baseValue) / baseValue) : 100 * (currentValue / baseValue);
  if (!Number.isFinite(rawValue) || Math.abs(rawValue) > Number.MAX_SAFE_INTEGER) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  const value = roundTo(rawValue, 6);
  if (!Number.isFinite(value)) return unavailable("NOT_COMPUTABLE", "MARKET_INSUFFICIENT_EVIDENCE");
  const partial = trace.operands.some((row) => row.geographicCoverage !== "EXACT" || row.temporalCoverage !== "COMPLETE")
    || inputs.filter((input) => inputRefs.includes(input.id)).some((input) => input.completeness !== "INVENTORY");
  metric.status = estimated ? "ESTIMATED" : partial ? "PARTIAL" : "COMPUTED";
  metric.platformState = estimated ? "ESTIMATED" : "COMPUTED";
  metric.value = value;
  metric.confidence = confidence.confidence;
  metric.resultClass = isContextSubject(target.subject) ? "CONTEXTUAL" : estimated ? "ESTIMATED" : classifyMarketEvidence(target, comparison);
  metric.lineageNature = nature;
  if (estimated || partial || confidence.confidence.band !== "HIGH" || limitations.length) metric.gaps = normalizeGaps([marketGap("MARKET_LIMITED_EVIDENCE", seed.key)]);
  engineMetricSchema.parse(metricWithoutMarketFields(metric));
  return metric;
}

export function metricWithoutMarketFields(metric: Omit<MarketCalculatedMetric, "trace">): EngineMetric {
  return {
    key: metric.key, label: metric.label, status: metric.status, platformState: metric.platformState,
    valueKind: metric.valueKind, unit: metric.unit, value: metric.value, interpretation: metric.interpretation,
    inputRefs: metric.inputRefs, confidence: metric.confidence, limitations: metric.limitations,
    semantics: metric.semantics, ...(metric.method === undefined ? {} : { method: metric.method }),
  };
}
