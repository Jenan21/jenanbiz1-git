import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { opportunityFactSchema, timestamp, type OpportunityFact } from "./model";
import { opportunityRequestSchema, type OpportunityRequest } from "./request";

export const comparisonReasons = [
  "INPUT_MISSING", "VALUE_MISSING", "NO_COVERAGE", "PARTIAL_COVERAGE", "DEFINITION_MISMATCH", "UNIT_MISMATCH",
  "MEASURE_KIND_MISMATCH", "PERIOD_MISMATCH", "GEOGRAPHY_MISMATCH", "SECTOR_MISMATCH", "COHORT_MISMATCH",
  "METHODOLOGY_MISMATCH", "UNIVERSE_MISMATCH", "ADJUSTMENT_MISMATCH", "BOUNDARY_NOT_COMPARABLE",
  "BENCHMARK_POLICY_MISMATCH", "BENCHMARK_NOT_IN_FORCE",
] as const;
export type ComparisonReason = typeof comparisonReasons[number];
export const comparisonAssessmentSchema = z.object({
  status: z.enum(["COMPUTED", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
  comparable: z.boolean(), definitive: z.boolean(),
  reasons: z.array(z.enum(comparisonReasons)).max(20),
}).strict().superRefine((assessment, context) => {
  const expected = assessmentForReasons(assessment.reasons);
  if (canonicalize(assessment) !== canonicalize(expected)) context.addIssue({ code: "custom", message: "Assessment state must agree with its normalized reasons and eligibility" });
});
export type ComparisonAssessment = z.infer<typeof comparisonAssessmentSchema>;
function assessmentForReasons(reasons: readonly ComparisonReason[]): ComparisonAssessment {
  const ordered = [...new Set(reasons)].sort();
  const incompatible = ordered.some((reason) => !["INPUT_MISSING", "VALUE_MISSING", "NO_COVERAGE", "PARTIAL_COVERAGE"].includes(reason));
  const status = incompatible ? "NOT_COMPUTABLE" : ordered.includes("INPUT_MISSING") ? "NOT_AVAILABLE"
    : ordered.includes("NO_COVERAGE") ? "NO_COVERAGE" : ordered.includes("VALUE_MISSING") ? "NOT_COMPUTABLE" : ordered.includes("PARTIAL_COVERAGE") ? "PARTIAL" : "COMPUTED";
  return { status, comparable: !incompatible && !ordered.includes("INPUT_MISSING"), definitive: status === "COMPUTED", reasons: ordered };
}

/** Eligibility only: COMPUTED means the guard ran, not that an economic gap was calculated. */
export function assessOpportunityComparison(
  kind: "BENCHMARK_GAP" | "DEMAND_SUPPLY_GAP", rawRequest: OpportunityRequest,
  rawLeft: OpportunityFact | null, rawRight: OpportunityFact | null, evaluatedAt: string,
): ComparisonAssessment {
  const request = opportunityRequestSchema.parse(rawRequest);
  timestamp.parse(evaluatedAt);
  const left = rawLeft === null ? null : opportunityFactSchema.parse(rawLeft);
  const right = rawRight === null ? null : opportunityFactSchema.parse(rawRight);
  const reasons = new Set<ComparisonReason>();
  if (!left || !right) return { status: "NOT_AVAILABLE", comparable: false, definitive: false, reasons: ["INPUT_MISSING"] };
  const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
  if (left.value === null || right.value === null) reasons.add("VALUE_MISSING");
  if ([left, right].some((fact) => fact.coverage === "NONE")) reasons.add("NO_COVERAGE");
  if ([left, right].some((fact) => fact.coverage === "PARTIAL" || fact.coverage === "UNKNOWN")) reasons.add("PARTIAL_COVERAGE");
  const expectedLeft = kind === "BENCHMARK_GAP" ? "MEASURED_PROVISION" : "TOTAL_NEED";
  const expectedRight = kind === "BENCHMARK_GAP" ? "NORMATIVE_TARGET" : "SERVICEABLE_CAPACITY";
  if (left.measurementBoundary !== expectedLeft || right.measurementBoundary !== expectedRight) reasons.add("BOUNDARY_NOT_COMPARABLE");
  for (const fact of [left, right]) {
    const { semantics } = fact;
    if (semantics.measuredSubject !== request.definition.measuredSubject || !same(semantics.dimensions.metricDefinition, request.scope.dimensions.metricDefinition)) reasons.add("DEFINITION_MISMATCH");
    if (!same(semantics.unit, request.definition.unit)) reasons.add("UNIT_MISMATCH");
    if (semantics.measureKind !== request.definition.measureKind) reasons.add("MEASURE_KIND_MISMATCH");
    if (!same(semantics.time, request.scope.time)) reasons.add("PERIOD_MISMATCH");
    const checks = [
      ["geography", "GEOGRAPHY_MISMATCH"], ["sector", "SECTOR_MISMATCH"], ["cohort", "COHORT_MISMATCH"],
      ["methodology", "METHODOLOGY_MISMATCH"], ["universe", "UNIVERSE_MISMATCH"], ["adjustment", "ADJUSTMENT_MISMATCH"],
    ] as const;
    for (const [dimension, reason] of checks) if (!same(semantics.dimensions[dimension], request.scope.dimensions[dimension])) reasons.add(reason);
  }
  if (kind === "BENCHMARK_GAP") {
    if (!right.benchmark || !same(right.benchmark.policy, request.benchmarkPolicy)) reasons.add("BENCHMARK_POLICY_MISMATCH");
    if (right.benchmark && (evaluatedAt < right.benchmark.validFrom || evaluatedAt >= right.benchmark.validUntil)) reasons.add("BENCHMARK_NOT_IN_FORCE");
  }
  return assessmentForReasons([...reasons]);
}

/** Taxonomy mapping only. The predicate must come from a future governed rule evaluator, never an inferred business judgment. */
export function classifyOpportunitySignal(assessment: ComparisonAssessment, predicate: boolean | null) {
  const checked = comparisonAssessmentSchema.parse(assessment);
  z.boolean().nullable().parse(predicate);
  if (checked.status === "NOT_COMPUTABLE" && !checked.comparable) return "NOT_COMPARABLE" as const;
  if (!checked.definitive || checked.status !== "COMPUTED" || predicate === null) return "INSUFFICIENT_EVIDENCE" as const;
  return predicate ? "SUPPORTED" as const : "NOT_SUPPORTED" as const;
}
