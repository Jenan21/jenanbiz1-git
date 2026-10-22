import { vi } from "vitest";
import {
  bindFinancialDataset, FINANCIAL_MODEL_TYPE_KEY, type FinancialDataPort, type FinancialDataset, type FinancialSourceReference,
} from "@/services/analysis-engines/financial-feasibility";
import { financialRequest } from "./financial-feasibility-fixtures";
import { evaluatedAt } from "./analysis-engine-fixtures";

export function financialDataset(): FinancialDataset {
  const { contract, data, ...request } = financialRequest();
  void contract; void data;
  const local = { evidence: ["model-record"] };
  return {
    contract: "jenan.financial-feasibility.dataset/v1", role: "financial.model-assumptions", sourceId: "synthetic-financial-source",
    approval: { status: "OWNER_APPROVED", approvedBy: "Synthetic owner approval", approvedAt: "2026-10-02T00:00:00.000Z", rationale: "Synthetic approval only", ...local },
    coverage: { status: "COMPLETE", completeness: "INVENTORY", ...local },
    sourceRecords: [{ id: "model-record", reference: "fixture:financial-m2", description: "Synthetic explicit assumptions; not real financial data", recordedAt: "2026-10-01T00:00:00.000Z" }],
    model: {
      ...request,
      assumptions: request.assumptions.map((entry) => ({ ...entry, ...local })),
      schedules: request.schedules.map((entry) => ({ ...entry, ...local })),
      scenarios: request.scenarios.map((entry) => ({ ...entry, ...local })),
      sensitivity: request.sensitivity.map((entry) => ({ ...entry, ...local })),
    },
    limitations: ["Synthetic financial model; not production acceptance"],
  };
}
export function financialReference(): FinancialSourceReference {
  return {
    contract: "jenan.data-center.map-reference/v1", resolvedAt: evaluatedAt,
    dataset: { itemId: "financial-item", title: "Synthetic financial model", typeKey: FINANCIAL_MODEL_TYPE_KEY, layer: "DATA" },
    version: { versionId: "financial-v1", number: 1, checksum: { algorithm: "SHA-256", value: "a".repeat(64) }, createdAt: "2026-10-02T00:00:00.000Z", evidenceStatus: "VERIFIED", origin: "HUMAN", upstreamVersionIds: [] },
    source: { sourceId: "synthetic-financial-source", name: "Synthetic financial source", kind: "OFFICIAL", scope: "PLATFORM", organization: null, url: null },
    ownership: { ownership: "THIRD_PARTY", owner: "Synthetic owner" },
    rights: { license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Synthetic acceptance only; credit required", allowRetrieval: true, allowExport: false,
      attribution: { text: "Synthetic financial fixture", required: true, level: "SOURCE" } },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: null },
    quality: { status: "UNAVAILABLE" },
    confidence: { score: 50, policyVersion: "dc-v1", evaluatedAt, heuristic: true },
    freshness: { status: "FRESH", freshnessDays: 365, sourcePublishedAt: "2026-10-02T00:00:00.000Z", expiresAt: null, effectiveFrom: null, effectiveTo: null },
    publication: { status: "PUBLISHED", publishedVersion: 1, publishedAt: "2026-10-02T00:00:00.000Z" },
  };
}
export function financialPortFixture() {
  const reference = financialReference(); const dataset = financialDataset();
  const request = bindFinancialDataset(dataset, reference, evaluatedAt);
  const discover = vi.fn<FinancialDataPort["discover"]>(async () => ({
    mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "FOUND",
    candidates: [{ reference: structuredClone(reference) }], selected: null, unavailableVersionIds: [], notInForce: [], truncated: false,
  }));
  const read = vi.fn<FinancialDataPort["read"]>(async () => ({
    status: "AVAILABLE", reference: structuredClone(reference), content: JSON.stringify(dataset), contentKind: "OTHER",
    integrity: { algorithm: "SHA-256", checksum: reference.version.checksum.value, recomputed: true },
  }));
  return { dataset, reference, request, discover, read, port: { discover, read } satisfies FinancialDataPort };
}
