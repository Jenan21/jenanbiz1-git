import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys, sha256Hex } from "../shared/canonical";
import { deriveAttribution, deriveRights } from "../shared/contracts";
import { financialDiscoverySchema, financialReadSchema, type FinancialDataPort, type FinancialSourceReference } from "./data-port";
import { bindFinancialDataset, financialDatasetSchema, FINANCIAL_MODEL_TYPE_KEY, type FinancialDataset } from "./datasets";
import { financialInputSchema, type FinancialInput } from "./model";
import { ensureFinancialSize, financialBounds, normalizeFinancialRequest, type FinancialRequest } from "./request";

export type FinancialPreparationStatus = "AVAILABLE" | "PARTIAL" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE";
interface ValidatedModel {
  reference: FinancialSourceReference; dataset: FinancialDataset; input: FinancialInput; model: FinancialRequest; contentHash: string;
}
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
function financialInput(reference: FinancialSourceReference, dataset: FinancialDataset) {
  return financialInputSchema.parse({
    id: `dc:${reference.version.versionId}`, roles: [dataset.role], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: reference.version.versionId, version: reference.version.number, label: reference.dataset.title },
    checksum: reference.version.checksum, source: { name: reference.source.name, organization: reference.source.organization, url: reference.source.url },
    ownership: reference.ownership.ownership, license: reference.rights.license, licenseClass: reference.rights.licenseClass, usagePolicy: reference.rights.usagePolicy,
    attribution: { text: reference.rights.attribution.text, required: reference.rights.attribution.required }, allowExport: reference.rights.allowExport,
    completeness: dataset.coverage.completeness, evidenceStatus: reference.version.evidenceStatus, quality: reference.quality,
    freshness: { status: reference.freshness.status, sourcePublishedAt: reference.freshness.sourcePublishedAt, freshnessDays: reference.freshness.freshnessDays, expiresAt: reference.freshness.expiresAt },
    coverage: reference.coverage, limitations: [...new Set(dataset.limitations)].sort(compareText),
  });
}
export async function prepareFinancialData(port: FinancialDataPort, raw: unknown, evaluatedAt: string) {
  const request = normalizeFinancialRequest(raw, evaluatedAt);
  const work = { discoveries: 0, reads: 0, parsedRows: 0 };
  const finish = (status: FinancialPreparationStatus, reason: string, validated: ValidatedModel | null = null) => {
    const inputs = validated ? [validated.input] : [];
    const result = {
      contract: "jenan.financial-feasibility.preparation/v1" as const, version: "1.0.0-m2", evaluatedAt,
      request: { normalized: request.normalized, evaluatedAt }, status, reason, ready: status === "AVAILABLE",
      validated, inputs, rights: deriveRights(inputs), attribution: deriveAttribution(inputs), work: { ...work },
      realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
      limitations: ["Read validation only; no financial calculations, forecasts, investment or financing recommendation."],
    };
    const output = { ...result, determinism: {
      requestHash: request.requestHash, inputsHash: canonicalHash(validated), outputHash: canonicalHash(result),
    } };
    ensureFinancialSize(output); return output;
  };
  const pins = request.normalized.data.versions;
  if (!pins.length) return finish("NOT_AVAILABLE", "EXACT_MODEL_PIN_REQUIRED");
  // v1 binds one approved complete model atomically; it never guesses how to combine conflicting models.
  if (pins.length !== 1) return finish("NOT_COMPUTABLE", "MULTIPLE_MODEL_VERSIONS_UNSUPPORTED");
  const pin = pins[0]!;
  work.discoveries++;
  const parsedDiscovery = financialDiscoverySchema.safeParse(await port.discover({ versionIds: [pin.versionId] }));
  if (!parsedDiscovery.success) return finish("NOT_COMPUTABLE", "DISCOVERY_CONTRACT_INVALID");
  const selection = parsedDiscovery.data;
  if (selection.status !== "FOUND") return finish("NOT_AVAILABLE", "SOURCE_UNAVAILABLE");
  const metadata = selection.candidates[0]?.reference;
  if (!metadata || selection.candidates.length !== 1 || selection.notInForce.length || selection.unavailableVersionIds.length
    || metadata.version.versionId !== pin.versionId) return finish("NOT_COMPUTABLE", "EXACT_SELECTION_INVALID");
  if (metadata.version.checksum.value !== pin.checksum) return finish("NOT_COMPUTABLE", "CHECKSUM_MISMATCH");
  work.reads++;
  const parsedRead = financialReadSchema.safeParse(await port.read({ versionId: pin.versionId, expectedChecksum: pin.checksum }));
  if (!parsedRead.success) return finish("NOT_COMPUTABLE", "READ_CONTRACT_INVALID");
  const data = parsedRead.data;
  if (data.status !== "AVAILABLE") return finish(data.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE",
    data.status === "NOT_AVAILABLE" ? "SOURCE_UNAVAILABLE" : "CHECKSUM_MISMATCH");
  const reference = data.reference;
  if (!same(omitKeys(metadata, ["resolvedAt"]), omitKeys(reference, ["resolvedAt"])) || reference.version.versionId !== pin.versionId
    || reference.version.checksum.value !== pin.checksum || data.integrity.checksum !== pin.checksum) return finish("NOT_COMPUTABLE", "REFERENCE_OR_INTEGRITY_MISMATCH");
  if (reference.dataset.layer !== "DATA" || reference.dataset.typeKey !== FINANCIAL_MODEL_TYPE_KEY || data.contentKind !== "OTHER") return finish("NOT_COMPUTABLE", "MODEL_TYPE_MISMATCH");
  if (reference.version.evidenceStatus !== "VERIFIED" || reference.ownership.ownership === "AI_GENERATED" || reference.version.origin === "AI") return finish("NOT_COMPUTABLE", "SOURCE_APPROVAL_REQUIRED");
  if (!reference.rights.license.trim() || !reference.rights.usagePolicy.trim() || reference.rights.licenseClass === null
    || reference.rights.attribution.required && !reference.rights.attribution.text?.trim()) return finish("NOT_COMPUTABLE", "RIGHTS_INVALID");
  const futureDates = [reference.resolvedAt, reference.version.createdAt, reference.publication.publishedAt, reference.freshness.sourcePublishedAt,
    reference.quality.status === "UNAVAILABLE" ? null : reference.quality.measuredAt];
  if (futureDates.some((date) => date !== null && Date.parse(date) > Date.parse(evaluatedAt))) return finish("NOT_COMPUTABLE", "FUTURE_METADATA");
  if (reference.freshness.status === "EXPIRED"
    || [reference.freshness.expiresAt, reference.freshness.effectiveTo].some((date) => date !== null && Date.parse(date) <= Date.parse(evaluatedAt))
    || reference.freshness.effectiveFrom !== null && Date.parse(reference.freshness.effectiveFrom) > Date.parse(evaluatedAt)) return finish("NOT_COMPUTABLE", "SOURCE_NOT_IN_FORCE");
  let json: unknown;
  try { json = JSON.parse(data.content); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return finish("NOT_COMPUTABLE", "DATASET_JSON_INVALID");
  }
  const parsedDataset = financialDatasetSchema.safeParse(json);
  if (!parsedDataset.success) return finish("NOT_COMPUTABLE", "DATASET_CONTRACT_INVALID");
  const dataset = parsedDataset.data;
  work.parsedRows = dataset.sourceRecords.length + dataset.model.assumptions.length + dataset.model.schedules.reduce((sum, schedule) => sum + schedule.entries.length, 0);
  if (work.parsedRows > financialBounds.rows) throw new RangeError("Combined financial source records/rows exceed 10000");
  if (dataset.sourceId !== reference.source.sourceId) return finish("NOT_COMPUTABLE", "SOURCE_ID_MISMATCH");
  if (dataset.approval.status !== "OWNER_APPROVED" || dataset.model.assumptions.some((assumption) => assumption.approval !== "OWNER_APPROVED")) return finish("NOT_COMPUTABLE", "ASSUMPTION_APPROVAL_REQUIRED");
  if (dataset.approval.approvedAt > evaluatedAt || dataset.sourceRecords.some((record) => record.recordedAt > evaluatedAt)) return finish("NOT_COMPUTABLE", "FUTURE_APPROVAL_OR_RECORD");
  if ([...dataset.model.assumptions, ...dataset.model.scenarios, ...dataset.model.sensitivity].some((entry) => entry.declaredAt > dataset.approval.approvedAt)) return finish("NOT_COMPUTABLE", "APPROVAL_PREDATES_DECLARATIONS");
  if (!same(dataset.model.scope, request.normalized.scope)) return finish("NO_COVERAGE", "GEOGRAPHY_OR_SECTOR_MISMATCH");
  if (!same(dataset.model.basis, request.normalized.basis)) return finish("NOT_COMPUTABLE", "PERIOD_CURRENCY_OR_TIMING_MISMATCH");
  const geography = dataset.model.scope.geography;
  if (reference.coverage === null || !reference.coverage.countryCodes.includes(geography.countryCode)
    || geography.level !== "COUNTRY" && !reference.coverage.regionCodes.includes(geography.code)) return finish("NO_COVERAGE", "SOURCE_GEOGRAPHY_NOT_COVERED");
  let model: FinancialRequest; let input: FinancialInput;
  try {
    model = bindFinancialDataset(dataset, reference, evaluatedAt);
    input = financialInput(reference, dataset);
  } catch (error) {
    if (!(error instanceof z.ZodError) && !(error instanceof RangeError)) throw error;
    return finish("NOT_COMPUTABLE", "FINANCIAL_MODEL_SEMANTICS_INVALID");
  }
  if (!same(model, request.normalized)) return finish("NOT_COMPUTABLE", "PUBLISHED_MODEL_REQUEST_MISMATCH");
  const validated = { reference, dataset, input, model, contentHash: sha256Hex(data.content) };
  if (dataset.coverage.status === "NONE") return finish("NO_COVERAGE", "MODEL_NOT_COVERED", validated);
  const fresh = reference.freshness.status === "FRESH" && reference.freshness.sourcePublishedAt !== null
    && Date.parse(evaluatedAt) - Date.parse(reference.freshness.sourcePublishedAt) <= reference.freshness.freshnessDays * 86_400_000;
  if (dataset.coverage.status !== "COMPLETE" || dataset.coverage.completeness !== "INVENTORY" || !fresh
    || model.assumptions.some((entry) => entry.value === null) || model.schedules.some((entry) => entry.completeness !== "COMPLETE")) return finish("PARTIAL", "MODEL_INPUTS_INCOMPLETE_OR_STALE", validated);
  return finish("AVAILABLE", "EXACT_APPROVED_MODEL_VALIDATED", validated);
}
