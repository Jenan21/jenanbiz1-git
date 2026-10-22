import { vi } from "vitest";
import {
  type OpportunityDataPort, type OpportunityDataset, type OpportunityDatasetRole, type OpportunitySourceReference, typeKeyByOpportunityRole,
} from "@/services/analysis-engines/opportunity-gap";
import { evaluatedAt } from "./analysis-engine-fixtures";
import { opportunityFact, opportunityRequest } from "./opportunity-gap-fixtures";

export function opportunityDataset(role: OpportunityDatasetRole = "need.observations"): OpportunityDataset {
  const fact = opportunityFact(role);
  return {
    contract: "jenan.opportunity-gap.dataset/v1", sourceId: "synthetic-source", role,
    scope: structuredClone(opportunityRequest().scope), definition: structuredClone(opportunityRequest().definition),
    coverage: { status: "COMPLETE", completeness: "INVENTORY", evidence: ["row-1"] },
    sourceRecords: [{ id: "row-1", reference: "synthetic:test-register/row-1", description: "Synthetic evidence, not real acceptance", recordedAt: "2026-10-01T00:00:00.000Z" }],
    rows: [{ ...fact, id: "fact-1", evidence: ["row-1"], benchmark: fact.benchmark ? { ...fact.benchmark, source: "row-1" } : null }],
    limitations: ["Synthetic dataset only"],
  };
}
export function opportunityReference(role: OpportunityDatasetRole = "need.observations", versionId = role === "need.observations" ? "need-v1" : "capacity-v1"): OpportunitySourceReference {
  return {
    contract: "jenan.data-center.map-reference/v1", resolvedAt: evaluatedAt,
    dataset: { itemId: `item-${versionId}`, title: "Synthetic Opportunity fixture", typeKey: typeKeyByOpportunityRole[role], layer: "DATA" },
    version: { versionId, number: 1, checksum: { algorithm: "SHA-256", value: (role === "supply.capacity" ? "b" : "a").repeat(64) },
      createdAt: "2026-10-01T00:00:00.000Z", evidenceStatus: "VERIFIED", origin: "HUMAN", upstreamVersionIds: [] },
    source: { sourceId: "synthetic-source", name: "Synthetic authority", kind: "OFFICIAL", scope: "PLATFORM", organization: null, url: null },
    ownership: { ownership: "THIRD_PARTY", owner: "Synthetic test authority" },
    rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Credit required", allowRetrieval: true, allowExport: false,
      attribution: { text: "Synthetic Opportunity credit", required: true, level: "SOURCE" } },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    quality: { status: "MEASURED", score: 1, method: "synthetic-check", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "Synthetic only" },
    confidence: { score: 80, policyVersion: "dc-policy-v1", evaluatedAt, heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-10-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null },
    publication: { status: "PUBLISHED", publishedVersion: 1, publishedAt: "2026-10-01T00:00:00.000Z" },
  };
}
export function opportunityPortFixture() {
  const roles: OpportunityDatasetRole[] = ["need.observations", "supply.capacity"];
  const versions = new Map<string, { reference: OpportunitySourceReference; content: string }>(roles.map((role) => {
    const reference = opportunityReference(role);
    return [reference.version.versionId, { reference, content: JSON.stringify(opportunityDataset(role)) }] as const;
  }));
  const discover = vi.fn<OpportunityDataPort["discover"]>(async (query) => {
    const candidates = [...versions.values()].filter((entry) => query.versionIds.includes(entry.reference.version.versionId)).map((entry) => ({ reference: structuredClone(entry.reference) }));
    return { mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: candidates.length ? "FOUND" : "NOT_AVAILABLE",
      candidates, selected: null, unavailableVersionIds: query.versionIds.filter((id) => !versions.has(id)), notInForce: [], truncated: false };
  });
  const read = vi.fn<OpportunityDataPort["read"]>(async (query) => {
    const value = versions.get(query.versionId);
    if (!value) return { status: "NOT_AVAILABLE" };
    if (query.expectedChecksum !== value.reference.version.checksum.value) return { status: "INTEGRITY_ERROR" };
    return { status: "AVAILABLE", reference: structuredClone(value.reference), content: value.content, contentKind: "OTHER",
      integrity: { algorithm: "SHA-256", checksum: value.reference.version.checksum.value, recomputed: true } };
  });
  return { versions, discover, read, port: { discover, read } satisfies OpportunityDataPort };
}
