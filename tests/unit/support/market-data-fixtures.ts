import { vi } from "vitest";
import {
  type MarketDataset, type MarketDatasetRole, type MarketDataPort, type MarketDiscoveryQuery,
  type MarketSourceReference, type MarketRead, typeKeyByMarketRole,
} from "@/services/analysis-engines/market-demand";
import { marketInstant, marketObservation, laterObservation } from "./market-demand-fixtures";

// Synthetic contract/port fixtures only; these are not real demand evidence.
export function marketDataset(role: MarketDatasetRole = "demand.observations"): MarketDataset {
  const rows = [marketObservation(), laterObservation()].map((row) => ({
    id: row.ref.observationId, subject: row.subject, semantics: row.semantics, status: row.status, value: row.value,
    geographicCoverage: row.geographicCoverage, temporalCoverage: row.temporalCoverage, measurementMethod: row.measurementMethod,
    method: row.method, limitations: row.limitations, sourceRefs: [{ observationId: row.ref.observationId }], assumptions: [],
  }));
  const semantics = rows[0]!.semantics;
  const coverage = {
    geographies: [semantics.dimensions.geography], sectors: [semantics.dimensions.sector], cohorts: [semantics.dimensions.cohort],
    periods: rows.map((row) => row.semantics.time), completeness: "INVENTORY" as const,
  };
  if (role === "dimensions.dictionary") return {
    contract: "jenan.market.dimensions/v1", role, declares: "DIMENSION_DEFINITIONS", coverage,
    definitions: [{ metricDefinition: semantics.dimensions.metricDefinition, subject: rows[0]!.subject, unit: semantics.unit, measureKind: semantics.measureKind, methodology: semantics.dimensions.methodology }],
  };
  if (role === "demand.assumptions") return {
    contract: "jenan.market.assumptions/v1", role, declares: "EXPLICIT_ASSUMPTIONS", coverage,
    rows: [{
      id: "adoption", kind: "ADOPTION_FRACTION", value: 0.3,
      unit: { id: "adoption-share", version: "1", dimension: "FRACTION", entity: "defined-cohort", per: null },
      time: semantics.time, dimensions: semantics.dimensions, evidenceNature: "ESTIMATE", method: "Explicit surveyed-cohort assumption",
      sourceRefs: [{ observationId: "adoption" }], assumptions: [{ id: "declared-adoption", description: "Synthetic assumption", sourceRefs: [{ observationId: "adoption" }] }],
      limitations: ["Synthetic fixture, not actual demand"],
    }],
  };
  if (role === "context.indicators") return {
    contract: "jenan.market.context/v1", role, declares: "CONTEXT_ONLY", coverage: {
      ...coverage, periods: [{ kind: "SNAPSHOT", id: "2026-08", date: "2026-08-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }],
    },
    rows: [{
      ...rows[0]!, subject: "population_count",
      semantics: { ...semantics, measuredSubject: "population_count", measureKind: "STOCK", time: { kind: "SNAPSHOT", id: "2026-08", date: "2026-08-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
        unit: { id: "people", version: "1", dimension: "PEOPLE", entity: "population_count", per: null } },
    }],
  };
  return { contract: "jenan.market.observations/v1", role, declares: "ACTUAL_DEMAND_MEASUREMENTS", coverage, rows };
}
export function marketReference(versionId = "version-1", role: MarketDatasetRole = "demand.observations"): MarketSourceReference {
  return {
    contract: "jenan.data-center.map-reference/v1", resolvedAt: marketInstant,
    dataset: { itemId: `item-${versionId}`, title: "Synthetic market contract fixture", typeKey: typeKeyByMarketRole[role], layer: "DATA" },
    version: { versionId, number: 1, checksum: { algorithm: "SHA-256", value: "a".repeat(64) }, createdAt: "2026-10-01T00:00:00.000Z", evidenceStatus: "VERIFIED", origin: "HUMAN", upstreamVersionIds: [] },
    source: { sourceId: `source-${versionId}`, name: "Synthetic authority", kind: "OFFICIAL", scope: "PLATFORM", organization: null, url: null },
    ownership: { ownership: "THIRD_PARTY", owner: "Synthetic authority" },
    rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Credit required", allowRetrieval: true, allowExport: false,
      attribution: { text: "Synthetic fixture credit", required: true, level: "SOURCE" } },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    quality: { status: "UNAVAILABLE" },
    confidence: { score: 80, policyVersion: "dc-policy-v1", evaluatedAt: marketInstant, heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-10-01T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null },
    publication: { status: "PUBLISHED", publishedVersion: 1, publishedAt: "2026-10-01T00:00:00.000Z" },
  };
}
export function marketPortFixture() {
  const versions = new Map<string, { reference: MarketSourceReference; content: string }>([
    ["version-1", { reference: marketReference(), content: JSON.stringify(marketDataset()) }],
    ["dictionary-1", { reference: marketReference("dictionary-1", "dimensions.dictionary"), content: JSON.stringify(marketDataset("dimensions.dictionary")) }],
  ]);
  const discover = vi.fn(async (query: MarketDiscoveryQuery) => {
    const exact = !!query.versionIds;
    const candidates = [...versions.values()].filter(({ reference }) => exact
      ? query.versionIds!.includes(reference.version.versionId)
      : query.typeKeys!.includes(reference.dataset.typeKey)).map(({ reference }) => ({ reference: structuredClone(reference) }));
    return {
      mode: exact ? "EXACT" as const : "BY_TYPE" as const, policy: exact ? "exact-version" : "dc-version-selection-v1",
      asOf: query.asOf ?? null, asOfExplicit: !!query.asOf, status: candidates.length ? "FOUND" as const : "NOT_AVAILABLE" as const,
      candidates, selected: exact ? null : candidates[0] ?? null, unavailableVersionIds: (query.versionIds ?? []).filter((id) => !versions.has(id)), notInForce: [], truncated: false,
    };
  });
  const read = vi.fn(async (query: { versionId: string; expectedChecksum: string }): Promise<MarketRead> => {
    const version = versions.get(query.versionId);
    if (!version) return { status: "NOT_AVAILABLE" };
    if (query.expectedChecksum !== version.reference.version.checksum.value) return { status: "INTEGRITY_ERROR" };
    return { status: "AVAILABLE", reference: structuredClone(version.reference), content: version.content, contentKind: "OTHER", integrity: { algorithm: "SHA-256", checksum: version.reference.version.checksum.value, recomputed: true } };
  });
  const port: MarketDataPort = { discover, read };
  return { port, versions, discover, read };
}
