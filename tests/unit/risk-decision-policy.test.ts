import { describe, expect, it } from "vitest";
import {
  classifyRiskConditionStates, mapRiskConfidence, normalizeRiskRequest, riskConditionOutcomeSchema, riskPolicySchema,
  riskRuleSchema, validateRiskFinding, weakestRiskConfidence,
} from "@/services/analysis-engines/risk-decision";
import { riskApproval, riskBasis, riskContext, riskEvidence, riskFixture, riskOutcome, riskPolicy, riskScope } from "./support/risk-decision-fixtures";

describe("Risk M1 decision-policy foundation, no claim interpretation", () => {
  it.each([
    ["SATISFIED", "PROCEED_UNDER_DECLARED_CONDITIONS"],
    ["NOT_SATISFIED", "DO_NOT_PROCEED_UNDER_CURRENT_PLAN"],
    ["UNKNOWN", "DEFER_PENDING_EVIDENCE"],
    ["NOT_SUPPORTED", "NOT_SUPPORTED"],
  ] as const)("encodes %s -> %s", (state, decision) => {
    expect(classifyRiskConditionStates(riskPolicy(), [riskOutcome(state)])).toBe(decision);
  });
  it("distinguishes revision from a blocker", () => {
    const policy = riskPolicy(); policy.conditions[0]!.failureDisposition = "REVISE";
    expect(classifyRiskConditionStates(policy, [riskOutcome("NOT_SATISFIED")])).toBe("REVISE_PLAN");
  });
  const states = ["SATISFIED", "NOT_SATISFIED", "UNKNOWN", "NOT_SUPPORTED"] as const;
  it.each(states.flatMap((a) => states.map((b) => [a, b] as const)))("encodes mixed BLOCK %s and REVISE %s without hiding known failures", (a, b) => {
    const policy = riskPolicy(); policy.conditions.push({ ...policy.conditions[0]!, id: "condition-2", failureDisposition: "REVISE" });
    const expected = a === "NOT_SUPPORTED" || b === "NOT_SUPPORTED" ? "NOT_SUPPORTED"
      : a === "NOT_SATISFIED" ? "DO_NOT_PROCEED_UNDER_CURRENT_PLAN"
      : a === "UNKNOWN" || b === "UNKNOWN" ? "DEFER_PENDING_EVIDENCE"
      : b === "NOT_SATISFIED" ? "REVISE_PLAN" : "PROCEED_UNDER_DECLARED_CONDITIONS";
    expect(classifyRiskConditionStates(policy, [riskOutcome(a), riskOutcome(b, "condition-2")])).toBe(expected);
  });
  it("does not allow an optional finding to change required-condition precedence", () => {
    const policy = riskPolicy(); policy.conditions.push({ ...policy.conditions[0]!, id: "info", required: false });
    expect(classifyRiskConditionStates(policy, [riskOutcome(), riskOutcome("NOT_SATISFIED", "info")])).toBe("PROCEED_UNDER_DECLARED_CONDITIONS");
  });
  it("allows evidenced non-applicability but not an all-waived policy", () => {
    const policy = riskPolicy(); policy.conditions.push({
      ...policy.conditions[0]!, id: "waived", applicability: { state: "NOT_APPLICABLE", approval: structuredClone(riskApproval) },
    });
    expect(classifyRiskConditionStates(policy, [riskOutcome(), riskOutcome("NOT_APPLICABLE", "waived")])).toBe("PROCEED_UNDER_DECLARED_CONDITIONS");
    expect(() => classifyRiskConditionStates(policy, [riskOutcome("NOT_APPLICABLE"), riskOutcome("NOT_APPLICABLE", "waived")])).toThrow();
    policy.conditions[0]!.applicability = { state: "NOT_APPLICABLE", approval: structuredClone(riskApproval) };
    expect(riskPolicySchema.safeParse(policy).success).toBe(false);
  });
  it.each(["no-outcome", "duplicate", "foreign", "unapproved-waiver", "incomplete-positive", "conflicted-positive", "unsupported-positive"] as const)("rejects %s outcome", (kind) => {
    const outcome = riskOutcome();
    let outcomes: unknown = [outcome];
    if (kind === "no-outcome") outcomes = [];
    if (kind === "duplicate") outcomes = [outcome, outcome];
    if (kind === "foreign") outcomes = [{ ...outcome, conditionId: "foreign" }];
    if (kind === "unapproved-waiver") outcomes = [riskOutcome("NOT_APPLICABLE")];
    if (kind === "incomplete-positive") outcomes = [{ ...outcome, evidenceState: "PARTIAL" }];
    if (kind === "conflicted-positive") outcomes = [{ ...outcome, conflicts: ["unresolved-conflict"] }];
    if (kind === "unsupported-positive") outcomes = [{ ...outcome, evidenceState: "NOT_SUPPORTED" }];
    expect(() => classifyRiskConditionStates(riskPolicy(), outcomes)).toThrow();
  });
  it("retains unresolved conflicts as unknown, not a positive or confirmed failure", () => {
    expect(riskConditionOutcomeSchema.parse({ ...riskOutcome("UNKNOWN"), conflicts: ["conflict-1"] }).state).toBe("UNKNOWN");
  });
});
describe("Risk M1 finite policy language, graph and bounded expansion", () => {
  it.each(["empty", "optional-only", "duplicate-rule", "duplicate-condition", "unresolved-condition", "empty-any", "missing-child", "self-cycle", "indirect-cycle", "dependency-cycle", "missing-dependency", "duplicate-edge", "undeclared-action", "duplicate-action"] as const)("rejects %s policy", (kind) => {
    const policy = riskPolicy(); const original = structuredClone(policy.rules[0]!);
    if (kind === "empty") policy.conditions = [];
    if (kind === "optional-only") policy.conditions[0]!.required = false;
    if (kind === "duplicate-rule") policy.rules.push(original);
    if (kind === "duplicate-condition") policy.conditions.push(structuredClone(policy.conditions[0]!));
    if (kind === "unresolved-condition") policy.conditions[0]!.ruleId = "absent";
    if (kind === "empty-any") policy.rules = [{ id: "rule-1", operator: "ANY", ruleIds: [], rationale: "Empty is invalid" }];
    if (kind === "missing-child") policy.rules = [{ id: "rule-1", operator: "ALL", ruleIds: ["missing"], rationale: "Missing child" }];
    if (kind === "self-cycle") policy.rules = [{ id: "rule-1", operator: "ALL", ruleIds: ["rule-1"], rationale: "Self cycle" }];
    if (kind === "indirect-cycle") policy.rules = [
      { id: "rule-1", operator: "ALL", ruleIds: ["rule-2"], rationale: "Cycle" },
      { id: "rule-2", operator: "ANY", ruleIds: ["rule-1"], rationale: "Cycle" },
    ];
    if (["dependency-cycle", "missing-dependency", "duplicate-edge"].includes(kind)) {
      policy.conditions.push({ ...policy.conditions[0]!, id: "condition-2" });
      policy.dependencyEdges.push({ from: "condition-1", to: "condition-2", meaning: "Declared prerequisite", evidence: [riskEvidence] });
      if (kind === "dependency-cycle") policy.dependencyEdges.push({ ...policy.dependencyEdges[0]!, from: "condition-2", to: "condition-1" });
      if (kind === "missing-dependency") policy.dependencyEdges[0]!.to = "unknown";
      if (kind === "duplicate-edge") policy.dependencyEdges.push(structuredClone(policy.dependencyEdges[0]!));
    }
    if (["undeclared-action", "duplicate-action"].includes(kind)) {
      policy.actions.push({ id: "action", conditionIds: kind === "undeclared-action" ? ["unknown"] : ["condition-1"],
        kind: "HUMAN_REVIEW", ownerRole: "reviewer", verification: "Provide signed evidence", rationale: "Declared action" });
      if (kind === "duplicate-action") policy.actions.push(structuredClone(policy.actions[0]!));
    }
    expect(riskPolicySchema.safeParse(policy).success).toBe(false);
  });
  it.each(["eval", "SQL", "LLM", "WEIGHTED_SCORE", "PROBABILITY_OF_SUCCESS", "MONTE_CARLO"] as const)("rejects unsupported operator %s", (operator) => {
    expect(riskRuleSchema.safeParse({ id: "rule", operator, claimId: "claim", rationale: "Not an executable language" }).success).toBe(false);
  });
  it("requires dimensioned decimals for ordered comparisons", () => {
    expect(riskRuleSchema.safeParse({ id: "rule", operator: "GT", claimId: "claim", operand: { kind: "TEXT", value: "1" }, rationale: "Wrong type" }).success).toBe(false);
    expect(riskRuleSchema.safeParse({ id: "rule", operator: "GT", claimId: "claim", operand: { kind: "DECIMAL", value: "1", basis: riskBasis }, rationale: "Explicit unit and basis" }).success).toBe(true);
  });
  it("meters repeated DAG evaluation rather than just counting unique rules", () => {
    const f = riskFixture(); const leaf = f.request.policy.rules[0]!;
    f.request.policy.rules.push({ ...leaf, id: "rule-2" });
    let children = ["rule-1", "rule-2"];
    for (let level = 0; level < 16; level++) {
      const current = [`left-${level}`, `right-${level}`];
      f.request.policy.rules.push(...current.map((id) => ({ id, operator: "ALL" as const, ruleIds: [...children], rationale: "Bounded shared DAG" })));
      children = current;
    }
    f.request.policy.conditions[0]!.ruleId = children[0]!;
    expect(() => normalizeRiskRequest(f.request, f.context.evaluatedAt)).toThrow(/work exceeds/);
  });
  it("enforces the exact 20000 work threshold, not just a loose runtime timeout", () => {
    const f = riskFixture();
    f.request.policy.rules = Array.from({ length: 100 }, (_, i) => ({
      id: `leaf-${i}`, operator: "PRESENT" as const, claimId: "claim-spatial", rationale: "Explicit leaf",
    }));
    f.request.policy.rules.push({ id: "root", operator: "ALL", ruleIds: f.request.policy.rules.map((r) => r.id), rationale: "101 units per evaluation" });
    f.request.policy.conditions = Array.from({ length: 197 }, (_, i) => ({
      ...f.request.policy.conditions[0]!, id: `c-${i}`, ruleId: "root",
    }));
    expect(normalizeRiskRequest(f.request, f.context.evaluatedAt).workUnits).toBe(19909);
    f.request.claims.push(...Array.from({ length: 91 }, (_, i) => ({
      ...structuredClone(f.request.claims[0]!), id: `threshold-claim-${i}`, pointer: `/metrics/${i + 10}`,
    })));
    expect(normalizeRiskRequest(f.request, f.context.evaluatedAt).workUnits).toBe(20_000);
    f.request.claims.push({ ...structuredClone(f.request.claims[0]!), id: "over-budget", pointer: "/metrics/999" });
    expect(() => normalizeRiskRequest(f.request, f.context.evaluatedAt)).toThrow(/work exceeds/);
  });
  it("requires complete explicit scenario maps, not a shared label", () => {
    const f = riskFixture();
    f.request.scenarios = [{ id: "downside", approval: structuredClone(riskApproval), mappings: [] }];
    expect(() => normalizeRiskRequest(f.request, f.context.evaluatedAt)).toThrow(/mapping/);
    f.request.scenarios[0]!.mappings = f.snapshots.map((s) => ({
      engineKey: s.pin.engineKey, runId: s.pin.runId, variant: "explicit-existing-variant", assumptionIds: [],
    }));
    expect(normalizeRiskRequest(f.request, f.context.evaluatedAt).normalized.scenarios).toHaveLength(1);
  });
});
describe("Risk M1 evidence-backed severity and confidence policy", () => {
  function fixture() {
    const policy = riskPolicy();
    policy.severityMatrix = {
      method: { id: "declared-matrix", version: "1" }, approval: structuredClone(riskApproval),
      impactBands: ["documented-impact"], likelihoodBands: ["documented-likelihood"],
      rubric: "Synthetic one-cell rubric with evidence prerequisites",
      cells: [{ impact: "documented-impact", likelihood: "documented-likelihood", severity: "HIGH" }],
    };
    const finding = {
      id: "risk", category: "OPERATIONAL", kind: "CONDITIONAL_RISK", state: "CONDITIONAL", scope: riskScope,
      claimIds: ["claim-operational-feasibility"], evidence: [riskEvidence], counterevidence: [], assumptions: ["declared-plan"],
      rule: { id: "rule", version: "1" },
      impact: { event: "resource-shortfall", band: "documented-impact", value: "10", basis: riskBasis,
        nature: "UPSTREAM_DERIVED", scope: riskScope, method: { id: "retained-upstream", version: "1" }, approval: riskApproval },
      likelihood: { event: "resource-shortfall", horizon: riskScope.period, population: "declared-production-plan",
        sourceDate: "2026-10-01T00:00:00.000Z", method: { id: "explicit-assessment", version: "1" }, approval: riskApproval,
        nature: "QUALITATIVE_ASSESSMENT", band: "documented-likelihood", value: null, scale: "QUALITATIVE", denominator: null, rationale: "Approved assessment, not a success probability" },
      severity: "HIGH", severityState: "ASSESSED", severityPolicy: { id: "declared-matrix", version: "1" }, confidence: null,
      rationale: "Conditional resource exposure", reasons: ["EXPLICIT_POLICY_MATCH"], limitations: ["Plan-based assessment only"],
    };
    return { policy, finding };
  }
  it("validates an evidenced declared matrix result, never a default score", () => {
    const f = fixture(); expect(validateRiskFinding(f.finding, f.policy).severity).toBe("HIGH");
  });
  it.each(["no-matrix", "missing-impact", "missing-likelihood", "mismatched-event", "mismatched-horizon", "wrong-cell", "wrong-policy", "partial-matrix", "duplicate-cell", "unapproved", "assumption-erasure"] as const)("rejects %s severity", (kind) => {
    const { finding, policy } = fixture();
    let candidate: unknown = finding;
    if (kind === "no-matrix") policy.severityMatrix = null;
    if (kind === "missing-impact") candidate = { ...finding, impact: null };
    if (kind === "missing-likelihood") candidate = { ...finding, likelihood: null };
    if (kind === "mismatched-event") candidate = { ...finding, likelihood: { ...finding.likelihood, event: "unrelated-event" } };
    if (kind === "mismatched-horizon") candidate = { ...finding, likelihood: { ...finding.likelihood, horizon: { ...riskScope.period, end: "2026-12-01T00:00:00.000Z" } } };
    if (kind === "wrong-cell") candidate = { ...finding, severity: "LOW" };
    if (kind === "wrong-policy") candidate = { ...finding, severityPolicy: { id: "another-matrix", version: "1" } };
    if (kind === "partial-matrix") policy.severityMatrix!.impactBands.push("another-impact");
    if (kind === "duplicate-cell") policy.severityMatrix!.cells.push(structuredClone(policy.severityMatrix!.cells[0]!));
    if (kind === "unapproved") candidate = { ...finding, likelihood: { ...finding.likelihood, approval: { ...riskApproval, status: "UNREVIEWED" } } };
    if (kind === "assumption-erasure") candidate = { ...finding, assumptions: [] };
    expect(() => validateRiskFinding(candidate, policy)).toThrow();
  });
  it.each([
    [[], null], [["HIGH"], "HIGH"], [["HIGH", "LOW"], "LOW"],
    [["HIGH", "HIGH", "LOW", "LOW"], "LOW"], [["HIGH", "INSUFFICIENT"], "INSUFFICIENT"],
  ] as const)("does not average or inflate evidence confidence %j", (bands, expected) => {
    expect(weakestRiskConfidence(bands)).toBe(expected);
  });
  it("does not allow confidence mappings with duplicate native policy/bands", () => {
    const p = riskPolicy(); const mapping = { native: { id: "native", version: "1" }, rationale: "Explicit mapping", bands: [{ from: "A", to: "LOW" as const }] };
    p.confidenceMappings = [mapping, mapping];
    expect(riskPolicySchema.safeParse(p).success).toBe(false);
    p.confidenceMappings = [{ ...mapping, bands: [...mapping.bands, ...mapping.bands] }];
    expect(riskPolicySchema.safeParse(p).success).toBe(false);
  });
  it("requires an explicit policy mapping and never upgrades LOW or averages repeated evidence", () => {
    const p = riskPolicy();
    const component = { policy: { id: "native", version: "1" }, band: "LOW", evidence: [riskEvidence] };
    expect(mapRiskConfidence(p, [component])).toMatchObject({ state: "NOT_COMPARABLE", band: null, isProbability: false });
    p.confidenceMappings = [{ native: component.policy, rationale: "Approved compatible bands", bands: [{ from: "LOW", to: "LOW" }] }];
    expect(mapRiskConfidence(p, [component, component])).toMatchObject({ state: "MAPPED", band: "LOW", isProbability: false });
    p.confidenceMappings[0]!.bands[0]!.to = "HIGH";
    expect(riskPolicySchema.safeParse(p).success).toBe(false);
    expect(mapRiskConfidence(riskPolicy(), [])).toMatchObject({ state: "NOT_COMPARABLE", band: null });
  });
  it("rejects future severity approval during foundation normalization", () => {
    const f = riskFixture(); const p = fixture().policy; p.severityMatrix!.approval.approvedAt = "2028-01-01T00:00:00.000Z";
    f.request.policy = p;
    expect(() => normalizeRiskRequest(f.request, riskContext.evaluatedAt)).toThrow();
  });
});
