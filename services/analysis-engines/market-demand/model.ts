import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { assumptionSchema, observationRefSchema, quantitySemanticsSchema, quantityValueProblems } from "../shared/quantities";
import { shortTextSchema } from "../shared/primitives";

export const MARKET_ENGINE_KEY = "market-demand";
export const MARKET_VERSION = "1.0.0-m1";
export const MARKET_REQUEST_CONTRACT = "jenan.market-demand.request/v1";
export const MARKET_RESULT_CONTRACT = "jenan.market-demand.result/v1";
export const marketAnalyses = ["MARKET_CONTEXT", "OBSERVED_DEMAND", "DEMAND_TREND", "AUDIENCE_CONTEXT", "ASSUMPTION_BASED_DEMAND"] as const;
export const marketRoles = ["demand.observations", "context.indicators", "demand.assumptions", "dimensions.dictionary"] as const;
export const proposedMarketTypeKeys = ["market-demand-observations", "market-context-indicators", "market-demand-assumptions", "market-dimensions"] as const;
export const demandSubjects = ["purchase_transactions", "service_use", "product_units"] as const;
export const contextSubjects = ["population_count", "household_count", "business_count", "competitor_count", "poi_count", "context_indicator"] as const;
export const measurementSubjects = [...demandSubjects, ...contextSubjects] as const;
export const marketResultClasses = ["OBSERVED", "ESTIMATED", "DERIVED", "CONTEXTUAL"] as const;
export type MarketResultClass = typeof marketResultClasses[number];
export const isContextSubject = (subject: string) => (contextSubjects as readonly string[]).includes(subject);

export const marketObservationSchema = z.object({
  ref: observationRefSchema,
  subject: z.enum(measurementSubjects),
  semantics: quantitySemanticsSchema,
  status: z.enum(["AVAILABLE", "SUPPRESSED", "NOT_AVAILABLE"]),
  value: z.number().nullable(),
  geographicCoverage: z.enum(["EXACT", "PARTIAL", "UNKNOWN", "OUTSIDE"]),
  temporalCoverage: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]),
  measurementMethod: z.enum(["DOCUMENTED", "LIMITED", "UNSUPPORTED"]),
  method: shortTextSchema,
  sourceRefs: z.array(observationRefSchema).min(1).max(32),
  assumptions: z.array(assumptionSchema).max(20),
  limitations: z.array(shortTextSchema).max(10),
}).strict().superRefine((row, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (row.semantics.measuredSubject !== row.subject) fail("Subject must agree with metric semantics");
  if (row.semantics.comparison) fail("An input observation is not an engine comparison output");
  if ((row.status === "AVAILABLE") !== (row.value !== null)) fail("Only available observations carry values");
  if (row.value !== null) for (const message of quantityValueProblems(row.value, row.semantics, false)) fail(message);
  if (row.semantics.evidenceNature === "ESTIMATE" && (row.assumptions.length === 0 || row.limitations.length === 0)) fail("An estimate requires explicit assumptions and limitations");
  if (row.semantics.evidenceNature !== "ESTIMATE" && row.assumptions.length !== 0) fail("Assumptions cannot be hidden in observed or deterministic derived data");
  const dimension = row.semantics.unit.dimension;
  const required = row.subject === "population_count" ? "PEOPLE"
    : row.subject === "household_count" ? "HOUSEHOLDS"
      : ["business_count", "competitor_count", "poi_count"].includes(row.subject) ? "ENTITIES"
        : ["purchase_transactions", "service_use"].includes(row.subject) ? "EVENTS"
          : row.subject === "product_units" ? "ITEMS" : null;
  if (required && dimension !== required) fail("Unit dimension does not describe the measured subject");
  if (row.semantics.unit.entity !== row.subject) fail("Unit entity must identify what was measured");
  if (row.subject !== "context_indicator" && row.semantics.measureKind !== (isContextSubject(row.subject) ? "STOCK" : "FLOW")) fail("Demand events are period flows; contextual counts are stock snapshots");
  if (new Set(row.assumptions.map((assumption) => assumption.id)).size !== row.assumptions.length) fail("Assumption ids must be unique");
  for (const refs of [row.sourceRefs, ...row.assumptions.map((assumption) => assumption.sourceRefs)]) {
    if (new Set(refs.map((ref) => canonicalize(ref))).size !== refs.length) fail("Source observation references must be unique");
  }
});
export type MarketObservation = z.infer<typeof marketObservationSchema>;

export function normalizeMarketObservation(raw: MarketObservation): MarketObservation {
  const row = marketObservationSchema.parse(raw);
  const sortRefs = (refs: MarketObservation["sourceRefs"]) => [...refs].sort((a, b) => compareText(a.inputId, b.inputId) || compareText(a.observationId, b.observationId));
  return {
    ...row, sourceRefs: sortRefs(row.sourceRefs),
    assumptions: [...row.assumptions].sort((a, b) => compareText(a.id, b.id)).map((assumption) => ({ ...assumption, sourceRefs: sortRefs(assumption.sourceRefs) })),
    limitations: [...new Set(row.limitations)].sort(compareText),
  };
}

export function classifyMarketEvidence(row: MarketObservation, derived = false): MarketResultClass {
  const observation = marketObservationSchema.parse(row);
  if (isContextSubject(observation.subject)) return "CONTEXTUAL";
  if (observation.semantics.evidenceNature === "ESTIMATE") return "ESTIMATED";
  return derived || observation.semantics.evidenceNature === "DERIVED" ? "DERIVED" : "OBSERVED";
}
