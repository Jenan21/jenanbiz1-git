import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { confidenceBreakdownSchema } from "../shared/confidence";
import { computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, findEnvelopeViolations, timingSchema } from "../shared/contracts";
import { combineGapCatalogs, createGap, normalizeGaps } from "../shared/gaps";
import { identifierSchema } from "../shared/primitives";
import { engineEnvironments, platformStateFor } from "../shared/states";
import { assessOpportunityComparison, classifyOpportunitySignal } from "./comparison";
import { calculateOpportunityConfidence, opportunityConfidencePolicy, type OpportunityConfidenceBasis } from "./confidence";
import { opportunityFindingSchema, opportunityGapCatalog, opportunityMetricSchema, opportunityResultSchema } from "./contracts";
import { prepareOpportunityData, type OpportunityPreparedSource } from "./data-sources";
import { type OpportunityDataPort } from "./data-port";
import { opportunityEvidenceSchema, opportunityInputSchema, opportunityRoles, sortedUnique, timestamp, type OpportunityFact } from "./model";
import { ensureOpportunitySize, normalizeOpportunityEvidence, normalizeOpportunityRequest, type OpportunityRequest } from "./request";

export const OPPORTUNITY_CALCULATION_VERSION = "1.0.0-m3";
export const opportunitySignalRule = { id: "opportunity-positive-difference", version: "1.0.0" } as const;
const disclaimer = "A comparable positive difference is not observed unmet demand, an investment recommendation or a probability of success.";
const benchmarkDisclaimer = "A normative target is not observed demand.";
const label = (en: string) => ({ en, ar: "مقارنة كمية موثقة؛ ليست توصية استثمارية" });
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
export const opportunityCalculationGapCatalog = combineGapCatalogs(opportunityGapCatalog, {
  OPPORTUNITY_EVIDENCE_BLOCKED: {
    severity: "BLOCKING", message: label("Required evidence does not permit a definitive calculation."),
    remedy: label("Provide exact, complete, fresh and comparable governed observations."),
  },
});
export const opportunitySourceDiagnosticSchema = z.object({
  phase: z.enum(["CURRENT", "HISTORICAL"]), role: z.enum(opportunityRoles),
  requestedVersionId: identifierSchema.nullable(),
  status: z.enum(["AVAILABLE", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"]),
  reason: z.string().min(1).max(160),
}).strict();
export const opportunityCalculationEvidenceSchema = z.object({
  current: opportunityEvidenceSchema, historical: opportunityEvidenceSchema,
  retainedInputs: z.array(opportunityInputSchema).max(32),
  sources: z.array(opportunitySourceDiagnosticSchema).max(64),
}).strict();
export type OpportunityCalculationEvidence = z.infer<typeof opportunityCalculationEvidenceSchema>;
const findingSchema = z.object({ ...opportunityFindingSchema.shape, confidence: confidenceBreakdownSchema.nullable() }).strict().superRefine((finding, context) => {
  const foundation = opportunityFindingSchema.safeParse({ ...finding, confidence: null });
  if (!foundation.success) for (const issue of foundation.error.issues) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export const opportunityCalculationResultSchema = opportunityResultSchema.extend({
  engine: opportunityResultSchema.shape.engine.extend({ version: z.literal(OPPORTUNITY_CALCULATION_VERSION) }),
  findings: z.array(findingSchema).max(500),
  calculationEvidence: opportunityCalculationEvidenceSchema,
  realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
}).strict();
export type OpportunityCalculationResult = z.infer<typeof opportunityCalculationResultSchema>;
export const opportunityCalculationContextSchema = z.object({
  runId: identifierSchema, evaluatedAt: timestamp, environment: z.enum(engineEnvironments), timing: timingSchema,
}).strict();
type Context = z.infer<typeof opportunityCalculationContextSchema>;
export type OpportunityCalculationContext = Context;
type Metric = z.infer<typeof opportunityMetricSchema>;
type Finding = z.infer<typeof findingSchema>;
type Status = Metric["status"];
type Kind = "DEMAND_SUPPLY_GAP" | "BENCHMARK_GAP";
class OpportunityCalculationInputError extends Error {}

function normalizeEvidence(raw: unknown, request: OpportunityRequest): OpportunityCalculationEvidence {
  ensureOpportunitySize(raw);
  const parsed = opportunityCalculationEvidenceSchema.parse(raw);
  const current = normalizeOpportunityEvidence(parsed.current);
  const historical = normalizeOpportunityEvidence(parsed.historical);
  if (!request.historical && (historical.inputs.length || historical.facts.length || parsed.sources.some((s) => s.phase === "HISTORICAL"))) throw new OpportunityCalculationInputError("Unrequested historical evidence");
  const inputs = normalizeOpportunityEvidence({ inputs: parsed.retainedInputs, facts: [] }).inputs;
  const descriptors = new Map(inputs.map((input) => [input.id, input]));
  for (const [phase, evidence, pins] of [
    ["CURRENT", current, request.data.roles],
    ["HISTORICAL", historical, request.historical?.versions ?? []],
  ] as const) {
    for (const input of evidence.inputs) {
      if (!same(descriptors.get(input.id), input)) throw new OpportunityCalculationInputError("Retained input metadata must exactly match operand metadata");
      if (!input.roles.every((role) => pins.some((pin) => pin.role === role && pin.versionId === input.ref.id && pin.checksum === input.checksum?.value))) throw new OpportunityCalculationInputError(`Unpinned ${phase} evidence`);
    }
    for (const source of parsed.sources.filter((source) => source.phase === phase)) {
      if (source.requestedVersionId !== null && !pins.some((pin) => pin.role === source.role && pin.versionId === source.requestedVersionId)) throw new OpportunityCalculationInputError("Unrequested source diagnostic");
    }
  }
  const pins = [...request.data.roles, ...(request.historical?.versions ?? [])];
  for (const input of inputs) if (!input.roles.every((role) => pins.some((pin) => pin.role === role && pin.versionId === input.ref.id && pin.checksum === input.checksum?.value))) throw new OpportunityCalculationInputError("Unpinned retained input");
  const sources = [...parsed.sources].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  if (new Set(sources.map((source) => `${source.phase}|${source.role}|${source.requestedVersionId}`)).size !== sources.length) throw new OpportunityCalculationInputError("Duplicate source diagnostic");
  return { current, historical, retainedInputs: inputs, sources };
}

function assemble(rawRequest: unknown, rawEvidence: unknown, rawContext: Context): OpportunityCalculationResult {
  const context = opportunityCalculationContextSchema.parse(rawContext);
  const normalized = normalizeOpportunityRequest(rawRequest, context.evaluatedAt);
  const request = normalized.normalized;
  const data = normalizeEvidence(rawEvidence, request);
  const allFacts = [...new Map([...data.current.facts, ...data.historical.facts].map((fact) => [fact.id, fact])).values()].sort((a, b) => compareText(a.id, b.id));
  if (data.current.facts.length + data.historical.facts.length > 10_000) throw new RangeError("Combined current/historical facts exceed 10000");
  const currentFacts = new Map(data.current.facts.map((fact) => [fact.id, fact]));
  for (const fact of data.historical.facts) {
    const current = currentFacts.get(fact.id);
    if (current && !same(current, fact)) throw new OpportunityCalculationInputError("One exact fact cannot change between phases");
  }
  const evidence = normalizeOpportunityEvidence({ inputs: data.retainedInputs, facts: allFacts });
  const rights = deriveRights(evidence.inputs);
  const metrics: Metric[] = [];
  const findings: Finding[] = [];
  let rules = 0;
  const refsFor = (facts: OpportunityFact[]) => [...new Map(facts.flatMap((fact) => fact.evidence).map((ref) => [canonicalize(ref), ref])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  const makeConfidence = (facts: OpportunityFact[], scope: OpportunityRequest["scope"]) => {
    const ids = sortedUnique(facts.flatMap((fact) => fact.evidence.map((ref) => ref.inputId)));
    const bases: OpportunityConfidenceBasis[] = ids.map((id) => {
      const input = evidence.inputs.find((entry) => entry.id === id)!;
      const operands = facts.filter((fact) => fact.evidence.some((ref) => ref.inputId === id));
      return {
        input, analysisUsage: "ALLOWED", measurement: "DOCUMENTED", comparability: "EXACT",
        coverage: operands.every((fact) => fact.coverage === "COMPLETE") && input.completeness === "INVENTORY" && input.coverage?.countryCodes.includes(scope.dimensions.geography.countryCode) ? "COMPLETE" : "PARTIAL",
        provenance: "DOCUMENTED", applicability: "DOCUMENTED", operandConfidence: null,
      };
    });
    const operandScores = bases.map((basis) => calculateOpportunityConfidence([basis], context.evaluatedAt).confidence);
    if (operandScores.some((confidence) => confidence === null)) return null;
    return calculateOpportunityConfidence(bases.map((basis, index) => ({ ...basis, operandConfidence: operandScores[index]! })), context.evaluatedAt).confidence;
  };
  const emit = (key: string, kind: Finding["kind"], status: Status, value: number | boolean | null,
    facts: OpportunityFact[], scope: OpportunityRequest["scope"], formula: string, reasons: string[],
    options: { index?: boolean; signal?: Finding["signalState"]; benchmark?: boolean } = {}) => {
    const inputRefs = sortedUnique(facts.flatMap((fact) => fact.evidence.map((ref) => ref.inputId)));
    const factRefs = sortedUnique(facts.map((fact) => fact.id));
    const sourceRefs = refsFor(facts);
    const confidence = value === null ? null : makeConfidence(facts, scope);
    if (value !== null && confidence === null) { value = null; status = "NOT_COMPUTABLE"; reasons = [...reasons, "CONFIDENCE_NOT_SCORABLE"]; }
    if (status === "PARTIAL") { status = "NOT_COMPUTABLE"; reasons = [...reasons, "PARTIAL_EVIDENCE_CANNOT_ESTABLISH_POPULATION_GAP"]; }
    if (typeof value === "number" && (!Number.isFinite(value) || !options.index && ["EVENTS", "PEOPLE", "HOUSEHOLDS", "ENTITIES"].includes(request.definition.unit.dimension) && !Number.isSafeInteger(value))) {
      value = null; status = "NOT_COMPUTABLE"; reasons = [...reasons, "NUMERIC_RESULT_NOT_REPRESENTABLE"];
    }
    const limitations = sortedUnique([disclaimer, ...(options.benchmark ? [benchmarkDisclaimer] : []), ...(reasons.length ? [sortedUnique(reasons).join("; ")] : []), ...facts.flatMap((fact) => fact.limitations)]);
    if (limitations.length > 10) throw new RangeError("Calculation limitations exceed 10; refusing truncation");
    const boolean = options.signal !== undefined || typeof value === "boolean";
    const metric: Metric = {
      contract: "jenan.opportunity-gap.metric/v1", key, label: label(formula), status,
      platformState: platformStateFor(status),
      valueKind: boolean ? "BOOLEAN" : options.index ? "INDEX" : "CHANGE",
      unit: boolean ? "none" : options.index ? "index_points" : "quantity",
      value, confidence: value === null ? null : confidence, interpretation: boolean ? "MAPPED_FEATURES_ONLY" : "DERIVED_QUANTITY",
      inputRefs, limitations, method: formula, factRefs, evidence: sourceRefs, scope,
      ...(!boolean ? { semantics: {
        ...request.definition, ...scope, evidenceNature: "DERIVED" as const,
        ...(options.index ? { measureKind: "INDEX" as const, unit: { id: "comparison-index-base-100", version: "1", dimension: "INDEX" as const, entity: request.definition.unit.entity, per: null } } : {}),
        comparison: { operation: options.index ? "INDEX" as const : "ABSOLUTE_CHANGE" as const, from: scope.time, to: scope.time, operandUnit: request.definition.unit },
      } } : {}),
    };
    const checked = opportunityMetricSchema.parse(metric);
    metrics.push(checked);
    findings.push(findingSchema.parse({
      contract: "jenan.opportunity-gap.finding/v1", id: key, kind, status, label: label(formula), scope,
      metricKeys: [key], factRefs, inputRefs, evidence: sourceRefs,
      method: { id: "opportunity-gap-calculations", version: "1.0.0", description: formula },
      benchmarkPolicy: options.benchmark && kind === "BENCHMARK_GAP" ? request.benchmarkPolicy : null,
      rulePolicy: kind === "OPPORTUNITY_SIGNAL" ? request.signalPolicy : null,
      signalState: options.signal ?? null, limitations, confidence: value === null ? null : confidence, provenance: sourceRefs, rights,
    }));
    return checked;
  };
  const compare = (kind: Kind, phase: OpportunityPreparedSource["phase"], scope: OpportunityRequest["scope"]) => {
    const pool = phase === "CURRENT" ? data.current : data.historical;
    const roles = kind === "DEMAND_SUPPLY_GAP" ? ["need.observations", "supply.capacity"] as const : ["provision.observations", "benchmarks.targets"] as const;
    const groups = roles.map((role) => pool.facts.filter((fact) => fact.role === role));
    const facts = groups.flat();
    const reasons: string[] = [];
    const baseAssessment = assessOpportunityComparison(kind, { ...request, scope }, groups[0]?.length === 1 ? groups[0][0]! : null, groups[1]?.length === 1 ? groups[1][0]! : null, context.evaluatedAt);
    let assessment = baseAssessment;
    const pins = phase === "CURRENT" ? request.data.roles : request.historical?.versions ?? [];
    if (groups.some((group) => group.length > 1) || roles.some((role) => pins.filter((pin) => pin.role === role).length > 1)) { assessment = { status: "NOT_COMPUTABLE", comparable: false, definitive: false, reasons: [] }; reasons.push("AMBIGUOUS_OPERANDS_NO_APPROVED_AGGREGATION"); }
    reasons.push(...assessment.reasons);
    const diagnostics = data.sources.filter((source) => source.phase === phase && roles.some((role) => role === source.role) && source.status !== "AVAILABLE");
    reasons.push(...diagnostics.map((source) => source.reason));
    if (diagnostics.length && assessment.status !== "NOT_COMPUTABLE") {
      const status = diagnostics.some((s) => s.status === "NOT_COMPUTABLE") ? "NOT_COMPUTABLE"
        : diagnostics.some((s) => s.status === "NOT_AVAILABLE") ? "NOT_AVAILABLE"
        : diagnostics.some((s) => s.status === "NO_COVERAGE") ? "NO_COVERAGE" : "PARTIAL";
      assessment = { ...assessment, status, definitive: false, comparable: status !== "NOT_COMPUTABLE" && assessment.comparable };
    }
    for (const fact of facts) {
      const end = fact.semantics.time.kind === "INTERVAL" ? fact.semantics.time.endDate : fact.semantics.time.date;
      if (end > context.evaluatedAt.slice(0, 10)) reasons.push("FUTURE_REPORTING_PERIOD");
      for (const ref of fact.evidence) {
        const input = evidence.inputs.find((entry) => entry.id === ref.inputId)!;
        const fresh = input.freshness.status === "FRESH" && input.freshness.sourcePublishedAt !== null && input.freshness.freshnessDays !== null
          && Date.parse(context.evaluatedAt) - Date.parse(input.freshness.sourcePublishedAt) < input.freshness.freshnessDays * 86_400_000;
        if (!fresh || input.completeness !== "INVENTORY" || input.coverage === null) reasons.push("INCOMPLETE_OR_STALE_SOURCE");
      }
    }
    if (reasons.includes("FUTURE_REPORTING_PERIOD")) assessment = { ...assessment, status: "NOT_COMPUTABLE", definitive: false };
    if (reasons.includes("INCOMPLETE_OR_STALE_SOURCE") && assessment.status === "COMPUTED") assessment = { ...assessment, status: "PARTIAL", definitive: false };
    const left = groups[0]?.[0]?.value; const right = groups[1]?.[0]?.value;
    const valid = assessment.definitive && left !== null && left !== undefined && right !== null && right !== undefined;
    const delta = valid ? left - right : null;
    const key = `${phase.toLowerCase()}.${kind.toLowerCase()}`;
    const gap = emit(key, kind, assessment.status, delta, facts, scope, kind === "DEMAND_SUPPLY_GAP" ? "totalNeed - serviceableCapacity" : "measuredProvision - documentedTarget", reasons, { benchmark: kind === "BENCHMARK_GAP" });
    const shortfall = kind === "BENCHMARK_GAP" && typeof gap.value === "number" ? Math.max(-gap.value, 0) : null;
    if (kind === "BENCHMARK_GAP") emit(`${key}.shortfall`, kind, gap.status, shortfall, facts, scope, "max(documentedTarget - measuredProvision, 0)", reasons, { benchmark: true });
    const index = valid && right > 0 ? left / right * 100 : null;
    emit(`${key}.index`, kind, gap.status === "COMPUTED" && index === null ? "NOT_COMPUTABLE" : gap.status, gap.status === "COMPUTED" ? index : null,
      facts, scope, "(leftOperand / rightOperand) * 100; denominator is capacity or target; 100 means equality", index === null && valid ? [...reasons, "ZERO_DENOMINATOR"] : reasons, { index: true, benchmark: kind === "BENCHMARK_GAP" });
    return { gap, facts, assessment, baseAssessment, reasons };
  };
  const kinds: Kind[] = [];
  if (request.analyses.includes("DEMAND_SUPPLY_GAP")) kinds.push("DEMAND_SUPPLY_GAP");
  if (request.analyses.includes("BENCHMARK_GAP")) kinds.push("BENCHMARK_GAP");
  const comparisons = kinds.map((kind) => ({ kind, ...compare(kind, "CURRENT", request.scope) }));
  if (request.historical) {
    for (const current of comparisons) {
      const previous = compare(current.kind, "HISTORICAL", request.historical.scope);
      const from = request.historical.scope.time; const to = request.scope.time;
      const sameDimensions = same(request.scope.dimensions, request.historical.scope.dimensions);
      const chronological = from.kind === "INTERVAL" && to.kind === "INTERVAL" ? from.endDate <= to.startDate && from.frequency === to.frequency && from.frequency !== "CUSTOM" && from.calendar === to.calendar && from.timeZone === to.timeZone
        : from.kind === "SNAPSHOT" && to.kind === "SNAPSHOT" && from.date < to.date && from.timeZone === to.timeZone;
      const valid = sameDimensions && chronological && current.gap.status === "COMPUTED" && previous.gap.status === "COMPUTED";
      const value = valid && typeof current.gap.value === "number" && typeof previous.gap.value === "number" ? current.gap.value - previous.gap.value : null;
      const metric = emit(`historical_change.${current.kind.toLowerCase()}`, current.kind, value === null ? "NOT_COMPUTABLE" : "COMPUTED", value,
        [...current.facts, ...previous.facts], request.scope, "currentSignedBalance - historicalSignedBalance; no interpolation", value === null ? ["HISTORICAL_COMPARISON_NOT_COMPUTABLE"] : [], { benchmark: current.kind === "BENCHMARK_GAP" });
      metric.semantics = { ...metric.semantics!, comparison: { operation: "ABSOLUTE_CHANGE", from, to, operandUnit: request.definition.unit } };
    }
  }
  if (request.analyses.includes("OPPORTUNITY_SIGNALS")) {
    for (const comparison of comparisons) {
      if (++rules > 100) throw new RangeError("More than 100 signal evaluations");
      const approved = same(request.signalPolicy, opportunitySignalRule);
      const computed = comparison.gap.status === "COMPUTED" && typeof comparison.gap.value === "number";
      const positive = computed ? comparison.kind === "DEMAND_SUPPLY_GAP" ? Number(comparison.gap.value) > 0 : Number(comparison.gap.value) < 0 : null;
      const state = !approved || comparison.assessment.status === "NOT_COMPUTABLE" && !comparison.assessment.comparable
        ? "NOT_COMPARABLE" : classifyOpportunitySignal(comparison.baseAssessment, computed ? positive : null);
      emit(`signal.${comparison.kind.toLowerCase()}`, "OPPORTUNITY_SIGNAL", approved ? comparison.gap.status : "NOT_COMPUTABLE",
        approved && computed ? positive : null, comparison.facts, request.scope, "opportunity-positive-difference/1.0.0; positive balance or documented target shortfall only",
        approved ? comparison.reasons : ["SIGNAL_POLICY_NOT_SUPPORTED"], { signal: state, benchmark: comparison.kind === "BENCHMARK_GAP" });
    }
    if (!comparisons.length) emit("signal.no_comparison", "OPPORTUNITY_SIGNAL", "NOT_AVAILABLE", null, [], request.scope, "No requested comparison supplies a signal predicate", ["COMPARISON_REQUIRED"], { signal: "INSUFFICIENT_EVIDENCE" });
  }
  if (request.analyses.includes("DATA_COVERAGE")) {
    const complete = data.current.facts.length > 0 && data.current.facts.every((fact) => fact.coverage === "COMPLETE" && fact.value !== null
      && same({ dimensions: fact.semantics.dimensions, time: fact.semantics.time }, request.scope)
      && same({ measuredSubject: fact.semantics.measuredSubject, unit: fact.semantics.unit, measureKind: fact.semantics.measureKind }, request.definition))
      && request.data.roles.every((pin) => data.current.inputs.some((input) => input.ref.id === pin.versionId && input.roles.includes(pin.role)))
      && data.sources.filter((source) => source.phase === "CURRENT").every((source) => source.status === "AVAILABLE")
      && data.current.inputs.every((input) => input.completeness === "INVENTORY" && input.coverage !== null && input.freshness.status === "FRESH"
        && input.freshness.sourcePublishedAt !== null && input.freshness.freshnessDays !== null && Date.parse(context.evaluatedAt) - Date.parse(input.freshness.sourcePublishedAt) < input.freshness.freshnessDays * 86_400_000);
    emit("data_gap.detected", "DATA_GAP", complete ? "COMPUTED" : data.current.inputs.length ? "NOT_COMPUTABLE" : "NOT_AVAILABLE",
      complete ? false : null, data.current.facts, request.scope,
      "Data gap detected=false only for complete, fresh, exactly scoped evidence; coverage is not an opportunity.",
      complete ? [] : ["DATA_COVERAGE_INCOMPLETE_OR_UNVERIFIED"]);
  }
  const blocked = metrics.some((metric) => metric.value === null);
  const diagnosticReasons = sortedUnique(data.sources.filter((source) => source.status !== "AVAILABLE").map((source) => source.reason));
  if (blocked || diagnosticReasons.length || !metrics.length) {
    emit("data_gap", "DATA_GAP", blocked ? "NOT_COMPUTABLE" : "NOT_AVAILABLE", null, allFacts, request.scope,
      "Missing, partial, stale, ambiguous or incompatible evidence is a data gap, not a market opportunity.",
      diagnosticReasons.length ? diagnosticReasons : ["SEE_COMPARISON_LIMITATIONS"]);
  }
  if (metrics.length + findings.length > 500) throw new RangeError("Combined metrics/findings exceed 500");
  metrics.sort((a, b) => compareText(a.key, b.key));
  findings.sort((a, b) => compareText(a.id, b.id));
  const costUnits = data.current.facts.length + data.historical.facts.length + data.retainedInputs.length + metrics.length + rules;
  if (costUnits > 20_000) throw new RangeError("Opportunity calculation cost exceeds 20000");
  const gaps = normalizeGaps([...evidence.inputs.flatMap(deriveInputGaps), ...(blocked || diagnosticReasons.length || !comparisons.length && !request.analyses.includes("DATA_COVERAGE") ? [createGap(opportunityCalculationGapCatalog, "OPPORTUNITY_EVIDENCE_BLOCKED")] : [])]);
  const roles = sortedUnique([...request.data.roles.map((pin) => pin.role), ...data.sources.map((source) => source.role)]);
  const envelope = {
    contract: "jenan.opportunity-gap.result/v1" as const, runId: context.runId, evaluatedAt: context.evaluatedAt,
    engine: { key: "opportunity-gap" as const, version: OPPORTUNITY_CALCULATION_VERSION, contracts: { request: request.contract, result: "jenan.opportunity-gap.result/v1" }, environment: context.environment, policies: [opportunityConfidencePolicy] },
    request: { normalized: request, evaluatedAt: context.evaluatedAt }, inputs: evidence.inputs, evidence, calculationEvidence: data,
    results: [{ key: "opportunity-gap", metrics }], findings,
    dataAvailability: roles.map((role) => {
      const inputIds = sortedUnique(evidence.inputs.filter((input) => input.roles.includes(role) && request.data.roles.some((pin) => pin.role === role && pin.versionId === input.ref.id)).map((input) => input.id));
      const diagnostics = data.sources.filter((source) => source.phase === "CURRENT" && source.role === role);
      return { role, status: diagnostics.some((source) => source.status === "NO_COVERAGE") ? "NO_COVERAGE" as const : inputIds.length ? "AVAILABLE" as const : "NOT_AVAILABLE" as const, inputIds };
    }),
    gaps, attribution: deriveAttribution(evidence.inputs), rights, status: deriveRunStatus(metrics, gaps),
    limits: { costUnits, budgetUnits: 20_000 as const }, timing: context.timing, realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
  };
  const result = { ...envelope, determinism: computeDeterminism(envelope) };
  ensureOpportunitySize(result);
  return opportunityCalculationResultSchema.parse(result);
}

/** Trusted server evidence only; arbitrary client evidence is not an authorization capability. */
export function buildOpportunityCalculationResult(request: unknown, evidence: unknown, context: Context): OpportunityCalculationResult {
  const result = assemble(request, evidence, context);
  const problems = findEnvelopeViolations(result, { catalog: opportunityCalculationGapCatalog });
  if (problems.length) throw new Error(`Invalid Opportunity M3 envelope: ${problems.map((problem) => `${problem.code}: ${problem.detail}`).join("; ")}`);
  return result;
}
export function findOpportunityCalculationProblems(raw: unknown): string[] {
  ensureOpportunitySize(raw);
  const parsed = opportunityCalculationResultSchema.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  const result = parsed.data;
  let expected: OpportunityCalculationResult;
  try {
    expected = buildOpportunityCalculationResult(result.request.normalized, result.calculationEvidence, {
      runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
    });
  } catch (error) {
    if (!(error instanceof OpportunityCalculationInputError || error instanceof z.ZodError || error instanceof RangeError)) throw error;
    return [error.message];
  }
  return same(result, expected) ? [] : ["M3 calculations, evidence, confidence, rights and hashes must be exactly reproducible"];
}
export async function analyzeOpportunityData(port: OpportunityDataPort, request: unknown, context: Context) {
  opportunityCalculationContextSchema.parse(context);
  const prepared = await prepareOpportunityData(port, request, context.evaluatedAt);
  return buildOpportunityCalculationResult(prepared.request.normalized, {
    current: prepared.current, historical: prepared.historical,
    retainedInputs: [...new Map(prepared.sources.filter((source) => source.input).map((source) => [source.input!.id, source.input!])).values()],
    sources: prepared.sources.map(({ phase, role, requestedVersionId, status, reason, dataset }) => {
      const scope = phase === "CURRENT" ? prepared.request.normalized.scope : prepared.request.normalized.historical?.scope;
      const incompatible = dataset !== null && !same(dataset.scope, scope);
      return { phase, role, requestedVersionId, status: incompatible ? "NOT_COMPUTABLE" as const : status, reason: incompatible ? "GEOGRAPHY_SECTOR_OR_PERIOD_MISMATCH" : reason };
    }),
  }, context);
}
