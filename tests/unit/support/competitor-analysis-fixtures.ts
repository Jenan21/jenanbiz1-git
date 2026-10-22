import {
  COMPETITOR_REQUEST_CONTRACT, type CompetitorEvidence, type CompetitorRequest, type CompetitorConfidenceBasis,
  COMPETITOR_RESULT_CONTRACT, COMPETITOR_VERSION, assessCompetitorCount, classifyCompetitorLocations, competitorConfidencePolicy,
  normalizeCompetitorEvidence, normalizeCompetitorRequest, type CompetitorResult,
  recordReference,
} from "@/services/analysis-engines/competitor-analysis";
import { computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, normalizeGaps } from "@/services/analysis-engines/shared";
import { makeInput } from "./analysis-engine-fixtures";

// Synthetic contracts only: no real competitor dataset or acceptance claim.
export const competitorInstant = "2026-10-22T12:00:00.000Z";
export const competitorValidity = { start: "2026-10-01T00:00:00.000Z", end: null };
export const competitorScope = {
  geography: { countryCode: "SA", authority: "synthetic-register", level: "city", code: "riyadh", version: "1" },
  activity: { taxonomy: "synthetic-activities", id: "coffee-service", version: "1" }, segment: null, asOf: competitorInstant,
};
export const competitorDefinition = { id: "business-control-unit", version: "1" };
export const competitorRef = (sourceRecordId: string) => ({ inputId: "dc:competitor-v1", sourceNamespace: "synthetic-register", sourceRecordId });
export function competitorInput() {
  const input = makeInput({
    id: "dc:competitor-v1", roles: ["competitor.entities", "competitor.locations", "competitor.matching-rules"],
    ref: { system: "DATA_CENTER", id: "competitor-v1", version: 1, label: "Synthetic competitor fixture" },
    source: { name: "Synthetic test source", organization: null, url: null },
  });
  if (input.quality.status === "MEASURED") input.quality.score = 1;
  return input;
}
export function competitorRequest(): CompetitorRequest {
  return {
    contract: COMPETITOR_REQUEST_CONTRACT, scope: structuredClone(competitorScope), competitorDefinition: { ...competitorDefinition },
    analyses: ["COUNTS", "IDENTITY_MATCHING"], countingUnits: ["COMPETITOR_LOCATIONS", "UNIQUE_COMPETITOR_ENTITIES"],
    relationships: ["DIRECT"], activityFilter: "ACTIVE_ONLY",
    data: { roles: { "competitor.locations": [{ versionId: "competitor-v1" }] } },
  };
}
export function competitorEvidence(locationCount = 1): CompetitorEvidence {
  const records = ["entity:chain", "rule:direct", "inventory:all", ...Array.from({ length: locationCount }, (_, i) => `branch:${i}`)];
  return {
    contract: "jenan.competitor-analysis.evidence/v1", inputs: [competitorInput()],
    permissions: [{ inputId: "dc:competitor-v1", analysisUsage: "ALLOWED", policy: { id: "synthetic-usage-policy", version: "1" }, validity: { ...competitorValidity } }],
    sourceRecords: records.map((sourceRecordId) => ({
      ...competitorRef(sourceRecordId), sourceNamespace: "synthetic-register", sourceClaim: "Explicit synthetic test assertion", validity: { ...competitorValidity },
      measurementMethod: "DOCUMENTED", method: { id: "synthetic-register-review", version: "1" },
    })),
    entities: [{
      contract: "jenan.competitor-analysis.entity/v1", competitorEntityId: "entity:chain", definition: { ...competitorDefinition },
      label: "Synthetic chain", identityState: "RESOLVED", identityMethod: "AUTHORITATIVE_IDENTIFIER",
      identityReason: "Explicit controlling-business identifier", evidence: [competitorRef("entity:chain")], limitations: [], validity: { ...competitorValidity },
    }],
    locations: Array.from({ length: locationCount }, (_, i) => ({
      contract: "jenan.competitor-analysis.location/v1", locationId: `location:${i}`, branchId: `branch:${i}`, competitorEntityId: "entity:chain",
      entityLinkState: "RESOLVED", entityLinkEvidence: [competitorRef(`branch:${i}`)],
      geography: structuredClone(competitorScope.geography), activityCodes: ["coffee-service"],
      activityTaxonomy: { id: "synthetic-activities", version: "1" }, activitySpecificity: "SPECIFIC",
      operationalState: "ACTIVE", operationalEvidence: [competitorRef(`branch:${i}`)],
      identityState: "RESOLVED", identityMethod: "AUTHORITATIVE_IDENTIFIER", identityReason: "Explicit stable branch identifier",
      evidence: [competitorRef(`branch:${i}`)], limitations: [], validity: { ...competitorValidity },
    })),
    rules: [{
      rule: { id: "same-service", version: "1" }, targetActivity: { ...competitorScope.activity },
      relationship: "DIRECT", requiredActivityCodes: ["coffee-service"], reason: "Same documented product/service need",
      activityTaxonomy: { id: "synthetic-activities", version: "1" }, criterion: "SAME_NEED",
      evidence: [competitorRef("rule:direct")], limitations: [], validity: { ...competitorValidity },
    }],
  };
}
export function competitorCoverage(locationCount = 1) {
  return {
    contract: "jenan.competitor-analysis.coverage/v1" as const, scope: structuredClone(competitorScope),
    entityDefinition: { ...competitorDefinition }, status: "COMPLETE" as "COMPLETE" | "PARTIAL" | "NONE" | "UNKNOWN",
    inventoryDefinition: { id: "synthetic-inventory", version: "1" },
    evidence: [competitorRef("inventory:all")],
    inventoryLocationIds: Array.from({ length: locationCount }, (_, i) => `location:${i}`),
  };
}
export function competitorBasis(): CompetitorConfidenceBasis {
  return { input: competitorInput(), analysisUsage: "ALLOWED", identity: "RESOLVED", match: "SUPPORTED", coverage: "COMPLETE", method: "DOCUMENTED", provenance: "DOCUMENTED", upstreamConfidence: null };
}
export function competitorEnvelope(): CompetitorResult {
  const evidence = normalizeCompetitorEvidence(competitorEvidence());
  const rawRequest = competitorRequest(); rawRequest.countingUnits = ["COMPETITOR_LOCATIONS"];
  const request = { normalized: normalizeCompetitorRequest(rawRequest, competitorInstant).normalized, evaluatedAt: competitorInstant };
  const coverage = competitorCoverage();
  const outcome = assessCompetitorCount(evidence, request.normalized, coverage, "COMPETITOR_LOCATIONS", competitorInstant);
  const metrics: CompetitorResult["results"][number]["metrics"] = [{
    contract: "jenan.competitor-analysis.metric/v1", key: "competitor.locations.count", label: { ar: "المواقع المنافسة", en: "Competitor locations" },
    status: "COMPUTED", platformState: "COMPUTED", valueKind: "QUANTITY", unit: "quantity", value: outcome.value,
    interpretation: "DERIVED_QUANTITY", inputRefs: ["dc:competitor-v1"], confidence: outcome.confidence, limitations: [],
    method: "Count distinct evidenced locations in the documented inventory",
    semantics: {
      measuredSubject: "COMPETITOR_LOCATIONS", unit: { id: "competitor-locations", version: "1", dimension: "ENTITIES", entity: "COMPETITOR_LOCATIONS", per: null },
      measureKind: "STOCK", evidenceNature: "DERIVED",
      time: { kind: "SNAPSHOT", id: "2026-10-22", date: "2026-10-22", calendar: "GREGORIAN", timeZone: "UTC" },
      dimensions: { geography: competitorScope.geography, sector: { taxonomy: "synthetic-activities", version: "1", code: "coffee-service" },
        cohort: { id: "all", version: "1" }, metricDefinition: { id: "distinct-locations", version: "1" },
        methodology: { id: "competitor-count-semantics", version: "1" }, universe: { id: "synthetic-inventory", version: "1" }, adjustment: "UNADJUSTED" },
    },
    evidenceClass: "DERIVED", countingUnit: "COMPETITOR_LOCATIONS", countBasis: "SCOPED_TOTAL", scope: structuredClone(competitorScope),
    coverageStatus: "COMPLETE", entityRefs: ["entity:chain"], locationRefs: ["location:0"],
    sourceRecordRefs: evidence.sourceRecords.map(recordReference),
    trace: { method: { id: "competitor-count-semantics", version: "1" }, requiredInputIds: ["dc:competitor-v1"] },
  }];
  const gaps = normalizeGaps(evidence.inputs.flatMap(deriveInputGaps));
  const envelope = {
    contract: COMPETITOR_RESULT_CONTRACT, runId: "competitor:synthetic-run", evaluatedAt: competitorInstant,
    engine: { key: "competitor-analysis", version: COMPETITOR_VERSION,
      contracts: { request: COMPETITOR_REQUEST_CONTRACT, result: COMPETITOR_RESULT_CONTRACT },
      environment: "test", policies: [competitorConfidencePolicy] },
    request, inputs: evidence.inputs, evidence, coverage, matches: classifyCompetitorLocations(evidence, competitorScope, competitorInstant),
    results: [{ key: "counts", metrics }],
    dataAvailability: [{ role: "competitor.locations", status: "AVAILABLE", inputIds: ["dc:competitor-v1"] }],
    status: deriveRunStatus(metrics, gaps), gaps, attribution: deriveAttribution(evidence.inputs), rights: deriveRights(evidence.inputs),
    limits: { costUnits: 10, budgetUnits: 1_000 },
    timing: { startedAt: competitorInstant, finishedAt: competitorInstant, durationMs: 0 },
  } satisfies Omit<CompetitorResult, "determinism">;
  return { ...envelope, determinism: computeDeterminism(envelope) };
}
