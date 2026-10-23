import { describe, expect, it } from "vitest";
import {
  interpretRiskPreparation, normalizeRiskRequest, riskCategories, riskInterpretationPolicySchema, type RiskInterpretationPolicy,
  type RiskPreparation,
} from "@/services/analysis-engines/risk-decision";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { makeInput } from "./support/analysis-engine-fixtures";
import { riskApproval, riskBasis, riskFixture, riskInstant, riskScope } from "./support/risk-decision-fixtures";

function fixture() {
  const { request } = riskFixture();
  request.policy.actions = [{ id: "obtain-review", conditionIds: ["condition-1"], kind: "HUMAN_REVIEW",
    ownerRole: "project-owner", verification: "Provide new exact approved evidence and human sign-off", rationale: "Approved response only" }];
  const policy: RiskInterpretationPolicy = {
    contract: "jenan.risk-decision.interpretation-policy/v1", method: { id: "risk-interpretation", version: "1" },
    engineSlots: structuredClone(request.engineSlots), declaredScenarios: [],
    projections: request.claims.map((claim) => ({ claimId: claim.id, value: "exactValue", kind: "DECIMAL", estimated: "UNKNOWN", rationale: "Original exact native scalar only" })),
    findings: [{ id: "exposure", conditionId: "condition-1", category: "OPERATIONAL", rationale: "Approved resource adequacy condition", impact: null, likelihood: null }],
    conflicts: [], scenarios: [],
  };
  const input = makeInput();
  const preparation: RiskPreparation = {
    contract: "jenan.risk-decision.preparation/v1", phase: "M2_EXACT_READS", status: "AVAILABLE",
    decision: null, findings: [], conditionOutcomes: [], automaticAction: false,
    outcomes: request.engineSlots.flatMap((slot) => slot.state === "PINNED" ? slot.runs.map((pin) => ({
      runId: pin.runId, status: "AVAILABLE" as const, evidence: {
        pin: structuredClone(pin), lineage: [structuredClone(input)], selections: request.claims.filter((claim) => claim.runId === pin.runId).map((claim) => ({
          id: claim.id, pointer: claim.pointer, method: claim.basis.methodology,
          native: { key: claim.nativeKey, status: "COMPUTED", interpretation: "OBSERVED", exactValue: "2", value: "2",
            unit: "COUNT", method: claim.basis.methodology, limitations: ["Synthetic retained-only unit test"],
            confidence: { band: "LOW", isProbability: false }, assumptionIds: [], inputRefs: [input.id] },
        })),
      },
    })) : []),
    declaredMissing: [], realDataAcceptance: "BLOCKED / NOT VERIFIED", limitations: ["Synthetic preparation, not server authorization proof"],
    determinism: { requestHash: "", inputsHash: "", outputHash: "" },
  };
  const native = (index = 0) => preparation.outcomes[index]!.evidence!.selections[0]!.native as Record<string, unknown>;
  const sign = () => {
    preparation.determinism = {
      requestHash: normalizeRiskRequest(request, riskInstant).requestHash,
      inputsHash: canonicalHash(preparation.outcomes), outputHash: canonicalHash(omitKeys(preparation, ["determinism"])),
    };
    return preparation;
  };
  const run = () => interpretRiskPreparation(request, sign(), policy, riskInstant);
  return { request, preparation, policy, native, run, sign };
}

describe("Risk M3 exact rules and conditional decisions", () => {
  it("emits an explainable conditional positive only with all six proven roles and no action execution", () => {
    const f = fixture(); const result = f.run();
    expect(result.projectionGaps).toEqual([]);
    expect(result.decision).toBe("PROCEED_UNDER_DECLARED_CONDITIONS");
    expect(result.conditionOutcomes[0]?.state).toBe("SATISFIED");
    expect(result.findings).toEqual([]); expect(result.actions).toEqual([]);
    expect(result.automaticAction).toBe(false); expect(result.humanReview).toBe("REQUIRED");
    expect(result.rights.allowExport).toBe(false);
    expect(result.explanation.policy).toEqual(normalizeRiskRequest(f.request, riskInstant).normalized.policy);
    expect(result.nativeComponents[0]?.confidence).toEqual({ band: "LOW", isProbability: false });
    expect(result).toEqual(f.run());
    expect(result.determinism.outputHash).toBe(canonicalHash(omitKeys(result, ["determinism"])));
  });
  it.each([
    ["GT", "2", "2", false], ["GTE", "2", "2.000", true], ["LT", "-0.000000000000000001", "0", true],
    ["LTE", "999999999999999999", "999999999999999999", true],
    ["EQ", "0.100000000000000001", "0.1", false], ["NE", "-0", "0.0", false],
  ] as const)("compares exact %s values %s and %s without binary float conversion", (operator, left, right, truth) => {
    const f = fixture(); f.native().exactValue = left;
    f.request.policy.rules = [{ id: "rule-1", claimId: "claim-spatial", operator, operand: { kind: "DECIMAL", value: right, basis: riskBasis }, rationale: "Exact threshold" }];
    expect(f.run().conditionOutcomes[0]?.state).toBe(truth ? "SATISFIED" : "NOT_SATISFIED");
  });
  it.each(["BLOCK", "REVISE"] as const)("retains the declared %s failure disposition", (disposition) => {
    const f = fixture(); f.native().exactValue = "0"; f.request.policy.conditions[0]!.failureDisposition = disposition;
    const result = f.run();
    expect(result.decision).toBe(disposition === "BLOCK" ? "DO_NOT_PROCEED_UNDER_CURRENT_PLAN" : "REVISE_PLAN");
    expect(result.findings[0]).toMatchObject({ kind: "EVIDENCED_EXPOSURE", state: "SUPPORTED", likelihood: null, severity: null, severityState: "NOT_ASSESSABLE" });
    expect(result.actions[0]).toMatchObject({ ownerRole: "project-owner", status: "PLANNED", effectOnCurrentDecision: "NONE_NEW_VERIFIED_EVIDENCE_REQUIRED" });
    expect(result.actions[0]?.evidence.length).toBeGreaterThan(0);
    expect(result.explanation.changeRequirements[0]?.verification).toContain("new exact approved evidence");
  });
  it.each(["PLAN_DERIVED", "ASSUMPTION_BASED_PROJECTION", "ESTIMATE", "DERIVED_QUANTITY"] as const)("keeps %s exposure conditional rather than observed failure", (interpretation) => {
    const f = fixture(); f.native().interpretation = interpretation; f.native().exactValue = "0";
    expect(f.run().findings[0]).toMatchObject({ kind: "CONDITIONAL_RISK", state: "CONDITIONAL", assumptions: ["claim-spatial"], likelihood: null, severity: null });
  });
  it.each(["ESTIMATED", "PARTIAL"] as const)("does not convert %s inputs to definite threshold evidence", (status) => {
    const f = fixture(); f.native().status = status;
    f.native().interpretation = status === "ESTIMATED" ? "PLAN_DERIVED" : "OBSERVED";
    expect(f.run()).toMatchObject({ decision: "DEFER_PENDING_EVIDENCE", findings: [{ kind: "DATA_QUALITY_LIMITATION" }] });
  });
  it.each(["NOT_AVAILABLE", "NOT_COMPUTABLE", "NO_COVERAGE", "NOT_FOUND_WITHIN_RADIUS"] as const)("retains %s as missing, never zero/adverse risk", (status) => {
    const f = fixture(); Object.assign(f.native(), { status, interpretation: "UNAVAILABLE", exactValue: null, value: null });
    const result = f.run();
    expect(result.decision).toBe("DEFER_PENDING_EVIDENCE");
    expect(result.findings[0]?.kind).toBe("EVIDENCE_GAP");
    expect(result.claims.find((claim) => claim.id === "claim-spatial")?.value).toBeNull();
  });
  it("does not convert a state-completeness failure to confirmed business risk", () => {
    const f = fixture(); Object.assign(f.native(), { status: "NOT_AVAILABLE", interpretation: "UNAVAILABLE", exactValue: null, value: null });
    f.request.policy.rules = [{ id: "rule-1", operator: "STATE", claimId: "claim-spatial", expected: "COMPUTED", rationale: "Completeness requirement only" }];
    const result = f.run();
    expect(result.decision).toBe("DO_NOT_PROCEED_UNDER_CURRENT_PLAN");
    expect(result.findings[0]?.kind).toBe("EVIDENCE_GAP");
  });
  it.each(["number", "rounded", "out-of-bounds", "no-projection", "unknown-meaning"] as const)("refuses %s precision/semantics without guessing", (kind) => {
    const f = fixture();
    if (kind === "number") f.native().exactValue = 2;
    if (kind === "rounded") f.policy.projections[0]!.value = "value";
    if (kind === "out-of-bounds") f.native().exactValue = "1e100";
    if (kind === "no-projection") f.policy.projections.shift();
    if (kind === "unknown-meaning") f.native().interpretation = "invented";
    const result = f.run();
    expect(["DEFER_PENDING_EVIDENCE", "NOT_SUPPORTED"]).toContain(result.decision);
    expect(result.findings.every((finding) => !["EVIDENCED_EXPOSURE", "CONDITIONAL_RISK"].includes(finding.kind))).toBe(true);
  });
  it("does not evaluate a quantity under an incompatible currency/unit/basis", () => {
    const f = fixture(); const rule = f.request.policy.rules[0]!;
    if ("operand" in rule && rule.operand.kind === "DECIMAL") rule.operand.basis.timingBasis = "OTHER";
    expect(f.run().conditionOutcomes[0]?.state).toBe("UNKNOWN");
  });
  it("preserves native JSON numbers as reported-only presence/state evidence, never exact decimal thresholds", () => {
    const f = fixture(); f.native().exactValue = 2;
    expect(f.run().conditionOutcomes[0]?.state).toBe("UNKNOWN");
    f.request.policy.rules = [{ id: "rule-1", operator: "PRESENT", claimId: "claim-spatial", rationale: "Presence only, not an exact threshold" }];
    const result = f.run();
    expect(result.conditionOutcomes[0]?.state).toBe("SATISFIED");
    expect(result.claims.find((claim) => claim.id === "claim-spatial")?.value).toEqual({ kind: "DECIMAL", value: "2", precision: "REPORTED_ONLY" });
    expect(result.nativeComponents.find((claim) => claim.claimId === "claim-spatial")?.exactValue).toBe(2);
  });
  it.each(riskCategories)("keeps the approved %s category without assigning default likelihood or severity", (category) => {
    const f = fixture(); f.native().exactValue = "0"; f.policy.findings[0]!.category = category;
    expect(f.run().findings[0]).toMatchObject({ category, severity: null, likelihood: null });
  });
  it("uses an estimate only under explicit approved conditional semantics, never as observed failure", () => {
    const f = fixture(); Object.assign(f.native(), { status: "ESTIMATED", interpretation: "PLAN_DERIVED", exactValue: "0" });
    f.policy.projections[0]!.estimated = "ALLOW_CONDITIONAL";
    expect(f.run().findings[0]).toMatchObject({ kind: "CONDITIONAL_RISK", state: "CONDITIONAL", severity: null });
    f.policy.projections[0]!.estimated = "UNKNOWN";
    expect(f.run().findings[0]?.kind).toBe("DATA_QUALITY_LIMITATION");
  });
  it("does not use confidence as project-failure probability or threshold evidence", () => {
    const f = fixture(); const before = f.run();
    f.native().confidence = { band: "HIGH", isProbability: false };
    const after = f.run();
    expect(after.decision).toBe(before.decision);
    expect(after.conditionOutcomes).toEqual(before.conditionOutcomes);
    expect(after.confidenceInterpretation).toContain("NO_COMMON_BAND_OR_PROBABILITY");
  });
  it("does not cite unrelated lineage as support for a value without native evidence references", () => {
    const f = fixture(); f.native().inputRefs = [];
    expect(f.run().projectionGaps).toContainEqual({ claimId: "claim-spatial", reason: "PROJECTION_NOT_SUPPORTED" });
    expect(f.run().findings[0]?.kind).toBe("EVIDENCE_GAP");
  });
  it("preserves original over-limit limitations but refuses their projection instead of silently truncating them", () => {
    const f = fixture(); f.native().limitations = Array.from({ length: 20 }, (_, index) => `Native limitation ${index}`);
    const result = f.run();
    expect(result.projectionGaps).toContainEqual({ claimId: "claim-spatial", reason: "NATIVE_LIMITATIONS_NOT_SUPPORTED" });
    expect(result.nativeComponents.find((claim) => claim.claimId === "claim-spatial")?.limitations).toHaveLength(20);
    expect(result.decision).toBe("NOT_SUPPORTED");
  });
  function severityFixture() {
    const f = fixture(); f.native().exactValue = "0";
    const approval = structuredClone(riskApproval); approval.evidence[0]!.refId = f.request.policySource.versionId;
    f.policy.findings[0]!.impact = {
      event: "resource-gap", band: "material", value: "2", basis: structuredClone(riskBasis),
      nature: "OBSERVED", scope: structuredClone(riskScope), method: { id: "approved-impact", version: "1" }, approval,
    };
    f.policy.findings[0]!.likelihood = {
      event: "resource-gap", band: "reviewed-band", horizon: structuredClone(riskScope.period), population: "explicit-exposure-set",
      sourceDate: "2026-10-01T00:00:00.000Z", method: { id: "approved-rubric", version: "1" }, approval: structuredClone(approval),
      nature: "QUALITATIVE_ASSESSMENT", value: null, scale: "QUALITATIVE", denominator: null, rationale: "Explicitly reviewed evidence/rubric, not confidence",
    };
    f.request.policy.severityMatrix = { method: { id: "approved-severity", version: "1" }, approval: structuredClone(approval),
      impactBands: ["material"], likelihoodBands: ["reviewed-band"], rubric: "Reviewed same-event impact and likelihood rubric",
      cells: [{ impact: "material", likelihood: "reviewed-band", severity: "HIGH" }] };
    return f;
  }
  it("assigns severity only through the complete approved same-event matrix and retained assessments", () => {
    expect(severityFixture().run().findings[0]).toMatchObject({ severity: "HIGH", severityState: "ASSESSED",
      severityPolicy: { id: "approved-severity", version: "1" } });
  });
  it.each(["no-likelihood", "no-matrix", "unknown-band"] as const)("keeps severity unassessable for %s", (kind) => {
    const f = severityFixture();
    if (kind === "no-likelihood") f.policy.findings[0]!.likelihood = null;
    if (kind === "no-matrix") f.request.policy.severityMatrix = null;
    if (kind === "unknown-band") f.policy.findings[0]!.likelihood!.band = "unmapped";
    expect(f.run().findings[0]).toMatchObject({ severity: null, severityState: "NOT_ASSESSABLE" });
  });
  it.each(["unretained", "future", "different-event", "different-horizon"] as const)("rejects %s assessment rather than inventing severity", (kind) => {
    const f = severityFixture(); const assessment = f.policy.findings[0]!.likelihood!;
    if (kind === "unretained") assessment.approval.evidence[0]!.refId = "not-retained";
    if (kind === "future") assessment.approval.approvedAt = "2027-01-01T00:00:00.000Z";
    if (kind === "different-event") assessment.event = "other-event";
    if (kind === "different-horizon") assessment.horizon.end = "2026-12-01T00:00:00.000Z";
    expect(() => f.run()).toThrow();
  });
  it.each(["ALL", "ANY"] as const)("evaluates bounded %s with explicit missing child semantics", (operator) => {
    const f = fixture(); f.request.policy.rules.push({ id: "child", operator: "PRESENT", claimId: "claim-market-demand", rationale: "Present evidence" });
    const original = f.request.policy.rules[0]!; original.id = "original";
    f.request.policy.rules.push({ id: "rule-1", operator, ruleIds: ["original", "child"], rationale: "Approved composite" });
    f.native().exactValue = "0";
    expect(f.run().conditionOutcomes[0]?.state).toBe(operator === "ALL" ? "NOT_SATISFIED" : "SATISFIED");
  });
  it.each(["TEXT", "BOOLEAN"] as const)("supports declared %s equality and membership without coercion", (kind) => {
    const f = fixture(); f.policy.projections[0]!.kind = kind;
    f.native().exactValue = kind === "TEXT" ? "approved" : true;
    f.request.policy.rules = [{ id: "rule-1", operator: "IN", claimId: "claim-spatial",
      operands: kind === "TEXT" ? [{ kind, value: "approved" }] : [{ kind, value: true }], rationale: "Explicit membership" }];
    expect(f.run().conditionOutcomes[0]?.state).toBe("SATISFIED");
  });
});

describe("Risk M3 evidence gates, conflicts, dependencies and scenario safety", () => {
  it.each(["UNAVAILABLE", "TAMPERED", "INCOMPATIBLE"] as const)("never produces a business decision after %s rejection", (status) => {
    const f = fixture(); f.preparation.outcomes[0]!.status = status; f.preparation.outcomes[0]!.evidence = null;
    expect(f.run()).toMatchObject({ decision: null, status: "REJECTED" });
  });
  it("fails closed for unprovable Map without exposing its native selection", () => {
    const f = fixture(); f.preparation.outcomes[0]!.status = "NOT_SUPPORTED"; f.preparation.outcomes[0]!.evidence = null;
    const result = f.run();
    expect(result.decision).toBe("NOT_SUPPORTED");
    expect(result.claims.some((claim) => claim.runId === "retained-spatial")).toBe(false);
    expect(result.findings[0]?.kind).toBe("EVIDENCE_GAP");
  });
  it("prevents vacuous positive coverage when a role has no selected usable evidence", () => {
    const f = fixture(); f.preparation.outcomes[1]!.evidence!.selections = [];
    expect(f.run().decision).toBe("DEFER_PENDING_EVIDENCE");
  });
  it.each(["request", "input", "output", "duplicate", "pin", "forged-available"] as const)("rejects %s preparation mismatches", (kind) => {
    const f = fixture(); f.sign();
    if (kind === "request") f.preparation.determinism.requestHash = "a".repeat(64);
    if (kind === "input") f.preparation.outcomes[0]!.status = "NOT_SUPPORTED";
    if (kind === "output") f.preparation.status = "PARTIAL";
    if (kind === "duplicate") f.preparation.outcomes.push(f.preparation.outcomes[0]!);
    if (kind === "pin") f.preparation.outcomes[0]!.evidence!.pin.outputHash = "f".repeat(64);
    if (kind === "forged-available") f.preparation.outcomes[0]!.evidence = null;
    if (["duplicate", "pin", "forged-available"].includes(kind)) f.sign();
    expect(() => interpretRiskPreparation(f.request, f.preparation, f.policy, riskInstant)).toThrow();
  });
  function conflictFixture() {
    const f = fixture();
    f.policy.conflicts = [{ id: "same-measure", leftClaimId: "claim-spatial", rightClaimId: "claim-market-demand",
      relation: "MUST_EQUAL", measureId: "approved-resource-measure", conditionIds: ["condition-1"], rationale: "Same mapped entity/measure" }];
    return f;
  }
  it("detects a true cross-engine conflict with both sides, not a silent winner", () => {
    const f = conflictFixture(); f.native(1).exactValue = "3";
    const result = f.run();
    expect(result.decision).toBe("DEFER_PENDING_EVIDENCE");
    expect(result.conflicts[0]?.state).toBe("CONFLICT");
    expect(result.findings.find((finding) => finding.kind === "CROSS_ENGINE_CONFLICT")?.claimIds).toHaveLength(2);
    expect(result.conditionOutcomes[0]?.state).toBe("UNKNOWN");
  });
  it("retains equal comparable claims without inventing conflict or raising confidence", () => {
    const result = conflictFixture().run();
    expect(result.conflicts[0]?.state).toBe("CONSISTENT"); expect(result.findings).toEqual([]);
  });
  it.each(["scope", "unit", "entity", "method", "precision", "meaning", "native-unit", "native-method", "native-basis"] as const)("reports %s mismatch as NOT_COMPARABLE, not conflict", (kind) => {
    const f = conflictFixture(); const claim = f.request.claims[1]!;
    if (kind === "scope") claim.scope.period.end = "2026-12-01T00:00:00.000Z";
    if (kind === "unit") claim.basis.unit = "QUANTITY";
    if (kind === "entity") claim.entityId = "other-entity";
    if (kind === "method") claim.basis.methodology.version = "2";
    if (kind === "precision") f.policy.projections[1]!.value = "value";
    if (kind === "meaning") f.native(1).interpretation = "PLAN_DERIVED";
    if (kind === "native-unit") { f.native().unit = { kind: "TIME", unit: "HOUR" }; f.native(1).unit = { kind: "TIME", unit: "MINUTE" }; }
    if (kind === "native-method") f.native(1).method = { id: "other-method", version: "1" };
    if (kind === "native-basis") f.native(1).basis = { priceBaseDate: "different-native-price-basis" };
    f.native(1).exactValue = "3";
    expect(f.run().conflicts[0]?.state).toBe("NOT_COMPARABLE");
    expect(f.run().findings.some((finding) => finding.kind === "CROSS_ENGINE_CONFLICT")).toBe(false);
  });
  it("propagates an explicit unknown dependency without creating a downstream adverse event", () => {
    const f = fixture();
    f.request.policy.rules.push({ id: "prerequisite-rule", operator: "PRESENT", claimId: "claim-market-demand", rationale: "Required source" });
    f.request.policy.conditions.push({ ...f.request.policy.conditions[0]!, id: "prerequisite", ruleId: "prerequisite-rule" });
    const evidence = structuredClone(riskApproval.evidence); evidence[0]!.refId = f.request.policySource.versionId;
    f.request.policy.dependencyEdges = [{ from: "prerequisite", to: "condition-1", meaning: "Approved prerequisite only", evidence }];
    Object.assign(f.native(1), { status: "NOT_AVAILABLE", interpretation: "UNAVAILABLE", exactValue: null, value: null });
    const result = f.run();
    expect(result.conditionOutcomes.find((condition) => condition.conditionId === "condition-1")?.state).toBe("UNKNOWN");
    expect(result.findings.find((finding) => finding.kind === "DEPENDENCY_GAP")).toMatchObject({ state: "UNKNOWN", likelihood: null, severity: null });
  });
  it("keeps an independently established BLOCK even alongside an unknown dependency", () => {
    const f = fixture(); f.native().exactValue = "0";
    f.request.policy.rules.push({ id: "other", operator: "PRESENT", claimId: "claim-market-demand", rationale: "Other evidence" });
    f.request.policy.conditions.push({ ...f.request.policy.conditions[0]!, id: "other", ruleId: "other" });
    Object.assign(f.native(1), { status: "NOT_AVAILABLE", interpretation: "UNAVAILABLE", exactValue: null, value: null });
    expect(f.run().decision).toBe("DO_NOT_PROCEED_UNDER_CURRENT_PLAN");
  });
  function scenarioFixture() {
    const f = fixture(); const approval = structuredClone(riskApproval);
    approval.evidence[0]!.refId = f.request.policySource.versionId;
    f.request.scenarios = [{ id: "approved-case", approval, mappings: f.request.engineSlots.flatMap((slot) =>
      slot.state === "PINNED" ? [{ engineKey: slot.engineKey, runId: slot.runs[0]!.runId, variant: "base", assumptionIds: [] }] : []) }];
    f.policy.scenarios = [{ scenarioId: "approved-case", claims: f.request.claims.map((claim) => ({
      baseClaimId: claim.id, claimId: claim.id, invariantRationale: "Reviewed invariant input across this declared case",
    })) }];
    f.policy.declaredScenarios = structuredClone(f.request.scenarios);
    return f;
  }
  it("compares only approved existing scenario mappings with justified invariant reuse", () => {
    const result = scenarioFixture().run();
    expect(result.scenarios).toHaveLength(1); expect(result.scenarios[0]?.decision).toBe("PROCEED_UNDER_DECLARED_CONDITIONS");
    expect(result.scenarios[0]?.scenarioId).toBe("approved-case");
    expect(result).not.toHaveProperty("bestScenario"); expect(result).not.toHaveProperty("score");
  });
  it("does not invent a missing scenario claim", () => {
    const f = scenarioFixture(); f.policy.scenarios[0]!.claims.shift();
    expect(f.run().scenarios[0]?.conditionOutcomes[0]?.state).toBe("UNKNOWN");
  });
  it("refuses unapproved scenario variants and never uses another run as fallback", () => {
    const f = scenarioFixture(); f.request.scenarios[0]!.mappings[0]!.variant = "not-persisted";
    expect(() => f.run()).toThrow(/governed interpretation policy/);
  });
  it("binds scenario assumptions and approval evidence to the governed declaration", () => {
    const f = scenarioFixture(); f.request.scenarios[0]!.mappings[0]!.assumptionIds = ["invented-assumption"];
    expect(() => f.run()).toThrow(/governed interpretation policy/);
  });
  it("does not permit caller-only substitution of a missing role with an owner waiver", () => {
    const f = fixture();
    const slot = f.request.engineSlots[1]!;
    const runId = slot.state === "PINNED" ? slot.runs[0]!.runId : "";
    f.request.claims = f.request.claims.filter((claim) => claim.runId !== runId);
    f.preparation.outcomes = f.preparation.outcomes.filter((entry) => entry.runId !== runId);
    f.request.engineSlots[1] = { engineKey: slot.engineKey, state: "NOT_APPLICABLE", approval: structuredClone(riskApproval) };
    f.policy.projections = f.policy.projections.filter((entry) => f.request.claims.some((claim) => claim.id === entry.claimId));
    expect(() => f.run()).toThrow(/governed interpretation policy/);
  });
  it("evaluates an existing alternate native scenario side-by-side without requiring its base run again or recommending a winner", () => {
    const f = scenarioFixture();
    for (const slot of f.request.engineSlots) if (slot.state === "PINNED") {
      const base = f.request.claims.find((claim) => claim.runId === slot.runs[0]!.runId)!;
      const alternate = { ...structuredClone(base), id: `alternate-${base.id}`, runId: `alternate-${base.runId}`, variant: "approved-case",
        scope: { ...structuredClone(base.scope), scenarioId: "approved-case" } };
      const pin = { ...structuredClone(slot.runs[0]!), runId: alternate.runId };
      slot.runs.push(pin); f.request.claims.push(alternate);
      const retained = structuredClone(f.preparation.outcomes.find((entry) => entry.runId === base.runId)!);
      retained.runId = pin.runId; retained.evidence!.pin = pin;
      retained.evidence!.selections[0]!.id = alternate.id;
      const metric = retained.evidence!.selections[0]!.native as Record<string, unknown>; metric.exactValue = "0";
      f.preparation.outcomes.push(retained);
      f.policy.projections.push({ ...f.policy.projections.find((entry) => entry.claimId === base.id)!, claimId: alternate.id });
      const binding = f.policy.scenarios[0]!.claims.find((entry) => entry.baseClaimId === base.id)!;
      binding.claimId = alternate.id; binding.invariantRationale = null;
      const mapping = f.request.scenarios[0]!.mappings.find((entry) => entry.engineKey === slot.engineKey)!;
      mapping.runId = pin.runId; mapping.variant = "approved-case";
    }
    f.policy.engineSlots = structuredClone(f.request.engineSlots);
    f.policy.declaredScenarios = structuredClone(f.request.scenarios);
    const result = f.run();
    expect(result.decision).toBe("PROCEED_UNDER_DECLARED_CONDITIONS");
    expect(result.scenarios[0]?.conditionOutcomes[0]?.state).toBe("NOT_SATISFIED");
    expect(result.scenarios[0]?.decision).toBe("DO_NOT_PROCEED_UNDER_CURRENT_PLAN");
    expect(result.scenarios[0]?.coverage.every((entry) => entry.state === "AVAILABLE")).toBe(true);
    expect(result.scenarios[0]?.rules[0]?.evidence.length).toBeGreaterThan(0);
  });
  it("enforces the final 2 MiB result bound without truncating evidence", () => {
    const f = fixture(); f.native().confidence = { preservedNativeContext: "x".repeat(2 * 1024 * 1024) };
    expect(() => f.run()).toThrow(/byte limit|byte|MiB/);
  });
  it("enforces aggregate findings across base and approved scenarios without dropping adverse findings", () => {
    const f = scenarioFixture(); f.native().exactValue = "0";
    f.policy.findings = Array.from({ length: 251 }, (_, index) => ({ ...f.policy.findings[0]!, id: `finding-${index}` }));
    expect(() => f.run()).toThrow(/Aggregate Risk finding bound/);
  });
  it.each(["projection", "condition", "conflict", "scenario"] as const)("rejects unresolved %s policy references", (kind) => {
    const f = fixture();
    if (kind === "projection") f.policy.projections[0]!.claimId = "unknown";
    if (kind === "condition") f.policy.findings[0]!.conditionId = "unknown";
    if (kind === "conflict") f.policy.conflicts = [{ id: "bad", leftClaimId: "unknown", rightClaimId: "claim-market-demand", measureId: "x", relation: "MUST_EQUAL", conditionIds: ["condition-1"], rationale: "Invalid" }];
    if (kind === "scenario") f.policy.scenarios = [{ scenarioId: "unapproved", claims: [] }];
    expect(() => f.run()).toThrow();
  });
  it("rejects an implicit invariant or arbitrary executable policy extension", () => {
    const f = scenarioFixture(); f.policy.scenarios[0]!.claims[0]!.invariantRationale = null;
    expect(riskInterpretationPolicySchema.safeParse(f.policy).success).toBe(false);
    expect(riskInterpretationPolicySchema.safeParse({ ...fixture().policy, script: "return true" }).success).toBe(false);
  });
});
