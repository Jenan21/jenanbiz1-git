import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { computeRequestHash } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { identifierSchema, sha256Schema, timestampSchema } from "../shared/primitives";
import { observationRefSchema, quantityDimensionsSchema, temporalReferenceSchema, timeWindowSchema, unitDefinitionSchema } from "../shared/quantities";
import { MARKET_REQUEST_CONTRACT, marketAnalyses, marketRoles } from "./model";

const exactSelectorSchema = z.object({
  source: z.literal("DATA_CENTER"), versionId: identifierSchema, expectedChecksum: sha256Schema.optional(),
}).strict();
const typeSelectorSchema = z.object({
  source: z.literal("DATA_CENTER"), typeKey: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/), asOf: timestampSchema.optional(),
}).strict();
const selectionSchema = z.union([z.array(exactSelectorSchema).min(1).max(32), typeSelectorSchema]);
const rolesSchema = z.partialRecord(z.enum(marketRoles), selectionSchema);
const seriesSchema = z.object({
  id: identifierSchema,
  metricDefinition: quantityDimensionsSchema.shape.metricDefinition,
  unit: unitDefinitionSchema,
  aggregation: z.enum(["IDENTITY", "SUM_DISJOINT"]),
  timeWindow: timeWindowSchema,
  periods: z.array(temporalReferenceSchema).min(1).max(120),
}).strict();
const comparisonSchema = z.object({
  seriesId: identifierSchema, fromPeriodId: identifierSchema, toPeriodId: identifierSchema,
  measures: z.array(z.enum(["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"])).min(1).max(3),
}).strict();
const parametersSchema = z.object({
  comparisons: z.array(comparisonSchema).max(40),
  basePeriods: z.array(z.object({ seriesId: identifierSchema, periodId: identifierSchema }).strict()).max(20),
  estimates: z.array(z.object({
    id: identifierSchema, seriesId: identifierSchema, cohortObservationRef: observationRefSchema,
    adoptionObservationRef: observationRefSchema, frequencyObservationRef: observationRefSchema,
    outputUnit: unitDefinitionSchema, periodId: identifierSchema,
  }).strict()).max(20),
}).strict();
const requestShape = {
  contract: z.literal(MARKET_REQUEST_CONTRACT),
  analyses: z.array(z.enum(marketAnalyses)).min(1).max(5),
  scope: quantityDimensionsSchema.pick({ geography: true, sector: true, cohort: true }),
  series: z.array(seriesSchema).min(1).max(20),
};
const requestObject = z.object({
  ...requestShape,
  data: z.object({ roles: rolesSchema }).strict().optional(),
  parameters: parametersSchema.partial().optional(),
  options: z.object({ requestId: identifierSchema.optional(), evaluatedAt: timestampSchema.optional() }).strict().optional(),
}).strict();
const normalizedObject = z.object({
  ...requestShape, data: z.object({ roles: rolesSchema }).strict(), parameters: parametersSchema,
}).strict();
type RequestView = z.infer<typeof requestObject>;

export function marketRequestProblems(request: RequestView): string[] {
  const problems: string[] = [];
  const unique = (values: readonly string[], label: string) => { if (new Set(values).size !== values.length) problems.push(`Duplicate ${label}`); };
  unique(request.series.map((series) => series.id), "series id");
  let periods = 0;
  for (const series of request.series) {
    unique(series.periods.map((period) => period.id), "period id");
    periods += series.periods.length;
    for (const period of series.periods) {
      const start = period.kind === "INTERVAL" ? period.startDate : period.date;
      const end = period.kind === "INTERVAL" ? period.endDate : period.date;
      if (start < series.timeWindow.startDate || (period.kind === "INTERVAL" ? end > series.timeWindow.endDate : end >= series.timeWindow.endDate)) problems.push("Selected time lies outside its time window");
    }
  }
  if (periods > 120) problems.push("At most 120 selected periods across the run");
  const parameters = request.parameters;
  const comparisons = parameters?.comparisons ?? [];
  unique(comparisons.map((pair) => canonicalize([pair.seriesId, pair.fromPeriodId, pair.toPeriodId])), "comparison");
  unique((parameters?.basePeriods ?? []).map((base) => base.seriesId), "base for series");
  unique((parameters?.estimates ?? []).map((estimate) => estimate.id), "estimate id");
  if (comparisons.length && !request.analyses.includes("DEMAND_TREND")) problems.push("Comparisons require DEMAND_TREND");
  if (request.analyses.includes("DEMAND_TREND") && !comparisons.length) problems.push("DEMAND_TREND requires explicit comparisons");
  if ((parameters?.estimates?.length ?? 0) > 0 && !request.analyses.includes("ASSUMPTION_BASED_DEMAND")) problems.push("Estimates require ASSUMPTION_BASED_DEMAND");
  if (request.analyses.includes("ASSUMPTION_BASED_DEMAND") && !parameters?.estimates?.length) problems.push("Assumption analysis requires explicit source input references");
  for (const pair of comparisons) {
    const series = request.series.find((entry) => entry.id === pair.seriesId);
    if (!series || !series.periods.some((period) => period.id === pair.fromPeriodId) || !series.periods.some((period) => period.id === pair.toPeriodId) || pair.fromPeriodId === pair.toPeriodId) problems.push("Comparison must resolve two distinct selected periods");
    if (pair.measures.includes("INDEX")) {
      const base = parameters?.basePeriods?.find((entry) => entry.seriesId === pair.seriesId);
      if (!base || base.periodId !== pair.fromPeriodId) problems.push("Index requires an explicit matching base period");
    }
  }
  for (const base of parameters?.basePeriods ?? []) {
    if (!comparisons.some((pair) => pair.seriesId === base.seriesId && pair.measures.includes("INDEX"))) problems.push("Unused base period");
  }
  for (const estimate of parameters?.estimates ?? []) {
    const series = request.series.find((entry) => entry.id === estimate.seriesId);
    if (!series || !series.periods.some((period) => period.id === estimate.periodId) || canonicalize(series.unit) !== canonicalize(estimate.outputUnit)) problems.push("Estimate must resolve its series, period and output unit");
  }
  let versions = 0;
  for (const [role, selector] of Object.entries(request.data?.roles ?? {})) {
    if (Array.isArray(selector)) {
      unique(selector.map((entry) => entry.versionId), "version pin");
      versions += selector.length;
    } else versions++;
    const used = role === "dimensions.dictionary"
      || role === "demand.observations" && request.analyses.some((analysis) => ["OBSERVED_DEMAND", "DEMAND_TREND"].includes(analysis))
      || role === "context.indicators" && request.analyses.some((analysis) => ["MARKET_CONTEXT", "AUDIENCE_CONTEXT", "ASSUMPTION_BASED_DEMAND"].includes(analysis))
      || role === "demand.assumptions" && request.analyses.includes("ASSUMPTION_BASED_DEMAND");
    if (!used) problems.push("Unrelated source role");
  }
  if (versions > 32) problems.push("At most 32 input version selections");
  const levelAnalyses = request.analyses.filter((analysis) => ["MARKET_CONTEXT", "OBSERVED_DEMAND", "AUDIENCE_CONTEXT"].includes(analysis)).length;
  const outputCount = levelAnalyses * periods + comparisons.reduce((count, pair) => count + new Set(pair.measures).size, 0) + (parameters?.estimates?.length ?? 0);
  if (outputCount > 500) problems.push("Request exceeds 500 metric budget");
  return problems;
}
const validateRequest = (request: RequestView, context: z.RefinementCtx) => {
  for (const message of marketRequestProblems(request)) context.addIssue({ code: "custom", message });
};
export const marketRequestSchema = requestObject.superRefine(validateRequest);
export const marketNormalizedRequestSchema = normalizedObject.superRefine(validateRequest);
export type MarketRequest = z.infer<typeof marketRequestSchema>;
export type MarketNormalizedRequest = z.infer<typeof marketNormalizedRequestSchema>;

export function normalizeMarketRequest(input: unknown, context: { evaluatedAt: string; allowEvaluatedAtOverride?: boolean }) {
  const parsed = marketRequestSchema.safeParse(input);
  if (!parsed.success) throw new EngineError("INVALID_INPUT", { issues: parsed.error.issues.length, first: parsed.error.issues[0]?.message.slice(0, 300) ?? "Invalid Market request" });
  const now = timestampSchema.parse(context.evaluatedAt);
  const request = parsed.data;
  const override = request.options?.evaluatedAt;
  if (override && (!context.allowEvaluatedAtOverride || Date.parse(override) > Date.parse(now))) throw new EngineError("INVALID_INPUT", { first: "Evaluation override is unauthorized or in the future" });
  const evaluatedAt = new Date(override ?? now).toISOString();
  const roles = Object.fromEntries(Object.entries(request.data?.roles ?? {}).sort(([a], [b]) => compareText(a, b)).map(([role, selector]) => {
    if (Array.isArray(selector)) return [role, [...selector].sort((a, b) => compareText(a.versionId, b.versionId))];
    const asOf = new Date(selector.asOf ?? evaluatedAt).toISOString();
    if (Date.parse(asOf) > Date.parse(evaluatedAt)) throw new EngineError("INVALID_INPUT", { first: "Selection asOf cannot be in the future" });
    return [role, { ...selector, asOf }];
  }));
  const parameters = request.parameters;
  const normalized = marketNormalizedRequestSchema.parse({
    contract: MARKET_REQUEST_CONTRACT,
    analyses: marketAnalyses.filter((analysis) => request.analyses.includes(analysis)),
    scope: request.scope,
    series: [...request.series].sort((a, b) => compareText(a.id, b.id)).map((series) => ({
      ...series, periods: [...series.periods].sort((a, b) => compareText(a.kind === "INTERVAL" ? a.startDate : a.date, b.kind === "INTERVAL" ? b.startDate : b.date) || compareText(a.id, b.id)),
    })),
    data: { roles },
    parameters: {
      comparisons: [...(parameters?.comparisons ?? [])].map((pair) => ({ ...pair, measures: [...new Set(pair.measures)].sort(compareText) })).sort((a, b) => compareText(canonicalize([a.seriesId, a.fromPeriodId, a.toPeriodId]), canonicalize([b.seriesId, b.fromPeriodId, b.toPeriodId]))),
      basePeriods: [...(parameters?.basePeriods ?? [])].sort((a, b) => compareText(a.seriesId, b.seriesId)),
      estimates: [...(parameters?.estimates ?? [])].sort((a, b) => compareText(a.id, b.id)),
    },
  });
  const normalizedEnvelope = { normalized, evaluatedAt };
  return { ...normalizedEnvelope, requestId: request.options?.requestId ?? null, requestHash: computeRequestHash(normalizedEnvelope) };
}
