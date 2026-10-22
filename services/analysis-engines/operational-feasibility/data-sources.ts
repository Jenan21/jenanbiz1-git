import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys, sha256Hex } from "../shared/canonical";
import { deriveAttribution, deriveRights } from "../shared/contracts";
import { operationalDiscoverySchema, operationalReadSchema, type OperationalDataPort, type OperationalSourceReference } from "./data-port";
import { bindOperationalDataset, OPERATIONAL_MODEL_TYPE_KEY, operationalPreparationRequestSchema, operationalSourceDatasetSchema, type OperationalSourceDataset } from "./datasets";
import { operationalInputSchema, type OperationalInput, type OperationalRequest } from "./model";
import { ensureOperationalSize, normalizeOperationalRequest, operationalBounds } from "./request";
import { buildOperationalFoundationResult } from "./contracts";

export type OperationalPreparationStatus = "AVAILABLE" | "PARTIAL" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE" | "NOT_SUPPORTED";
interface ValidatedModel {
  reference: OperationalSourceReference; dataset: OperationalSourceDataset; input: OperationalInput;
  model: OperationalRequest; contentHash: string;
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
function inputFrom(reference: OperationalSourceReference, dataset: OperationalSourceDataset) {
  return operationalInputSchema.parse({
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
export async function prepareOperationalData(port: OperationalDataPort, raw: unknown, evaluatedAt: string) {
  ensureOperationalSize(raw);
  const parsed = operationalPreparationRequestSchema.parse(raw);
  const normalized = normalizeOperationalRequest(parsed.model, evaluatedAt).normalized;
  const request = { model: normalized, source: parsed.source, evaluatedAt };
  const work = { discoveries: 0, reads: 0, parsedRows: 0 };
  const finish = (status: OperationalPreparationStatus, reason: string, validated: ValidatedModel | null = null) => {
    const inputs = validated ? [validated.input] : [];
    const core = {
      contract: "jenan.operational-feasibility.preparation/v1" as const, version: "1.0.0-m2", request, evaluatedAt,
      status, reason, ready: status === "AVAILABLE", validated, inputs, rights: deriveRights(inputs), attribution: deriveAttribution(inputs),
      work: { ...work }, realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
      limitations: ["Exact governed read validation only; no operational calculation, score, success probability or launch recommendation."],
    };
    const output = { ...core, determinism: { requestHash: canonicalHash(request), inputsHash: canonicalHash(validated), outputHash: canonicalHash(core) } };
    ensureOperationalSize(output); return output;
  };
  const pin = parsed.source;
  work.discoveries++;
  const discovery = operationalDiscoverySchema.safeParse(await port.discover({ versionIds: [pin.versionId] }));
  if (!discovery.success) return finish("NOT_COMPUTABLE", "DISCOVERY_CONTRACT_INVALID");
  if (discovery.data.status !== "FOUND") return finish("NOT_AVAILABLE", "SOURCE_UNAVAILABLE");
  const metadata = discovery.data.candidates[0]?.reference;
  if (!metadata || discovery.data.candidates.length !== 1 || discovery.data.notInForce.length || discovery.data.unavailableVersionIds.length
    || metadata.version.versionId !== pin.versionId) return finish("NOT_COMPUTABLE", "EXACT_SELECTION_INVALID");
  if (metadata.source.sourceId !== pin.sourceId) return finish("NOT_COMPUTABLE", "SOURCE_ID_MISMATCH");
  if (metadata.version.checksum.value !== pin.checksum) return finish("NOT_COMPUTABLE", "CHECKSUM_MISMATCH");
  work.reads++;
  const read = operationalReadSchema.safeParse(await port.read({ versionId: pin.versionId, expectedChecksum: pin.checksum }));
  if (!read.success) return finish("NOT_COMPUTABLE", "READ_CONTRACT_INVALID");
  const data = read.data;
  if (data.status !== "AVAILABLE") return finish(data.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE", data.status === "NOT_AVAILABLE" ? "SOURCE_UNAVAILABLE" : "CHECKSUM_MISMATCH");
  const reference = data.reference;
  if (!same(omitKeys(metadata, ["resolvedAt"]), omitKeys(reference, ["resolvedAt"])) || data.integrity.checksum !== pin.checksum) return finish("NOT_COMPUTABLE", "REFERENCE_OR_INTEGRITY_MISMATCH");
  if (reference.dataset.typeKey !== OPERATIONAL_MODEL_TYPE_KEY || reference.dataset.layer !== "DATA" || data.contentKind !== "OTHER") return finish("NOT_COMPUTABLE", "MODEL_TYPE_MISMATCH");
  if (reference.version.evidenceStatus !== "VERIFIED" || reference.version.origin === "AI" || reference.ownership.ownership === "AI_GENERATED" || !reference.ownership.owner.trim()) return finish("NOT_COMPUTABLE", "SOURCE_APPROVAL_REQUIRED");
  if (!reference.rights.license.trim() || reference.rights.licenseClass === null || !reference.rights.usagePolicy.trim()
    || reference.rights.attribution.required && !reference.rights.attribution.text?.trim()) return finish("NOT_COMPUTABLE", "RIGHTS_INVALID");
  const dates = [metadata.resolvedAt, reference.resolvedAt, reference.version.createdAt, reference.publication.publishedAt,
    reference.freshness.sourcePublishedAt, reference.confidence.evaluatedAt, reference.quality.status === "UNAVAILABLE" ? null : reference.quality.measuredAt];
  if (dates.some((date) => date !== null && Date.parse(date) > Date.parse(evaluatedAt))) return finish("NOT_COMPUTABLE", "FUTURE_METADATA");
  if (reference.freshness.status === "EXPIRED"
    || [reference.freshness.expiresAt, reference.freshness.effectiveTo].some((date) => date !== null && Date.parse(date) <= Date.parse(evaluatedAt))
    || reference.freshness.effectiveFrom !== null && Date.parse(reference.freshness.effectiveFrom) > Date.parse(evaluatedAt)) return finish("NOT_COMPUTABLE", "SOURCE_NOT_IN_FORCE");
  let json: unknown;
  try { json = JSON.parse(data.content); } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return finish("NOT_COMPUTABLE", "DATASET_JSON_INVALID");
  }
  const datasetResult = operationalSourceDatasetSchema.safeParse(json);
  if (!datasetResult.success) return finish("NOT_COMPUTABLE", "DATASET_CONTRACT_INVALID");
  const dataset = datasetResult.data;
  work.parsedRows = dataset.sourceRecords.length + dataset.model.values.length + dataset.model.schedules.reduce((n, s) => n + s.rows.length, 0) + dataset.model.requirements.entries.length;
  if (work.parsedRows > operationalBounds.expandedRows) throw new RangeError("Combined operational source records/rows exceed 10000");
  if (dataset.sourceId !== pin.sourceId) return finish("NOT_COMPUTABLE", "SOURCE_ID_MISMATCH");
  if (dataset.approval.status !== "OWNER_APPROVED" || dataset.model.values.some((v) => v.approval !== "OWNER_APPROVED")) return finish("NOT_COMPUTABLE", "ASSUMPTION_APPROVAL_REQUIRED");
  if (dataset.approval.approvedAt > evaluatedAt || dataset.sourceRecords.some((r) => r.recordedAt > evaluatedAt)) return finish("NOT_COMPUTABLE", "FUTURE_APPROVAL_OR_RECORD");
  if ([...dataset.model.values, ...dataset.model.scenarios, ...dataset.model.sensitivity].some((v) => v.declaredAt > dataset.approval.approvedAt)
    || dataset.model.values.some((v) => v.approvedAt !== null && v.approvedAt > dataset.approval.approvedAt)
    || dataset.sourceRecords.some((r) => r.recordedAt > dataset.approval.approvedAt)) return finish("NOT_COMPUTABLE", "APPROVAL_PREDATES_DECLARATIONS");
  if (!same(dataset.model.scope, normalized.scope)) return finish("NO_COVERAGE", "GEOGRAPHY_OR_SECTOR_MISMATCH");
  if (dataset.model.siteId !== normalized.siteId || !dataset.coverage.siteIds.includes(normalized.siteId)) return finish("NO_COVERAGE", "SITE_NOT_COVERED");
  if (!same(dataset.model.periods, normalized.periods)) return finish("NOT_COMPUTABLE", "PERIOD_MISMATCH");
  const geo = normalized.scope.geography;
  if (!reference.coverage?.countryCodes.includes(geo.countryCode) || geo.level !== "COUNTRY" && !reference.coverage.regionCodes.includes(geo.code)) return finish("NO_COVERAGE", "SOURCE_GEOGRAPHY_NOT_COVERED");
  let model: OperationalRequest; let input: OperationalInput;
  try {
    model = bindOperationalDataset(dataset, reference, evaluatedAt).model; input = inputFrom(reference, dataset);
  } catch (error) {
    if (!(error instanceof z.ZodError) && !(error instanceof RangeError)) throw error;
    return finish("NOT_COMPUTABLE", "OPERATIONAL_MODEL_SEMANTICS_INVALID");
  }
  if (!same(model, normalized)) return finish("NOT_COMPUTABLE", "PUBLISHED_MODEL_REQUEST_MISMATCH");
  const validated = { reference, dataset, model, input, contentHash: sha256Hex(data.content) };
  if (dataset.coverage.status === "NONE") return finish("NO_COVERAGE", "MODEL_NOT_COVERED", validated);
  const diagnostic = buildOperationalFoundationResult(model, [input], {
    runId: "operational-m2-validation", evaluatedAt, environment: "test", timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
  });
  if (diagnostic.metrics.some((m) => m.status === "NOT_SUPPORTED")) return finish("NOT_SUPPORTED", "UNSUPPORTED_PROCESS_NETWORK", validated);
  const incompatible = ["INCOMPATIBLE_UNITS", "INCOMPATIBLE_RESOURCE", "INCOMPATIBLE_COHORT", "ZERO_DENOMINATOR"];
  if (diagnostic.metrics.some((m) => m.reasons.some((r) => incompatible.includes(r)))) return finish("NOT_COMPUTABLE", "OPERATIONAL_COMPATIBILITY_INVALID", validated);
  const fresh = reference.freshness.status === "FRESH" && reference.freshness.sourcePublishedAt !== null
    && Date.parse(evaluatedAt) - Date.parse(reference.freshness.sourcePublishedAt) <= reference.freshness.freshnessDays * 86_400_000;
  if (!fresh || dataset.coverage.status !== "COMPLETE" || dataset.coverage.completeness !== "INVENTORY"
    || normalized.periods.some((p) => !dataset.coverage.periodIds.includes(p.id))
    || model.values.some((v) => v.value === null)
    || model.schedules.some((s) => s.completeness !== "COMPLETE" || model.periods.some((p) => !s.coveredPeriodIds.includes(p.id)))
    || diagnostic.metrics.some((m) => m.reasons.some((r) => r !== "M1_CALCULATIONS_DEFERRED"))) return finish("PARTIAL", "MODEL_INPUTS_INCOMPLETE_OR_STALE", validated);
  return finish("AVAILABLE", "EXACT_APPROVED_MODEL_VALIDATED", validated);
}
