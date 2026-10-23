import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import {
  riskApprovalSchema, riskBasisSchema, riskConditionStates, riskDecimalSchema, riskEvidenceSchema,
  riskConfidenceBands, riskFindingSchema, riskMethodSchema, riskPeriodSchema, type riskDecisions,
} from "./semantics";

export const riskOperandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DECIMAL"), value: riskDecimalSchema, basis: riskBasisSchema }).strict(),
  z.object({ kind: z.literal("TEXT"), value: identifierSchema }).strict(),
  z.object({ kind: z.literal("BOOLEAN"), value: z.boolean() }).strict(),
]);
const claimRule = { id: identifierSchema, claimId: identifierSchema, rationale: shortTextSchema };
export const riskRuleSchema = z.discriminatedUnion("operator", [
  z.object({ ...claimRule, operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE"]), operand: riskOperandSchema }).strict(),
  z.object({ ...claimRule, operator: z.literal("IN"), operands: z.array(riskOperandSchema).min(1).max(32) }).strict(),
  z.object({ ...claimRule, operator: z.literal("PRESENT") }).strict(),
  z.object({ ...claimRule, operator: z.literal("STATE"), expected: z.enum(["COMPUTED", "PARTIAL", "ESTIMATED", "NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_SUPPORTED", "NO_COVERAGE", "NOT_FOUND_WITHIN_RADIUS"]) }).strict(),
  z.object({ id: identifierSchema, operator: z.enum(["ALL", "ANY"]), ruleIds: z.array(identifierSchema).min(1).max(200), rationale: shortTextSchema }).strict(),
]).superRefine((v, ctx) => {
  if (["GT", "GTE", "LT", "LTE"].includes(v.operator) && "operand" in v && v.operand.kind !== "DECIMAL") ctx.addIssue({ code: "custom", message: "Ordered comparisons require dimensioned decimals" });
  if ("operands" in v && new Set(v.operands.map(canonicalize)).size !== v.operands.length) ctx.addIssue({ code: "custom", message: "Membership operands must be unique" });
});
export const riskConditionSchema = z.object({
  id: identifierSchema, ruleId: identifierSchema, required: z.boolean(), failureDisposition: z.enum(["BLOCK", "REVISE"]),
  applicability: z.discriminatedUnion("state", [
    z.object({ state: z.literal("APPLICABLE") }).strict(),
    z.object({ state: z.literal("NOT_APPLICABLE"), approval: riskApprovalSchema }).strict(),
  ]),
  rationale: shortTextSchema,
}).strict();
const severityMatrixSchema = z.object({
  method: riskMethodSchema, approval: riskApprovalSchema,
  impactBands: z.array(identifierSchema).min(1).max(8), likelihoodBands: z.array(identifierSchema).min(1).max(8),
  rubric: shortTextSchema,
  cells: z.array(z.object({ impact: identifierSchema, likelihood: identifierSchema, severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]) }).strict()).min(1).max(64),
}).strict().superRefine((v, ctx) => {
  const keys = v.cells.map((c) => canonicalize([c.impact, c.likelihood]));
  if (new Set(v.impactBands).size !== v.impactBands.length || new Set(v.likelihoodBands).size !== v.likelihoodBands.length ||
    new Set(keys).size !== keys.length || v.cells.length !== v.impactBands.length * v.likelihoodBands.length ||
    v.cells.some((c) => !v.impactBands.includes(c.impact) || !v.likelihoodBands.includes(c.likelihood))) {
    ctx.addIssue({ code: "custom", message: "Severity lookup must declare every unique supported band pair" });
  }
});
export const riskPolicySchema = z.object({
  contract: z.literal("jenan.risk-decision.policy/v1"), method: riskMethodSchema, approval: riskApprovalSchema,
  validity: riskPeriodSchema, rules: z.array(riskRuleSchema).min(1).max(200),
  conditions: z.array(riskConditionSchema).min(1).max(200),
  severityMatrix: severityMatrixSchema.nullable(),
  confidenceMappings: z.array(z.object({
    native: riskMethodSchema, rationale: shortTextSchema,
    bands: z.array(z.object({ from: identifierSchema, to: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]) }).strict()).min(1).max(16),
  }).strict()).max(16),
  dependencyEdges: z.array(z.object({ from: identifierSchema, to: identifierSchema, meaning: shortTextSchema, evidence: z.array(riskEvidenceSchema).min(1).max(128) }).strict()).max(500),
  actions: z.array(z.object({
    id: identifierSchema, conditionIds: z.array(identifierSchema).min(1).max(200),
    kind: z.enum(["OBTAIN_EVIDENCE", "RESOLVE_CONFLICT", "VERIFY_COMMITMENT", "REVISE_DECLARED_PLAN", "HUMAN_REVIEW"]),
    ownerRole: identifierSchema, verification: shortTextSchema, rationale: shortTextSchema,
  }).strict()).max(500),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const ruleIds = new Set(v.rules.map((r) => r.id)); const conditionIds = new Set(v.conditions.map((c) => c.id));
  if (ruleIds.size !== v.rules.length || conditionIds.size !== v.conditions.length || new Set(v.actions.map((a) => a.id)).size !== v.actions.length) fail("Policy IDs must be unique");
  if (!v.conditions.some((c) => c.required && c.applicability.state === "APPLICABLE")) fail("At least one substantive required applicable condition is mandatory");
  if (v.conditions.some((c) => !ruleIds.has(c.ruleId))) fail("Unresolved condition rule");
  const adjacency = new Map(v.rules.map((r) => [r.id, "ruleIds" in r ? r.ruleIds : []]));
  if (v.rules.some((r) => "ruleIds" in r && (new Set(r.ruleIds).size !== r.ruleIds.length || r.ruleIds.some((id) => !ruleIds.has(id))))) fail("Unresolved or duplicate composite rule");
  if (hasCycle(adjacency)) fail("Cyclic composite rules");
  if (v.dependencyEdges.some((e) => !conditionIds.has(e.from) || !conditionIds.has(e.to))) fail("Unresolved dependency condition");
  if (new Set(v.dependencyEdges.map((e) => canonicalize([e.from, e.to]))).size !== v.dependencyEdges.length) fail("Duplicate dependency edge");
  const edges = new Map(v.conditions.map((c) => [c.id, v.dependencyEdges.filter((e) => e.from === c.id).map((e) => e.to)]));
  if (hasCycle(edges)) fail("Cyclic dependency graph");
  if (v.actions.some((a) => new Set(a.conditionIds).size !== a.conditionIds.length || a.conditionIds.some((id) => !conditionIds.has(id)))) fail("Unresolved or repeated action condition");
  const mappings = v.confidenceMappings.map((m) => canonicalize(m.native));
  if (new Set(mappings).size !== mappings.length || v.confidenceMappings.some((m) => new Set(m.bands.map((b) => b.from)).size !== m.bands.length)) fail("Ambiguous confidence mapping");
  const rank: Record<string, number> = { INSUFFICIENT: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  if (v.confidenceMappings.some((m) => m.bands.some((b) => b.from in rank && rank[b.to]! > rank[b.from]!))) fail("Confidence mapping cannot upgrade a known native evidence band");
});
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
function hasCycle(edges: Map<string, string[]>) {
  const active = new Set<string>(); const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    if ((edges.get(id) ?? []).some(visit)) return true;
    active.delete(id); done.add(id); return false;
  };
  return [...edges.keys()].some(visit);
}
export const riskConditionOutcomeSchema = z.object({
  conditionId: identifierSchema, state: z.enum(riskConditionStates),
  evidenceState: z.enum(["COMPLETE", "PARTIAL", "MISSING", "NOT_COMPARABLE", "NOT_SUPPORTED"]),
  evidence: z.array(riskEvidenceSchema).max(128), conflicts: z.array(identifierSchema).max(500),
  limitations: z.array(shortTextSchema).min(1).max(20), rationale: shortTextSchema,
}).strict().superRefine((v, ctx) => {
  if (["SATISFIED", "NOT_SATISFIED", "NOT_APPLICABLE"].includes(v.state) &&
    (v.evidenceState !== "COMPLETE" || !v.evidence.length || v.conflicts.length)) ctx.addIssue({ code: "custom", message: "Definite conditions need complete evidence and no unresolved conflict" });
});

/** Policy truth-table foundation only; this does not evaluate claims or produce an engine result. */
export function classifyRiskConditionStates(rawPolicy: unknown, rawOutcomes: unknown): typeof riskDecisions[number] {
  const policy = riskPolicySchema.parse(rawPolicy);
  const outcomes = z.array(riskConditionOutcomeSchema).max(200).parse(rawOutcomes);
  if (new Set(outcomes.map((o) => o.conditionId)).size !== outcomes.length ||
    outcomes.length !== policy.conditions.length || outcomes.some((o) => !policy.conditions.some((c) => c.id === o.conditionId))) throw new RangeError("Exactly one outcome per declared condition is required");
  for (const condition of policy.conditions) {
    const outcome = outcomes.find((o) => o.conditionId === condition.id)!;
    if ((condition.applicability.state === "NOT_APPLICABLE") !== (outcome.state === "NOT_APPLICABLE")) throw new RangeError("Condition applicability cannot be waived by an outcome");
  }
  const required = policy.conditions.filter((c) => c.required && c.applicability.state === "APPLICABLE").map((condition) => ({
    condition, outcome: outcomes.find((o) => o.conditionId === condition.id)!,
  }));
  if (required.some(({ outcome }) => outcome.state === "NOT_SUPPORTED" || outcome.evidenceState === "NOT_SUPPORTED")) return "NOT_SUPPORTED";
  if (required.some(({ condition, outcome }) => outcome.state === "NOT_SATISFIED" && condition.failureDisposition === "BLOCK")) return "DO_NOT_PROCEED_UNDER_CURRENT_PLAN";
  if (required.some(({ outcome }) => outcome.state === "UNKNOWN" || outcome.evidenceState !== "COMPLETE" || outcome.conflicts.length)) return "DEFER_PENDING_EVIDENCE";
  if (required.some(({ outcome }) => outcome.state === "NOT_SATISFIED")) return "REVISE_PLAN";
  return "PROCEED_UNDER_DECLARED_CONDITIONS";
}

export function validateRiskFinding(raw: unknown, rawPolicy: unknown) {
  const policy = riskPolicySchema.parse(rawPolicy);
  const finding = riskFindingSchema.parse(raw);
  if (finding.severity !== null) {
    const matrix = policy.severityMatrix;
    const cell = matrix?.cells.find((c) => c.impact === finding.impact?.band && c.likelihood === finding.likelihood?.band);
    if (!cell || cell.severity !== finding.severity || canonicalize(matrix?.method) !== canonicalize(finding.severityPolicy)) throw new RangeError("Severity must match its exact approved lookup policy");
  }
  return finding;
}
export function weakestRiskConfidence(bands: readonly ("HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT")[]) {
  z.array(z.enum(riskConfidenceBands)).max(1000).parse(bands);
  const rank = { INSUFFICIENT: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
  if (!bands.length) return null;
  return bands.reduce((weakest, band) => rank[band] < rank[weakest] ? band : weakest);
}

export function mapRiskConfidence(rawPolicy: unknown, rawComponents: unknown) {
  const policy = riskPolicySchema.parse(rawPolicy);
  const components = z.array(z.object({
    policy: riskMethodSchema, band: identifierSchema, evidence: z.array(riskEvidenceSchema).min(1).max(128),
  }).strict()).max(128).parse(rawComponents);
  const mapped: (typeof riskConfidenceBands[number])[] = []; const reasons: string[] = [];
  if (!components.length) reasons.push("ESSENTIAL_CONFIDENCE_NOT_AVAILABLE");
  for (const component of components) {
    const mapping = policy.confidenceMappings.find((m) => canonicalize(m.native) === canonicalize(component.policy));
    const band = mapping?.bands.find((b) => b.from === component.band)?.to;
    if (band === undefined) reasons.push("NATIVE_CONFIDENCE_MAPPING_NOT_DECLARED");
    else mapped.push(band);
  }
  return {
    state: reasons.length ? "NOT_COMPARABLE" as const : "MAPPED" as const,
    band: reasons.length ? null : weakestRiskConfidence(mapped),
    components, reasons: [...new Set(reasons)].sort(),
    isProbability: false as const,
  };
}
