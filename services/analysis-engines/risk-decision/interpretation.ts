import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys } from "../shared/canonical";
import { deriveAttribution, deriveRights, engineInputSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { riskClaimSchema } from "./contracts";
import { riskInterpretationPolicySchema, type RiskInterpretationPolicy } from "./interpretation-policy";
import { classifyRiskConditionStates, riskConditionOutcomeSchema, type riskRuleSchema, type riskOperandSchema } from "./policy";
import { normalizeRiskRequest, riskBounds, type RiskRequest } from "./request";
import {
  checkRiskComparability, compareRiskDecimals, riskDecimalSchema, riskEvidenceSchema,
  riskFindingSchema, type riskDecisions,
} from "./semantics";
import { ensureRiskJsonSize, riskRunPinSchema } from "./snapshots";

const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const unique = <T>(entries: T[]): T[] => [...new Map(entries.map((entry) => [canonicalize(entry), entry])).values()]
  .sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
export const riskPreparationSchema = z.object({
  contract: z.literal("jenan.risk-decision.preparation/v1"), phase: z.literal("M2_EXACT_READS"),
  status: z.enum(["AVAILABLE", "PARTIAL", "UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"]),
  decision: z.null(), findings: z.array(z.never()), conditionOutcomes: z.array(z.never()), automaticAction: z.literal(false),
  outcomes: z.array(z.object({
    runId: identifierSchema, status: z.enum(["AVAILABLE", "UNAVAILABLE", "TAMPERED", "INCOMPATIBLE", "NOT_SUPPORTED"]),
    evidence: z.object({
      pin: riskRunPinSchema, selections: z.array(z.object({
        id: identifierSchema, pointer: z.string(), native: z.unknown(), method: z.unknown(),
      }).strict()).max(1000), lineage: z.array(engineInputSchema).max(128),
    }).strict().nullable(),
  }).strict()).max(24),
  declaredMissing: z.array(z.string()).max(6), realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
  limitations: z.array(z.string()).max(20),
  determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
}).strict();
export type RiskPreparation = z.infer<typeof riskPreparationSchema>;
type Claim = z.infer<typeof riskClaimSchema>;
type Evidence = z.infer<typeof riskEvidenceSchema>;
type Rule = z.infer<typeof riskRuleSchema>;
type Finding = z.infer<typeof riskFindingSchema>;
type Condition = z.infer<typeof riskConditionOutcomeSchema>;
export const RISK_INTERPRETATION_VERSION = "1.0.0-m3";
type RuleResult = {
  state: "TRUE" | "FALSE" | "UNKNOWN" | "NOT_SUPPORTED";
  claimIds: string[]; evidence: Evidence[]; reasons: string[];
};
const nativeInterpretations: Record<string, Claim["interpretation"]> = {
  OBSERVED: "OBSERVED", OBSERVED_RATIO: "OBSERVED", OBSERVED_COUNT: "OBSERVED",
  ASSUMPTION_BASED_PROJECTION: "DECLARED_ASSUMPTION", PLAN_DERIVED: "DECLARED_ASSUMPTION",
  ESTIMATED: "DECLARED_ASSUMPTION", UPSTREAM_DERIVED: "UPSTREAM_DERIVED",
  MAPPED_FEATURES_ONLY: "UPSTREAM_DERIVED", EVIDENCE_GAPS: "UNAVAILABLE", UNAVAILABLE: "UNAVAILABLE",
  SOURCE_OBSERVATION: "OBSERVED", MEASURED_GEOMETRY: "UPSTREAM_DERIVED",
  DERIVED_QUANTITY: "UPSTREAM_DERIVED", ESTIMATE: "DECLARED_ASSUMPTION",
};
function project(request: RiskRequest, preparation: RiskPreparation, policy: RiskInterpretationPolicy) {
  const claims = new Map<string, Claim>(); const reasons = new Map<string, string>();
  const nativeComponents: Array<{ claimId: string; confidence: unknown; interpretation: unknown; reasons: unknown; assumptions: unknown;
    value: unknown; exactValue: unknown; unit: unknown; method: unknown; basis: unknown; limitations: unknown }> = [];
  for (const selector of request.claims) {
    const outcome = preparation.outcomes.find((entry) => entry.runId === selector.runId);
    if (outcome?.status !== "AVAILABLE" || !outcome.evidence) {
      reasons.set(selector.id, outcome?.status === "NOT_SUPPORTED" ? "NOT_SUPPORTED" : "EVIDENCE_UNAVAILABLE"); continue;
    }
    const selection = outcome.evidence.selections.find((entry) => entry.id === selector.id && entry.pointer === selector.pointer);
    const projection = policy.projections.find((entry) => entry.claimId === selector.id);
    if (!selection || !projection) { reasons.set(selector.id, "PROJECTION_NOT_SUPPORTED"); continue; }
    const native = z.record(z.string(), z.unknown()).parse(selection.native);
    nativeComponents.push({ claimId: selector.id, confidence: native.confidence ?? null, interpretation: native.interpretation ?? null,
      reasons: native.reasons ?? null, assumptions: native.assumptionIds ?? null, value: native.value ?? null,
      exactValue: native.exactValue ?? null, unit: native.unit ?? null, method: native.method ?? null, basis: native.basis ?? null,
      limitations: native.limitations ?? null });
    const status = riskClaimSchema.shape.nativeStatus.safeParse(native.status);
    const interpretation = typeof native.interpretation === "string" ? nativeInterpretations[native.interpretation] : undefined;
    if (!status.success || !interpretation) { reasons.set(selector.id, "PROJECTION_NOT_SUPPORTED"); continue; }
    // JSON numbers and rounded-only decimals are never promoted to exact threshold evidence.
    const raw = native[projection.value];
    let value: Claim["value"] = null;
    if (raw !== null && raw !== undefined && interpretation !== "UNAVAILABLE") {
      if (projection.kind === "DECIMAL" && typeof raw === "string" && riskDecimalSchema.safeParse(raw).success) {
        value = { kind: "DECIMAL", value: raw, precision: projection.value === "exactValue" ? "NATIVE_EXACT" : "REPORTED_ONLY" };
      } else if (projection.kind === "DECIMAL" && typeof raw === "number" && riskDecimalSchema.safeParse(String(raw)).success) {
        value = { kind: "DECIMAL", value: String(raw), precision: "REPORTED_ONLY" };
      } else if (projection.kind === "TEXT" && typeof raw === "string" && identifierSchema.safeParse(raw).success) value = { kind: "TEXT", value: raw };
      else if (projection.kind === "BOOLEAN" && typeof raw === "boolean") value = { kind: "BOOLEAN", value: raw };
    }
    const valued = ["COMPUTED", "PARTIAL", "ESTIMATED"].includes(status.data);
    if (valued && value === null) { reasons.set(selector.id, interpretation === "UNAVAILABLE" ? "EVIDENCE_QUALITY_ONLY" : "EXACT_VALUE_NOT_AVAILABLE"); continue; }
    const limitations = z.array(z.string().min(1).max(500)).max(19).safeParse(native.limitations);
    if (!limitations.success) { reasons.set(selector.id, "NATIVE_LIMITATIONS_NOT_SUPPORTED"); continue; }
    const nativeEvidence = z.array(z.looseObject({ inputId: z.string() })).safeParse(native.evidence);
    const inputRefs = z.array(z.string()).safeParse(native.inputRefs);
    const citedIds = new Set([...(nativeEvidence.success ? nativeEvidence.data.map((entry) => entry.inputId) : []),
      ...(inputRefs.success ? inputRefs.data : [])]);
    const refs = outcome.evidence.lineage.filter((input) => citedIds.has(input.id)).flatMap((input): Evidence[] => input.checksum
      ? [{ inputId: input.id, refId: input.ref.id, checksum: input.checksum.value,
        recordId: `selection:${canonicalHash([selector.runId, selector.pointer])}` }] : []);
    const parsed = riskClaimSchema.safeParse({
      ...selector, nativeStatus: status.data, interpretation: valued ? interpretation : "UNAVAILABLE",
      value, evidence: refs, confidence: null,
      limitations: ["Native selection preserved without recalculation or precision conversion.",
        ...limitations.data],
    });
    if (!parsed.success) { reasons.set(selector.id, "PROJECTION_NOT_SUPPORTED"); continue; }
    claims.set(selector.id, parsed.data);
  }
  return { claims, reasons, nativeComponents };
}
function compareValue(left: NonNullable<Claim["value"]>, right: z.infer<typeof riskOperandSchema>): number | null {
  if (left.kind !== right.kind) return null;
  if (left.kind === "DECIMAL" && right.kind === "DECIMAL") return left.precision === "NATIVE_EXACT" ? compareRiskDecimals(left.value, right.value) : null;
  if (left.kind === "TEXT" && right.kind === "TEXT") return compareText(left.value, right.value);
  if (left.kind === "BOOLEAN" && right.kind === "BOOLEAN") return left.value === right.value ? 0 : left.value ? 1 : -1;
  return null;
}
function testRule(rule: Rule, claims: Map<string, Claim>, absent: Map<string, string>, resolve: (id: string) => RuleResult,
  allowEstimated: (claim: Claim) => boolean): RuleResult {
  if ("ruleIds" in rule) {
    const children = rule.ruleIds.map(resolve); const states = children.map((child) => child.state);
    const decisive = rule.operator === "ALL" ? "FALSE" : "TRUE";
    // Unsupported methods remain unsupported rather than being hidden by short circuit.
    const state = states.includes("NOT_SUPPORTED") ? "NOT_SUPPORTED" : states.includes(decisive) ? decisive
      : states.includes("UNKNOWN") ? "UNKNOWN" : rule.operator === "ALL" ? "TRUE" : "FALSE";
    return { state, claimIds: unique(children.flatMap((child) => child.claimIds)), evidence: unique(children.flatMap((child) => child.evidence)),
      reasons: unique(children.flatMap((child) => child.reasons)) };
  }
  const claim = claims.get(rule.claimId);
  const result = (state: RuleResult["state"], reason: string): RuleResult => ({
    state, claimIds: [rule.claimId], evidence: claim?.evidence ?? [], reasons: [reason],
  });
  if (!claim) return result(["NOT_SUPPORTED", "PROJECTION_NOT_SUPPORTED", "NATIVE_LIMITATIONS_NOT_SUPPORTED"].includes(absent.get(rule.claimId) ?? "") ? "NOT_SUPPORTED" : "UNKNOWN",
    absent.get(rule.claimId) ?? "EVIDENCE_UNAVAILABLE");
  if (rule.operator === "STATE") return result(claim.nativeStatus === rule.expected ? "TRUE" : "FALSE", "EXPLICIT_NATIVE_STATE");
  if (rule.operator === "PRESENT") return result(claim.value !== null ? "TRUE" : "UNKNOWN", claim.value !== null ? "NATIVE_VALUE_PRESENT" : "MISSING_IS_NOT_ZERO");
  if (claim.nativeStatus === "NOT_SUPPORTED") return result("NOT_SUPPORTED", "NATIVE_METHOD_NOT_SUPPORTED");
  if (claim.value === null || claim.nativeStatus !== "COMPUTED" && !(claim.nativeStatus === "ESTIMATED" && allowEstimated(claim))) return result("UNKNOWN", "NON_DEFINITE_NATIVE_EVIDENCE");
  const operands = "operands" in rule ? rule.operands : [rule.operand];
  const comparisons = operands.map((operand) => operand.kind === "DECIMAL" && !same(operand.basis, claim.basis) ? null : compareValue(claim.value!, operand));
  if (comparisons.some((value) => value === null)) return result("UNKNOWN", "BASIS_OR_PRECISION_NOT_COMPARABLE");
  const comparison = comparisons[0]!;
  const truth = rule.operator === "IN" ? comparisons.some((value) => value === 0) : rule.operator === "EQ" ? comparison === 0
    : rule.operator === "NE" ? comparison !== 0 : rule.operator === "GT" ? comparison > 0 : rule.operator === "GTE" ? comparison >= 0
      : rule.operator === "LT" ? comparison < 0 : comparison <= 0;
  return result(truth ? "TRUE" : "FALSE", "EXACT_APPROVED_RULE_COMPARISON");
}

/** Pure interpretation of already authorized preparation. Server callers must use the governed adapter, not caller-supplied snapshots. */
export function interpretRiskPreparation(rawRequest: unknown, rawPreparation: unknown, rawPolicy: unknown, evaluatedAt: string) {
  const normalized = normalizeRiskRequest(rawRequest, evaluatedAt); const request = normalized.normalized;
  ensureRiskJsonSize(rawPreparation); ensureRiskJsonSize(rawPolicy);
  const preparation = riskPreparationSchema.parse(rawPreparation); const policy = riskInterpretationPolicySchema.parse(rawPolicy);
  if (preparation.determinism.requestHash !== normalized.requestHash ||
    preparation.determinism.inputsHash !== canonicalHash(preparation.outcomes) ||
    preparation.determinism.outputHash !== canonicalHash(omitKeys(preparation, ["determinism"]))) throw new RangeError("Risk preparation hash/request mismatch");
  const pins = request.engineSlots.flatMap((slot) => slot.state === "PINNED" ? slot.runs : []);
  if (new Set(preparation.outcomes.map((entry) => entry.runId)).size !== preparation.outcomes.length ||
    preparation.outcomes.some((entry) => !pins.some((pin) => pin.runId === entry.runId) ||
      (entry.status === "AVAILABLE") !== (entry.evidence !== null) ||
      entry.evidence && !pins.some((pin) => same(pin, entry.evidence!.pin)))) throw new RangeError("Invalid exact preparation evidence set");
  const conditionIds = new Set(request.policy.conditions.map((entry) => entry.id));
  const claimIds = new Set(request.claims.map((entry) => entry.id));
  const governedContext = normalizeRiskRequest({ ...request, engineSlots: policy.engineSlots, scenarios: policy.declaredScenarios }, evaluatedAt).normalized;
  if (!same(governedContext.engineSlots, request.engineSlots) || !same(governedContext.scenarios, request.scenarios)) {
    throw new RangeError("Engine applicability and scenario declarations must match the exact governed interpretation policy");
  }
  if (policy.projections.some((entry) => !claimIds.has(entry.claimId)) ||
    policy.findings.some((entry) => !conditionIds.has(entry.conditionId)) ||
    policy.conflicts.some((entry) => !claimIds.has(entry.leftClaimId) || !claimIds.has(entry.rightClaimId) || entry.conditionIds.some((id) => !conditionIds.has(id))) ||
    policy.scenarios.length !== request.scenarios.length ||
    policy.scenarios.some((entry) => !request.scenarios.some((scenario) => scenario.id === entry.scenarioId) ||
      entry.claims.some((mapping) => !claimIds.has(mapping.baseClaimId) || !claimIds.has(mapping.claimId)))) throw new RangeError("Unresolved approved interpretation references");
  const work = normalized.workUnits + (1 + request.scenarios.length) *
    (policy.conflicts.length * 2 + policy.findings.length + policy.projections.length + request.policy.dependencyEdges.length) +
    policy.scenarios.reduce((total, scenario) => total + scenario.claims.length, 0);
  if (work > riskBounds.workUnits) throw new RangeError("Risk M3 work exceeds 20000 units");
  const projected = project(request, preparation, policy);
  const sameNativeCoordinates = (left: string, right: string) => {
    const a = projected.nativeComponents.find((entry) => entry.claimId === left);
    const b = projected.nativeComponents.find((entry) => entry.claimId === right);
    return !!a && !!b && same(a.unit, b.unit) && same(a.method, b.method) && same(a.basis, b.basis);
  };
  const policyEvidence: Evidence[] = [{ inputId: request.policySource.inputId, refId: request.policySource.versionId,
    checksum: request.policySource.checksum, recordId: policy.method.id }];
  const sourceEvidence = unique([...policyEvidence, ...[...projected.claims.values()].flatMap((claim) => claim.evidence)]);
  const evidenceResolves = (refs: Evidence[]) => refs.every((ref) => sourceEvidence.some((source) =>
    ref.inputId === source.inputId && ref.refId === source.refId && ref.checksum === source.checksum));
  const failedAuthorization = ["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"].includes(preparation.status) ||
    preparation.outcomes.some((entry) => ["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"].includes(entry.status));
  for (const slot of request.engineSlots) if (slot.state === "NOT_APPLICABLE" && !evidenceResolves(slot.approval.evidence)) {
    throw new RangeError("Engine non-applicability needs retained approval evidence");
  }
  for (const scenario of request.scenarios) if (!evidenceResolves(scenario.approval.evidence)) {
    throw new RangeError("Scenario approval needs retained evidence");
  }

  const evaluate = (scenarioId: string | null) => {
    const claims = new Map(projected.claims); const absent = new Map(projected.reasons);
    const scenario = request.scenarios.find((entry) => entry.id === scenarioId);
    const mapping = policy.scenarios.find((entry) => entry.scenarioId === scenarioId);
    if (scenario) {
      for (const original of request.claims) {
        const binding = mapping?.claims.find((entry) => entry.baseClaimId === original.id);
        const replacement = binding ? projected.claims.get(binding.claimId) : undefined;
        const pin = replacement && pins.find((entry) => entry.runId === replacement.runId);
        const declared = scenario.mappings.find((entry) => entry.engineKey === pin?.engineKey);
        const invariant = binding?.claimId === binding?.baseClaimId && binding?.invariantRationale !== null;
        const compatible = replacement && same(omitKeys(replacement.scope, ["scenarioId"]), omitKeys(original.scope, ["scenarioId"])) &&
          same(replacement.basis, original.basis) && sameNativeCoordinates(replacement.id, original.id) &&
          replacement.entityId === original.entityId && replacement.nativeKey === original.nativeKey;
        if (!replacement || !compatible || !declared || declared.runId !== replacement.runId || declared.variant !== replacement.variant ||
          (!invariant && replacement.scope.scenarioId !== scenario.id)) {
          claims.delete(original.id); absent.set(original.id, "SCENARIO_EVIDENCE_NOT_MAPPED");
        } else claims.set(original.id, replacement);
      }
    }
    const conflicts = policy.conflicts.map((definition) => {
      const left = claims.get(definition.leftClaimId); const right = claims.get(definition.rightClaimId);
      const lp = pins.find((pin) => pin.runId === left?.runId); const rp = pins.find((pin) => pin.runId === right?.runId);
      const compatible = left && right && lp?.engineKey !== rp?.engineKey && left.entityId === right.entityId &&
        sameNativeCoordinates(left.id, right.id) &&
        checkRiskComparability({ scope: left.scope, basis: left.basis }, { scope: right.scope, basis: right.basis }).state === "COMPATIBLE";
      let state: "CONFLICT" | "CONSISTENT" | "NOT_COMPARABLE" = "NOT_COMPARABLE";
      if (compatible && left.value && right.value && left.nativeStatus === "COMPUTED" && right.nativeStatus === "COMPUTED" &&
        left.interpretation === right.interpretation) {
        const operand = right.value.kind === "DECIMAL" ? { ...right.value, basis: right.basis } : right.value;
        const comparison = right.value.kind === "DECIMAL" && right.value.precision !== "NATIVE_EXACT" ? null : compareValue(left.value, operand);
        if (comparison !== null) state = comparison === 0 ? "CONSISTENT" : "CONFLICT";
      }
      return { ...definition, state, evidence: unique([...(left?.evidence ?? []), ...(right?.evidence ?? [])]),
        reason: state === "NOT_COMPARABLE" ? "Scope, entity, method, state or exact precision is not comparable." : "Approved same-measure equality comparison; no upstream recalculation." };
    });
    const ruleResults = new Map<string, RuleResult>();
    const resolve = (id: string): RuleResult => {
      const cached = ruleResults.get(id); if (cached) return cached;
      const rule = request.policy.rules.find((entry) => entry.id === id);
      if (!rule) throw new RangeError("Unresolved Risk rule");
      const result = testRule(rule, claims, absent, resolve, (claim) =>
        policy.projections.some((projection) => projection.claimId === claim.id && projection.estimated === "ALLOW_CONDITIONAL"));
      ruleResults.set(id, result); return result;
    };
    const outcomes = request.policy.conditions.map((condition): Condition => {
      if (condition.applicability.state === "NOT_APPLICABLE") {
        if (!evidenceResolves(condition.applicability.approval.evidence)) throw new RangeError("Non-applicability approval evidence is not retained");
        return riskConditionOutcomeSchema.parse({ conditionId: condition.id, state: "NOT_APPLICABLE", evidenceState: "COMPLETE",
          evidence: condition.applicability.approval.evidence, conflicts: [], limitations: ["Owner-approved non-applicability only."], rationale: condition.rationale });
      }
      const rule = resolve(condition.ruleId); const attached = conflicts.filter((entry) => entry.conditionIds.includes(condition.id) && entry.state !== "CONSISTENT");
      const state = rule.state === "NOT_SUPPORTED" ? "NOT_SUPPORTED" : attached.length || rule.state === "UNKNOWN" ? "UNKNOWN"
        : rule.state === "TRUE" ? "SATISFIED" : "NOT_SATISFIED";
      return riskConditionOutcomeSchema.parse({
        conditionId: condition.id, state,
        evidenceState: state === "NOT_SUPPORTED" ? "NOT_SUPPORTED" : attached.length ? "NOT_COMPARABLE" : state === "UNKNOWN" ? "MISSING" : "COMPLETE",
        evidence: rule.evidence, conflicts: attached.filter((entry) => entry.state === "CONFLICT").map((entry) => entry.id),
        limitations: unique([...rule.reasons, ...(attached.length ? ["UNRESOLVED_COMPARABILITY_OR_CONFLICT"] : [])]),
        rationale: condition.rationale,
      });
    });
    // An explicit prerequisite can only remove assurance, never invent a downstream adverse event.
    const settled = new Set<string>();
    const dependencyGaps: Array<{ from: string; to: string; meaning: string; evidence: Evidence[] }> = [];
    const applyDependency = (id: string) => {
      if (settled.has(id)) return;
      for (const edge of request.policy.dependencyEdges.filter((entry) => entry.to === id)) {
        applyDependency(edge.from);
        if (!evidenceResolves(edge.evidence)) throw new RangeError("Dependency evidence is not retained");
        const prerequisite = outcomes.find((entry) => entry.conditionId === edge.from)!;
        const dependent = outcomes.find((entry) => entry.conditionId === id)!;
        if (prerequisite.state !== "SATISFIED" && prerequisite.state !== "NOT_APPLICABLE" && dependent.state !== "NOT_APPLICABLE") {
          dependencyGaps.push(edge);
          // A separately established failure remains visible and is not erased by an unknown dependency.
          if (dependent.state === "SATISFIED") Object.assign(dependent, { state: "UNKNOWN", evidenceState: "PARTIAL",
            limitations: unique([...dependent.limitations, "UNRESOLVED_DECLARED_PREREQUISITE"]) });
        }
      }
      settled.add(id);
    };
    for (const condition of request.policy.conditions) applyDependency(condition.id);
    const findings: Finding[] = [];
    for (const template of policy.findings) {
      const outcome = outcomes.find((entry) => entry.conditionId === template.conditionId)!;
      if (outcome.state === "SATISFIED" || outcome.state === "NOT_APPLICABLE") continue;
      const condition = request.policy.conditions.find((entry) => entry.id === template.conditionId)!;
      const rule = resolve(condition.ruleId); const used = rule.claimIds.flatMap((id) => claims.has(id) ? [claims.get(id)!] : []);
      const risk = outcome.state === "NOT_SATISFIED" && used.length > 0 &&
        used.every((claim) => claim.value !== null && claim.interpretation !== "UNAVAILABLE");
      const definite = risk && used.every((claim) => claim.interpretation === "OBSERVED");
      const confidenceLimited = used.some((claim) => claim.nativeStatus === "PARTIAL" || claim.nativeStatus === "ESTIMATED") ||
        rule.reasons.includes("EVIDENCE_QUALITY_ONLY");
      const kind = risk ? definite ? "EVIDENCED_EXPOSURE" : "CONDITIONAL_RISK" : confidenceLimited ? "DATA_QUALITY_LIMITATION" : "EVIDENCE_GAP";
      const impact = risk ? template.impact : null; const likelihood = risk ? template.likelihood : null;
      for (const assessment of [impact, likelihood]) if (assessment &&
        (assessment.approval.approvedAt > evaluatedAt || !evidenceResolves(assessment.approval.evidence))) throw new RangeError("Assessment needs exact retained approved evidence");
      const cell = impact && likelihood ? request.policy.severityMatrix?.cells.find((entry) => entry.impact === impact.band && entry.likelihood === likelihood.band) : undefined;
      findings.push(riskFindingSchema.parse({
        id: template.id, category: template.category, kind, state: risk ? definite ? "SUPPORTED" : "CONDITIONAL" : outcome.state === "NOT_SUPPORTED" ? "NOT_SUPPORTED" : "UNKNOWN",
        scope: scenario ? { ...request.scope, scenarioId: scenario.id } : request.scope, claimIds: rule.claimIds, evidence: outcome.evidence,
        counterevidence: [], assumptions: risk && !definite ? used.filter((claim) => claim.interpretation !== "OBSERVED").map((claim) => claim.id) : [],
        rule: policy.method, impact, likelihood, severity: cell?.severity ?? null,
        severityState: cell ? "ASSESSED" : "NOT_ASSESSABLE", severityPolicy: cell ? request.policy.severityMatrix!.method : null,
        confidence: null, rationale: template.rationale, reasons: rule.reasons,
        limitations: unique(["Evidence quality is not likelihood or project success probability.", ...outcome.limitations]),
      }));
    }
    for (const conflict of conflicts.filter((entry) => entry.state === "CONFLICT")) findings.push(riskFindingSchema.parse({
      id: `conflict:${conflict.id}`, category: "CROSS_ENGINE", kind: "CROSS_ENGINE_CONFLICT", state: "SUPPORTED",
      scope: scenario ? { ...request.scope, scenarioId: scenario.id } : request.scope, claimIds: [conflict.leftClaimId, conflict.rightClaimId],
      evidence: conflict.evidence, counterevidence: conflict.evidence, assumptions: [], rule: policy.method,
      impact: null, likelihood: null, severity: null, severityState: "NOT_ASSESSABLE", severityPolicy: null, confidence: null,
      rationale: conflict.rationale, reasons: ["COMPARABLE_NATIVE_ASSERTIONS_CONFLICT"], limitations: ["Neither upstream claim is silently selected as the winner."],
    }));
    for (const edge of dependencyGaps) findings.push(riskFindingSchema.parse({
      id: `dependency:${edge.from}:${edge.to}`, category: "OPPORTUNITY_DEPENDENCY", kind: "DEPENDENCY_GAP", state: "UNKNOWN",
      scope: scenario ? { ...request.scope, scenarioId: scenario.id } : request.scope, claimIds: [], evidence: edge.evidence, counterevidence: [],
      assumptions: [], rule: policy.method, impact: null, likelihood: null, severity: null, severityState: "NOT_ASSESSABLE",
      severityPolicy: null, confidence: null, rationale: edge.meaning, reasons: ["UNRESOLVED_DECLARED_PREREQUISITE"],
      limitations: ["No downstream adverse event or causal probability is inferred."],
    }));
    if (findings.length > riskBounds.findings) throw new RangeError("Risk finding bound exceeded");
    const coverage = request.engineSlots.map((slot) => {
      if (slot.state !== "PINNED") return { engineKey: slot.engineKey, state: slot.state };
      const scoped = slot.runs.filter((pin) => scenario
      ? scenario.mappings.some((entry) => entry.engineKey === slot.engineKey && entry.runId === pin.runId)
      : request.claims.some((claim) => claim.runId === pin.runId && claim.scope.scenarioId === request.scope.scenarioId));
      const relevant = scoped.length ? scoped : slot.runs;
      return { engineKey: slot.engineKey,
      state: relevant.some((pin) => preparation.outcomes.find((entry) => entry.runId === pin.runId)?.status === "NOT_SUPPORTED") ? "NOT_SUPPORTED"
        : relevant.every((pin) => preparation.outcomes.find((entry) => entry.runId === pin.runId)?.status === "AVAILABLE" &&
          [...claims.values()].some((claim) => claim.runId === pin.runId && claim.value !== null)) ? "AVAILABLE" : "MISSING" };
    });
    let decision: typeof riskDecisions[number] | null = failedAuthorization ? null : classifyRiskConditionStates(request.policy, outcomes);
    if (decision !== null && coverage.some((entry) => entry.state === "NOT_SUPPORTED")) decision = "NOT_SUPPORTED";
    else if (decision === "PROCEED_UNDER_DECLARED_CONDITIONS" && coverage.some((entry) => entry.state === "MISSING")) decision = "DEFER_PENDING_EVIDENCE";
    const actions = request.policy.actions.filter((action) => action.conditionIds.some((id) =>
      !["SATISFIED", "NOT_APPLICABLE"].includes(outcomes.find((entry) => entry.conditionId === id)!.state)))
      .map((action) => ({ ...action, status: "PLANNED" as const, evidence: unique([...policyEvidence,
        ...outcomes.filter((entry) => action.conditionIds.includes(entry.conditionId)).flatMap((entry) => entry.evidence)]),
        effectOnCurrentDecision: "NONE_NEW_VERIFIED_EVIDENCE_REQUIRED" as const }));
    return { scenarioId, decision, coverage, conditionOutcomes: outcomes, findings, conflicts, actions,
      rules: [...ruleResults].sort(([a], [b]) => compareText(a, b)).map(([id, result]) => ({ id, ...result, definition: request.policy.rules.find((rule) => rule.id === id)! })),
      explanation: { policy: request.policy, interpretationMethod: policy.method,
        reasons: failedAuthorization ? ["AUTHORIZATION_INTEGRITY_OR_COMPATIBILITY_REJECTED_NO_DECISION"] : [decision!],
        requiredConditions: request.policy.conditions.filter((condition) => condition.required).map((condition) => condition.id),
        unresolved: outcomes.filter((entry) => !["SATISFIED", "NOT_APPLICABLE"].includes(entry.state)).map((entry) => entry.conditionId),
        changeRequirements: actions.map((action) => ({ actionId: action.id, ownerRole: action.ownerRole, verification: action.verification })),
        limitations: ["Conditional interpretation only; human review required. No automatic launch or capital-allocation action.",
          "No success probability, final score, inferred severity, upstream recalculation or new scenario.",
          "Missing evidence is not confirmed risk. Native confidence measures evidence quality only."] } };
  };
  const base = evaluate(null);
  const scenarios = request.scenarios.map((scenario) => evaluate(scenario.id));
  if ([base, ...scenarios].reduce((sum, entry) => sum + entry.findings.length, 0) > riskBounds.findings) throw new RangeError("Aggregate Risk finding bound exceeded");
  const lineage = unique(preparation.outcomes.flatMap((outcome) => outcome.evidence?.lineage ?? []));
  const core = {
    contract: "jenan.risk-decision.result/v1", phase: "M3_INTERPRETATION",
    engine: { key: "risk-decision", version: RISK_INTERPRETATION_VERSION },
    evaluatedAt, request: normalized, policy, ...base, scenarios,
    claims: [...projected.claims.values()].sort((a, b) => compareText(a.id, b.id)),
    projectionGaps: [...projected.reasons].sort(([a], [b]) => compareText(a, b)).map(([claimId, reason]) => ({ claimId, reason })),
    nativeComponents: projected.nativeComponents, confidenceInterpretation: "NATIVE_EVIDENCE_QUALITY_ONLY_NO_COMMON_BAND_OR_PROBABILITY",
    pins, policySource: request.policySource, lineage,
    rights: { allowExport: false, upstream: deriveRights(lineage), reason: "NO_SUPPORTED_RISK_EXPORT_M3_POLICY_RIGHTS_NOT_PROMOTED" },
    attribution: deriveAttribution(lineage),
    humanReview: "REQUIRED", automaticAction: false, realDataAcceptance: "BLOCKED / NOT VERIFIED",
    status: failedAuthorization ? "REJECTED" : "COMPLETED_WITH_GAPS",
    limitations: preparation.limitations, limits: { costUnits: work, budgetUnits: riskBounds.workUnits },
  };
  const result = { ...core, determinism: { requestHash: normalized.requestHash, inputsHash: canonicalHash(preparation),
    outputHash: canonicalHash(core) } };
  ensureRiskJsonSize(result);
  return result;
}
