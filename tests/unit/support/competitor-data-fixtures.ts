import { vi } from "vitest";
import {
  type CompetitorDataPort, type CompetitorDataset, type CompetitorDatasetRole, type CompetitorSourceReference,
  type SourceRecordRef, typeKeyByCompetitorRole,
} from "@/services/analysis-engines/competitor-analysis";
import { competitorCoverage, competitorDefinition, competitorEvidence, competitorInstant, competitorScope, competitorValidity } from "./competitor-analysis-fixtures";

// Synthetic Data Center DTOs only. Production checksum verification is tested against PostgreSQL separately.
export const competitorVersionIds = {
  "competitor.entities": "entities-1", "competitor.locations": "locations-1", "competitor.matching-rules": "rules-1",
  "competitor.dimensions": "dimensions-1", "competitor.attributes": "attributes-1", "competitor.identity-links": "links-1",
} as const;
export const selfRef = (sourceRecordId: string): SourceRecordRef => ({ inputId: "SELF", sourceNamespace: "synthetic-register", sourceRecordId });
export function competitorDataset(role: CompetitorDatasetRole, size = 1): CompetitorDataset {
  const evidence = competitorEvidence(size);
  const common = {
    sourceId: "synthetic-source",
    sourceRecords: evidence.sourceRecords.map((record) => ({ ...record, inputId: "SELF" })),
    coverage: { geographies: [structuredClone(competitorScope.geography)], activities: [structuredClone(competitorScope.activity)], entityDefinitions: [structuredClone(competitorDefinition)],
      segments: [null], validity: { ...competitorValidity }, completeness: "INVENTORY" as const },
    limitations: ["Synthetic source; not real competitor acceptance"],
  };
  if (role === "competitor.entities") return {
    ...common, role, contract: "jenan.competitor.entities/v1",
    rows: evidence.entities.map((row) => ({ ...row, evidence: row.evidence.map((ref) => selfRef(ref.sourceRecordId)) })),
  };
  if (role === "competitor.locations") return {
    ...common, role, contract: "jenan.competitor.locations/v1",
    rows: evidence.locations.map((row) => ({ ...row, evidence: row.evidence.map((ref) => selfRef(ref.sourceRecordId)),
      entityLinkEvidence: row.entityLinkEvidence.map((ref) => selfRef(ref.sourceRecordId)), operationalEvidence: row.operationalEvidence.map((ref) => selfRef(ref.sourceRecordId)) })),
    inventory: { ...competitorCoverage(size), evidence: [selfRef("inventory:all")] },
  };
  if (role === "competitor.matching-rules") return {
    ...common, role, contract: "jenan.competitor.matching-rules/v1",
    rows: evidence.rules.map((row) => ({ ...row, evidence: row.evidence.map((ref) => selfRef(ref.sourceRecordId)) })),
  };
  if (role === "competitor.dimensions") return {
    ...common, role, contract: "jenan.competitor.dimensions/v1", rows: [
      { kind: "GEOGRAPHY", definition: structuredClone(competitorScope.geography) }, { kind: "ACTIVITY", definition: structuredClone(competitorScope.activity) },
      { kind: "ENTITY_DEFINITION", definition: structuredClone(competitorDefinition) },
    ],
  };
  if (role === "competitor.attributes") return {
    ...common, role, contract: "jenan.competitor.attributes/v1",
    rows: [{ id: "capacity", subjectKind: "LOCATION", subjectId: "location:0", definition: { id: "documented-capacity", version: "1" },
      unit: { id: "seats", version: "1" }, scope: structuredClone(competitorScope), value: 10, evidenceClass: "OBSERVED",
      evidence: [selfRef("branch:0")], validity: { ...competitorValidity }, limitations: [] }],
  };
  return { ...common, role, contract: "jenan.competitor.identity-links/v1", rows: [] };
}
export function competitorReference(role: CompetitorDatasetRole, versionId: string = competitorVersionIds[role]): CompetitorSourceReference {
  return {
    contract: "jenan.data-center.map-reference/v1", resolvedAt: competitorInstant,
    dataset: { itemId: `item-${versionId}`, title: "Synthetic competitor fixture", typeKey: typeKeyByCompetitorRole[role], layer: "DATA" },
    version: { versionId, number: 1, checksum: { algorithm: "SHA-256", value: "a".repeat(64) }, createdAt: "2026-10-01T00:00:00.000Z", evidenceStatus: "VERIFIED", origin: "HUMAN", upstreamVersionIds: [] },
    source: { sourceId: "synthetic-source", name: "Synthetic authority", kind: "OFFICIAL", scope: "PLATFORM", organization: null, url: null },
    ownership: { ownership: "THIRD_PARTY", owner: "Synthetic authority" },
    rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Credit required", allowRetrieval: true, allowExport: false,
      attribution: { text: "Synthetic fixture credit", required: true, level: "SOURCE" } },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    quality: { status: "MEASURED", score: 1, method: "synthetic-check", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "Synthetic only" },
    confidence: { score: 80, policyVersion: "dc-policy-v1", evaluatedAt: competitorInstant, heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-10-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null },
    publication: { status: "PUBLISHED", publishedVersion: 1, publishedAt: "2026-10-01T00:00:00.000Z" },
  };
}
export function competitorPortFixture(size = 1) {
  const roles: CompetitorDatasetRole[] = ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"];
  const versions = new Map(roles.map((role) => [competitorVersionIds[role] as string, { reference: competitorReference(role), content: JSON.stringify(competitorDataset(role, size)) }]));
  const discover = vi.fn<CompetitorDataPort["discover"]>(async (query) => {
    const exact = !!query.versionIds;
    const candidates = [...versions.values()].filter(({ reference }) => exact ? query.versionIds!.includes(reference.version.versionId)
      : query.typeKeys!.includes(reference.dataset.typeKey)).sort((a, b) => a.reference.version.versionId < b.reference.version.versionId ? -1 : 1).map(({ reference }) => ({ reference: structuredClone(reference) }));
    return { mode: exact ? "EXACT" : "BY_TYPE", policy: exact ? "exact-version" : "dc-version-selection-v1", asOf: query.asOf ?? null, asOfExplicit: !!query.asOf,
      status: candidates.length ? "FOUND" : "NOT_AVAILABLE", candidates, selected: exact ? null : candidates[0] ?? null,
      unavailableVersionIds: (query.versionIds ?? []).filter((id) => !versions.has(id)), notInForce: [], truncated: false };
  });
  const read = vi.fn<CompetitorDataPort["read"]>(async (query) => {
    const version = versions.get(query.versionId);
    if (!version) return { status: "NOT_AVAILABLE" };
    if (query.expectedChecksum !== version.reference.version.checksum.value) return { status: "INTEGRITY_ERROR" };
    return { status: "AVAILABLE", reference: structuredClone(version.reference), content: version.content, contentKind: "OTHER",
      integrity: { algorithm: "SHA-256", checksum: version.reference.version.checksum.value, recomputed: true } };
  });
  const port: CompetitorDataPort = { discover, read };
  return { versions, discover, read, port };
}
