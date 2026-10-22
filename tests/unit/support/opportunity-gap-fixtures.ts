import {
  buildOpportunityFoundationResult, OPPORTUNITY_REQUEST_CONTRACT, type OpportunityConfidenceBasis,
  type OpportunityEvidence, type OpportunityFact, type OpportunityRequest,
} from "@/services/analysis-engines/opportunity-gap";
import { evaluatedAt, makeInput } from "./analysis-engine-fixtures";

export const opportunityScope: OpportunityRequest["scope"] = {
  time: { kind: "INTERVAL", id: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
  dimensions: {
    geography: { countryCode: "SA", authority: "test-boundaries", level: "city", code: "riyadh", version: "1" },
    sector: { taxonomy: "test-sector", version: "1", code: "clinic" },
    cohort: { id: "eligible", version: "1" }, metricDefinition: { id: "consultations", version: "1" },
    methodology: { id: "test-measurement", version: "1" }, universe: { id: "eligible-residents", version: "1" }, adjustment: "none",
  },
};
export function opportunityRequest(): OpportunityRequest {
  return {
    contract: OPPORTUNITY_REQUEST_CONTRACT, scope: structuredClone(opportunityScope),
    definition: {
      measuredSubject: "consultations", unit: { id: "consultations", version: "1", dimension: "EVENTS", entity: "consultation", per: null }, measureKind: "FLOW",
    },
    analyses: ["DATA_COVERAGE", "DEMAND_SUPPLY_GAP"],
    data: { roles: [
      { role: "need.observations", versionId: "need-v1", checksum: "a".repeat(64) },
      { role: "supply.capacity", versionId: "capacity-v1", checksum: "b".repeat(64) },
    ] }, benchmarkPolicy: null, signalPolicy: null, historical: null,
  };
}
export function opportunityFact(role: OpportunityFact["role"] = "need.observations"): OpportunityFact {
  const request = opportunityRequest();
  const versionId = role === "need.observations" ? "need-v1" : role === "supply.capacity" ? "capacity-v1" : `${role}-v1`;
  const ref = { inputId: `dc:${versionId}`, versionId, checksum: (role === "supply.capacity" ? "b" : "a").repeat(64), sourceRecordId: "row-1" };
  const boundary: Record<OpportunityFact["role"], OpportunityFact["measurementBoundary"]> = {
    "need.observations": "TOTAL_NEED", "supply.capacity": "SERVICEABLE_CAPACITY", "provision.observations": "MEASURED_PROVISION",
    "benchmarks.targets": "NORMATIVE_TARGET", "context.indicators": "CONTEXT_ONLY", "dimensions.dictionary": "CONTEXT_ONLY",
  };
  return {
    contract: "jenan.opportunity-gap.fact/v1", id: `fact:${versionId}`, role, measurementBoundary: boundary[role],
    evidenceClass: role === "benchmarks.targets" ? "NORMATIVE" : role === "context.indicators" || role === "dimensions.dictionary" ? "CONTEXTUAL" : "OBSERVED",
    value: role === "need.observations" ? 100 : 60,
    semantics: { ...request.definition, ...request.scope, evidenceNature: role === "benchmarks.targets" ? "DERIVED" : "OBSERVATION" },
    coverage: "COMPLETE", method: { id: "test-measurement", version: "1", description: "Synthetic documented measurement, not real acceptance" },
    evidence: [ref], limitations: [],
    benchmark: role === "benchmarks.targets" ? {
      policy: { id: "test-benchmark", version: "1" }, authority: "Synthetic test authority", justification: "Test target only",
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z", scope: structuredClone(request.scope), source: ref,
    } : null,
  };
}
export function opportunityEvidence(): OpportunityEvidence {
  const facts = [opportunityFact(), opportunityFact("supply.capacity")];
  return {
    facts,
    inputs: facts.map((fact) => {
      const ref = fact.evidence[0]!;
      return makeInput({
        id: ref.inputId, roles: [fact.role], ref: { system: "DATA_CENTER", id: ref.versionId, version: 1, label: "Synthetic Opportunity fixture" },
        checksum: { algorithm: "SHA-256", value: ref.checksum },
        quality: { status: "MEASURED", score: 1, method: "test", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "Synthetic" },
      });
    }),
  };
}
export function opportunityBasis(): OpportunityConfidenceBasis {
  return {
    input: opportunityEvidence().inputs[0]!, analysisUsage: "ALLOWED", measurement: "DOCUMENTED", comparability: "EXACT",
    coverage: "COMPLETE", provenance: "DOCUMENTED", applicability: "DOCUMENTED", operandConfidence: null,
  };
}
export const opportunityContext = {
  runId: "opportunity-m1-test", evaluatedAt, environment: "test" as const,
  timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
};
export const opportunityResult = () => buildOpportunityFoundationResult(opportunityRequest(), opportunityEvidence(), opportunityContext);
