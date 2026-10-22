import { vi } from "vitest";
import {
  bindOperationalDataset, OPERATIONAL_MODEL_TYPE_KEY, type OperationalDataPort, type OperationalSourceDataset, type OperationalSourceReference,
} from "@/services/analysis-engines/operational-feasibility";
import { operationalRequest, operationalContext } from "./operational-feasibility-fixtures";

export function operationalDataset(): OperationalSourceDataset {
  const { contract, ...model } = operationalRequest(); void contract;
  model.analyses = ["CAPACITY"];
  const local = { evidence: ["model-record"] };
  return {
    contract: "jenan.operational-feasibility.source-dataset/v1", role: "operational.model", sourceId: "synthetic-operational-source",
    approval: { status: "OWNER_APPROVED", approvedBy: "Synthetic reviewer", approvedAt: "2026-10-03T00:00:00.000Z", rationale: "Synthetic model approval", ...local },
    coverage: { status: "COMPLETE", completeness: "INVENTORY", siteIds: ["site-1"], periodIds: ["p1"], ...local },
    sourceRecords: [{ id: "model-record", reference: "fixture:operational-m2", description: "Explicit synthetic operational plan, not actual output", recordedAt: "2026-10-01T00:00:00.000Z" }],
    model: {
      ...model, values: model.values.map((v) => ({ ...v, ...local })), schedules: model.schedules.map((s) => ({ ...s, ...local })),
      requirements: { ...model.requirements, ...local, entries: [] },
      scenarios: [], sensitivity: [],
    },
    limitations: ["Synthetic source; not real operational acceptance"],
  };
}
export function operationalReference(): OperationalSourceReference {
  return {
    contract: "jenan.data-center.map-reference/v1", resolvedAt: operationalContext.evaluatedAt,
    dataset: { itemId: "operational-item", title: "Synthetic operational model", typeKey: OPERATIONAL_MODEL_TYPE_KEY, layer: "DATA" },
    version: { versionId: "operational-v1", number: 1, checksum: { algorithm: "SHA-256", value: "a".repeat(64) }, createdAt: "2026-10-03T00:00:00.000Z", evidenceStatus: "VERIFIED", origin: "HUMAN", upstreamVersionIds: [] },
    source: { sourceId: "synthetic-operational-source", name: "Synthetic operational source", kind: "OFFICIAL", scope: "PLATFORM", organization: null, url: null },
    ownership: { ownership: "THIRD_PARTY", owner: "Synthetic owner" },
    rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic governed use only", allowRetrieval: true, allowExport: false,
      attribution: { text: "Synthetic operational evidence", required: true, level: "SOURCE" } },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    quality: { status: "UNAVAILABLE" },
    confidence: { score: 50, policyVersion: "dc-v1", evaluatedAt: operationalContext.evaluatedAt, heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-10-03T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null },
    publication: { status: "PUBLISHED", publishedVersion: 1, publishedAt: "2026-10-03T00:00:00.000Z" },
  };
}
export function operationalPortFixture() {
  const dataset = operationalDataset(); const reference = operationalReference();
  const request = bindOperationalDataset(dataset, reference, operationalContext.evaluatedAt);
  const discover = vi.fn<OperationalDataPort["discover"]>(async () => ({
    mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "FOUND",
    candidates: [{ reference: structuredClone(reference) }], selected: null, unavailableVersionIds: [], notInForce: [], truncated: false,
  }));
  const read = vi.fn<OperationalDataPort["read"]>(async () => ({
    status: "AVAILABLE", reference: structuredClone(reference), content: JSON.stringify(dataset), contentKind: "OTHER",
    integrity: { algorithm: "SHA-256", checksum: reference.version.checksum.value, recomputed: true },
  }));
  return { dataset, reference, request, discover, read, port: { discover, read } satisfies OperationalDataPort };
}
