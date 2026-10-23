import {
  riskEngineKeys, riskNativeManifest, type RiskContext, type RiskPolicy, type RiskRequest,
} from "@/services/analysis-engines/risk-decision";
import { deriveAttribution, deriveRights } from "@/services/analysis-engines/shared/contracts";
import { digest, evaluatedAt, makeEngineRunInput, makeInput } from "./analysis-engine-fixtures";

export const riskInstant = evaluatedAt;
export const riskEvidence = { inputId: "dc:policy-v1", refId: "policy-v1", checksum: digest, recordId: "synthetic-policy-approval" };
export const riskLineageEvidence = { inputId: "dc:version-1", refId: "version-1", checksum: digest, recordId: "synthetic-upstream-record" };
export const riskApproval = {
  author: "synthetic-owner", declaredAt: "2026-10-01T00:00:00.000Z", approvedBy: "synthetic-reviewer",
  approvedAt: "2026-10-02T00:00:00.000Z", status: "OWNER_APPROVED" as const,
  rationale: "Synthetic evidence, not a production decision policy", evidence: [riskEvidence],
};
export const riskScope = {
  subject: "synthetic-subject", siteId: "site-1",
  geography: { id: "SA", version: "1" }, sector: { id: "synthetic-sector", version: "1" },
  period: { start: "2026-10-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z", timeZone: "Asia/Riyadh" },
  scenarioId: "base",
};
export const riskBasis = {
  unit: "COUNT", currency: null, priceBasis: null, cashFlowBasis: null,
  timingBasis: "PERIOD_END", cohort: null, methodology: { id: "synthetic-count", version: "1" },
};
export const riskContext: RiskContext = {
  runId: "risk-m1-fixture", evaluatedAt: riskInstant, environment: "test",
  timing: { startedAt: riskInstant, finishedAt: riskInstant, durationMs: 0 },
};
export function riskPolicy(): RiskPolicy {
  return {
    contract: "jenan.risk-decision.policy/v1", method: { id: "synthetic-decision-policy", version: "1" },
    approval: structuredClone(riskApproval),
    validity: { start: "2026-10-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z", timeZone: "Asia/Riyadh" },
    rules: [{ id: "rule-1", operator: "GTE", claimId: "claim-spatial", operand: { kind: "DECIMAL", value: "1", basis: structuredClone(riskBasis) }, rationale: "Synthetic threshold only" }],
    conditions: [{ id: "condition-1", ruleId: "rule-1", required: true, failureDisposition: "BLOCK", applicability: { state: "APPLICABLE" }, rationale: "An explicitly required synthetic condition" }],
    severityMatrix: null, confidenceMappings: [], dependencyEdges: [], actions: [],
  };
}
export function riskFixture() {
  const pins = riskEngineKeys.map((engineKey) => {
    const native = riskNativeManifest[engineKey];
    return {
      engineKey, runId: `retained-${engineKey}`, engineVersion: native.version,
      requestContract: native.request, resultContract: native.result,
      requestHash: digest, inputsHash: digest, outputHash: digest, contentHash: digest, evaluatedAt: riskInstant,
    };
  });
  const claims = pins.map((pin) => ({
    id: `claim-${pin.engineKey}`, runId: pin.runId, pointer: "/metrics/0", nativeKey: "synthetic.metric",
    scope: structuredClone(riskScope), basis: structuredClone(riskBasis), variant: "base", entityId: "synthetic-entity",
  }));
  const request: RiskRequest = {
    contract: "jenan.risk-decision.request/v1", scope: structuredClone(riskScope),
    policySource: { inputId: riskEvidence.inputId, sourceId: "synthetic-source", versionId: riskEvidence.refId, checksum: digest },
    policy: riskPolicy(), engineSlots: pins.map((pin) => ({ engineKey: pin.engineKey, state: "PINNED", runs: [pin] })),
    claims, scenarios: [],
  };
  const policy = makeInput({ id: riskEvidence.inputId, ref: { system: "DATA_CENTER", id: riskEvidence.refId, version: 1, label: "Synthetic decision policy" }, roles: ["risk.decision-policy"], allowExport: false });
  const inputs = [policy, ...pins.map((pin) => makeEngineRunInput({
    id: `engine:${pin.runId}`, ref: { system: "ANALYSIS_ENGINE", id: pin.runId, version: null, label: `Synthetic ${pin.engineKey}` },
    roles: [`risk.upstream.${pin.engineKey}`], allowExport: false,
  }))];
  const snapshots = pins.map((pin) => {
    const lineage = [makeInput({ allowExport: false })];
    return {
      contract: "jenan.risk-decision.upstream-snapshot/v1" as const, pin,
      projectionVersion: "risk-native-projection-v1/1.0.0" as const,
      claims: [{
        ...structuredClone(claims.find((c) => c.runId === pin.runId)!),
        nativeStatus: "COMPUTED" as const, interpretation: "UPSTREAM_DERIVED" as const,
        value: { kind: "DECIMAL" as const, value: "0", precision: "NATIVE_EXACT" as const },
        evidence: [structuredClone(riskLineageEvidence)], confidence: null, limitations: ["Synthetic local fixture, not authorized production evidence"],
      }],
      lineage, rights: deriveRights(lineage), attribution: deriveAttribution(lineage),
      realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
    };
  });
  return { request, inputs, snapshots, context: structuredClone(riskContext) };
}
export function riskOutcome(state: "SATISFIED" | "NOT_SATISFIED" | "UNKNOWN" | "NOT_APPLICABLE" | "NOT_SUPPORTED" = "SATISFIED", conditionId = "condition-1") {
  return {
    conditionId, state, evidenceState: state === "UNKNOWN" ? "MISSING" as const : state === "NOT_SUPPORTED" ? "NOT_SUPPORTED" as const : "COMPLETE" as const,
    evidence: ["UNKNOWN", "NOT_SUPPORTED"].includes(state) ? [] : [structuredClone(riskEvidence)],
    conflicts: [], limitations: ["Synthetic policy truth-table input, not a claim evaluation"], rationale: "Explicit synthetic outcome",
  };
}
