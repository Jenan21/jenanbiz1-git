import { canonicalHash, canonicalize, compareText, omitKeys } from "../shared/canonical";
import { deriveAttribution, deriveInputGaps, deriveRights, engineInputSchema, type EngineInput } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { createGap, normalizeGaps } from "../shared/gaps";
import { competitorGapCatalog } from "./contracts";
import { competitorDiscoverySchema, competitorReadSchema, type CompetitorDataPort, type CompetitorDiscovery, type CompetitorSourceReference } from "./data-port";
import { competitorDatasetCoverage, competitorDatasetSchema, typeKeyByCompetitorRole, type CompetitorDataset, type CompetitorDatasetRole } from "./datasets";
import { describeCompetitorIdentity } from "./identity";
import {
  activeAt, competitorEvidenceSchema, competitorRoles, ensureSize, normalizeCompetitorEvidence, refKey, sortedText,
  type CompetitorEvidence, type SourceRecordRef,
} from "./model";
import { normalizeCompetitorRequest } from "./request";
import { classifyCompetitorLocations } from "./matching";

export type CompetitorSourceStatus = "AVAILABLE" | "NOT_AVAILABLE" | "NO_COVERAGE" | "NOT_COMPUTABLE";
export interface CompetitorPreparedSource {
  role: CompetitorDatasetRole; status: CompetitorSourceStatus; reason: string;
  requestedVersionId: string | null; selection: CompetitorDiscovery | null;
  reference: CompetitorSourceReference | null; dataset: CompetitorDataset | null; input: EngineInput | null;
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const fail = (role: CompetitorDatasetRole, requestedVersionId: string | null, status: CompetitorSourceStatus, reason: string,
  selection: CompetitorDiscovery | null = null): CompetitorPreparedSource =>
  ({ role, requestedVersionId, status, reason, selection, reference: null, dataset: null, input: null });
const referenceIdentity = (reference: CompetitorSourceReference) => omitKeys(reference, ["resolvedAt"]);
function inputFrom(reference: CompetitorSourceReference, dataset: CompetitorDataset): EngineInput | null {
  const { version, source, rights, freshness } = reference;
  const parsed = engineInputSchema.safeParse({
    id: `dc:${version.versionId}`, roles: [dataset.role], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: version.versionId, version: version.number, label: reference.dataset.title },
    checksum: version.checksum, source: { name: source.name, organization: source.organization, url: source.url },
    ownership: reference.ownership.ownership, license: rights.license, licenseClass: rights.licenseClass, usagePolicy: rights.usagePolicy,
    attribution: { text: rights.attribution.text, required: rights.attribution.required }, allowExport: rights.allowExport,
    completeness: dataset.coverage.completeness, evidenceStatus: version.evidenceStatus, quality: reference.quality,
    freshness: { status: freshness.status, sourcePublishedAt: freshness.sourcePublishedAt, freshnessDays: freshness.freshnessDays, expiresAt: freshness.expiresAt },
    coverage: reference.coverage, limitations: sortedText(dataset.limitations),
  });
  return parsed.success ? parsed.data : null;
}
function eligibleReference(reference: CompetitorSourceReference, evaluatedAt: string, asOf: string) {
  return reference.dataset.layer === "DATA" && reference.rights.allowRetrieval && !!reference.rights.usagePolicy.trim()
    && !["CONFLICTED", "ESTIMATED"].includes(reference.version.evidenceStatus)
    && reference.freshness.status !== "EXPIRED"
    && [reference.version.createdAt, reference.freshness.sourcePublishedAt, reference.publication.publishedAt].every((date) => date === null || Date.parse(date) <= Date.parse(evaluatedAt))
    && [reference.freshness.expiresAt, reference.freshness.effectiveTo].every((date) => date === null || Date.parse(date) > Date.parse(evaluatedAt))
    && (reference.freshness.effectiveFrom === null || Date.parse(reference.freshness.effectiveFrom) <= Date.parse(asOf))
    && (reference.freshness.effectiveTo === null || Date.parse(reference.freshness.effectiveTo) > Date.parse(asOf));
}
/** SELF is a declared dataset token, not a guessed id or fallback to another source version. */
const bindRef = (ref: SourceRecordRef, versionId: string): SourceRecordRef => ({ ...ref, inputId: ref.inputId === "SELF" ? `dc:${versionId}` : ref.inputId });
function boundDataset(dataset: CompetitorDataset, versionId: string): CompetitorDataset {
  const copy = structuredClone(dataset);
  for (const record of copy.sourceRecords) record.inputId = `dc:${versionId}`;
  if (copy.role === "competitor.dimensions") return copy;
  for (const row of copy.rows) {
    row.evidence = row.evidence.map((ref) => bindRef(ref, versionId));
    if ("entityLinkEvidence" in row) row.entityLinkEvidence = row.entityLinkEvidence.map((ref) => bindRef(ref, versionId));
    if ("operationalEvidence" in row) row.operationalEvidence = row.operationalEvidence.map((ref) => bindRef(ref, versionId));
    if ("leftRecord" in row) { row.leftRecord = bindRef(row.leftRecord, versionId); row.rightRecord = bindRef(row.rightRecord, versionId); }
  }
  if (copy.role === "competitor.locations") copy.inventory.evidence = copy.inventory.evidence.map((ref) => bindRef(ref, versionId));
  return copy;
}

export async function prepareCompetitorData(port: CompetitorDataPort, rawRequest: unknown, evaluatedAt: string) {
  const { normalized: request, requestHash } = normalizeCompetitorRequest(rawRequest, evaluatedAt);
  const roles = new Set<CompetitorDatasetRole>(["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"]);
  for (const role of Object.keys(request.data.roles)) roles.add(role as CompetitorDatasetRole);
  const selections = [...roles].reduce((count, role) => { const selector = request.data.roles[role]; return count + (Array.isArray(selector) ? selector.length : 1); }, 0);
  if (selections > 32) throw new EngineError("REQUEST_TOO_LARGE", { first: "Required roles plus requested pins exceed 32 versions" });
  const sources: CompetitorPreparedSource[] = []; const work = { discoveries: 0, reads: 0, parsedRows: 0 };
  async function load(role: CompetitorDatasetRole, pin?: { versionId: string; expectedChecksum?: string }, typeSelection?: { typeKey: string; asOf?: string }) {
    const typeKey = typeKeyByCompetitorRole[role]; const versionId = pin?.versionId ?? null;
    if (typeSelection && typeSelection.typeKey !== typeKey) return fail(role, versionId, "NOT_COMPUTABLE", "ROLE_TYPE_MISMATCH");
    work.discoveries++;
    const parsed = competitorDiscoverySchema.safeParse(await port.discover(pin ? { versionIds: [pin.versionId] } : { typeKeys: [typeKey], asOf: typeSelection?.asOf ?? request.scope.asOf, limit: 100 }));
    if (!parsed.success) return fail(role, versionId, "NOT_COMPUTABLE", "DISCOVERY_CONTRACT_INVALID");
    const selection = parsed.data;
    if (selection.truncated || selection.status === "TOO_MANY_CANDIDATES") return fail(role, versionId, "NOT_COMPUTABLE", "DISCOVERY_LIMIT", selection);
    const metadata = pin ? selection.candidates.find((candidate) => candidate.reference.version.versionId === pin.versionId)?.reference : selection.selected?.reference;
    if (!metadata || selection.status !== "FOUND") return fail(role, versionId, selection.status === "NO_COVERAGE" || selection.status === "NOT_IN_FORCE" ? "NO_COVERAGE" : "NOT_AVAILABLE", "SOURCE_UNAVAILABLE", selection);
    if (pin ? selection.mode !== "EXACT" || selection.policy !== "exact-version" || selection.unavailableVersionIds.length > 0 || selection.candidates.length !== 1 || selection.selected !== null || selection.asOf !== null
      : selection.mode !== "BY_TYPE" || selection.policy !== "dc-version-selection-v1" || selection.asOf !== (typeSelection?.asOf ?? request.scope.asOf)
        || !same(selection.candidates[0]?.reference, metadata)) return fail(role, versionId, "NOT_COMPUTABLE", "SELECTION_POLICY_MISMATCH", selection);
    if (metadata.dataset.typeKey !== typeKey || !eligibleReference(metadata, evaluatedAt, request.scope.asOf)) return fail(role, versionId, "NOT_COMPUTABLE", "SOURCE_METADATA_INVALID", selection);
    if (pin?.expectedChecksum && pin.expectedChecksum !== metadata.version.checksum.value) return fail(role, versionId, "NOT_COMPUTABLE", "CHECKSUM_MISMATCH", selection);
    work.reads++;
    const readResult = competitorReadSchema.safeParse(await port.read({ versionId: metadata.version.versionId, expectedChecksum: pin?.expectedChecksum ?? metadata.version.checksum.value }));
    if (!readResult.success) return fail(role, versionId, "NOT_COMPUTABLE", "READ_CONTRACT_INVALID", selection);
    const read = readResult.data;
    if (read.status !== "AVAILABLE") return fail(role, versionId, read.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE", read.status === "NOT_AVAILABLE" ? "SOURCE_UNAVAILABLE" : "CHECKSUM_MISMATCH", selection);
    if (!same(referenceIdentity(metadata), referenceIdentity(read.reference)) || read.reference.version.versionId !== metadata.version.versionId
      || read.integrity.checksum !== metadata.version.checksum.value || read.contentKind !== "OTHER") return fail(role, versionId, "NOT_COMPUTABLE", "READ_IDENTITY_OR_INTEGRITY_MISMATCH", selection);
    let content: unknown;
    try { content = JSON.parse(read.content); } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return fail(role, versionId, "NOT_COMPUTABLE", "DATASET_JSON_INVALID", selection);
    }
    const datasetResult = competitorDatasetSchema.safeParse(content);
    if (!datasetResult.success || datasetResult.data.role !== role || datasetResult.data.sourceId !== metadata.source.sourceId) return fail(role, versionId, "NOT_COMPUTABLE", "DATASET_CONTRACT_INVALID", selection);
    const dataset = datasetResult.data;
    work.parsedRows += dataset.rows.length + dataset.sourceRecords.length;
    if (work.parsedRows > 10_000) throw new EngineError("REQUEST_TOO_LARGE", { first: "Competitor run exceeds 10000 parsed rows" });
    const input = inputFrom(metadata, dataset);
    if (!input) return fail(role, versionId, "NOT_COMPUTABLE", "INPUT_METADATA_INVALID", selection);
    const status = competitorDatasetCoverage(dataset, request.scope, request.competitorDefinition);
    const contradictsMetadata = metadata.coverage === null || !metadata.coverage.countryCodes.includes(request.scope.geography.countryCode)
      || dataset.coverage.geographies.some((geography) => !metadata.coverage!.countryCodes.includes(geography.countryCode)
        || geography.level === "region" && metadata.coverage!.regionCodes.length > 0 && !metadata.coverage!.regionCodes.includes(geography.code));
    if (contradictsMetadata) return fail(role, versionId, "NOT_COMPUTABLE", "GEOGRAPHY_METADATA_CONFLICT", selection);
    if (dataset.sourceRecords.some((record) => record.validity.start > evaluatedAt)
      || dataset.rows.some((row) => "validity" in row && row.validity.start > evaluatedAt)) return fail(role, versionId, "NOT_COMPUTABLE", "FUTURE_OBSERVATION", selection);
    return {
      role, requestedVersionId: versionId, status,
      reason: status === "AVAILABLE" ? "VALIDATED" : "SCOPE_NOT_COVERED",
      selection, reference: read.reference, input, dataset,
    } satisfies CompetitorPreparedSource;
  }
  for (const role of competitorRoles.filter((role) => roles.has(role))) {
    const selection = request.data.roles[role];
    if (Array.isArray(selection)) for (const pin of selection) sources.push(await load(role, pin));
    else sources.push(await load(role, undefined, selection));
  }
  if (sources.length > 32) throw new EngineError("REQUEST_TOO_LARGE", { first: "Required roles plus requested pins exceed 32 versions" });
  const usable = sources.filter((source) => source.status === "AVAILABLE" && source.input && source.dataset);
  const inputs = sources.filter((source) => source.input).map((source) => source.input!).sort((a, b) => compareText(a.id, b.id));
  let evidence: CompetitorEvidence | null = null; let coverage = null as Extract<CompetitorDataset, { role: "competitor.locations" }>["inventory"] | null;
  let validationReason: string | null = null;
  if (sources.every((source) => source.status === "AVAILABLE")) {
    const datasets = usable.map((source) => boundDataset(source.dataset!, source.reference!.version.versionId));
    const locations = datasets.filter((dataset) => dataset.role === "competitor.locations");
    if (locations.length !== 1) validationReason = "MULTIPLE_INVENTORY_UNIVERSES_REQUIRE_EXPLICIT_PARTITION_POLICY";
    else {
      const candidate = {
        contract: "jenan.competitor-analysis.evidence/v1" as const, inputs,
        permissions: inputs.map((input) => ({ inputId: input.id, analysisUsage: "ALLOWED" as const,
          policy: { id: "data-center-retrieval-policy", version: "1" }, validity: { start: evaluatedAt, end: null } })),
        sourceRecords: datasets.flatMap((dataset) => dataset.sourceRecords),
        entities: datasets.flatMap((dataset) => dataset.role === "competitor.entities" ? dataset.rows : []),
        locations: locations[0]!.rows,
        rules: datasets.flatMap((dataset) => dataset.role === "competitor.matching-rules" ? dataset.rows : []),
      };
      const structural = competitorEvidenceSchema.safeParse(candidate);
      if (!structural.success) validationReason = "COMBINED_EVIDENCE_LIMIT_OR_CONTRACT";
      else {
        try {
          const normalized = normalizeCompetitorEvidence(structural.data);
          describeCompetitorIdentity(normalized, request.scope.asOf);
          const dictionaries = datasets.flatMap((dataset) => dataset.role === "competitor.dimensions" ? dataset.rows : []);
          const declared = (kind: string, definition: unknown) => dictionaries.some((row) => row.kind === kind && same(row.definition, definition));
          if (!declared("GEOGRAPHY", request.scope.geography) || !declared("ACTIVITY", request.scope.activity) || !declared("ENTITY_DEFINITION", request.competitorDefinition)) throw new EngineError("INVALID_INPUT", { first: "Request dimensions are not declared by the selected dictionary" });
          for (const dataset of datasets) {
            if (dataset.coverage.geographies.some((value) => !declared("GEOGRAPHY", value))
              || dataset.coverage.activities.some((value) => !declared("ACTIVITY", value))
              || dataset.coverage.entityDefinitions.some((value) => !declared("ENTITY_DEFINITION", value))) throw new EngineError("INVALID_INPUT", { first: "Dataset coverage dimensions are not declared by the selected dictionary" });
          }
          for (const location of normalized.locations) if (!declared("GEOGRAPHY", location.geography)
            || location.activityCodes.some((code) => !declared("ACTIVITY", { taxonomy: location.activityTaxonomy.id, version: location.activityTaxonomy.version, id: code }))) throw new EngineError("INVALID_INPUT", { first: "Location geography/activity semantics are undeclared" });
          for (const rule of normalized.rules) if (!declared("ACTIVITY", rule.targetActivity)
            || rule.requiredActivityCodes.some((code) => !declared("ACTIVITY", { taxonomy: rule.activityTaxonomy.id, version: rule.activityTaxonomy.version, id: code }))) throw new EngineError("INVALID_INPUT", { first: "Matching rule semantics are undeclared" });
          for (const entity of normalized.entities) if (!declared("ENTITY_DEFINITION", entity.definition)) throw new EngineError("INVALID_INPUT", { first: "Entity definition is undeclared" });
          const refs = new Set(normalized.sourceRecords.map(refKey));
          const original = new Map(normalized.sourceRecords.map((row) => [refKey(row), row]));
          for (const dataset of datasets) {
            if (dataset.role === "competitor.attributes" || dataset.role === "competitor.identity-links") for (const row of dataset.rows) {
              if (!activeAt(row.validity, request.scope.asOf)) throw new EngineError("INVALID_INPUT", { first: "Attribute/link row is not in force" });
              if (row.evidence.some((ref) => !refs.has(refKey(ref)))) throw new EngineError("INVALID_INPUT", { first: "Unresolved attribute/link provenance" });
              if (row.evidence.some((ref) => !activeAt(original.get(refKey(ref))!.validity, request.scope.asOf))) throw new EngineError("INVALID_INPUT", { first: "Attribute/link evidence is not in force" });
              if ("leftRecord" in row && (!refs.has(refKey(row.leftRecord)) || !refs.has(refKey(row.rightRecord)))) throw new EngineError("INVALID_INPUT", { first: "Identity link source record is unresolved" });
              if ("leftRecord" in row && [row.leftRecord, row.rightRecord].some((ref) => !activeAt(original.get(refKey(ref))!.validity, request.scope.asOf))) throw new EngineError("INVALID_INPUT", { first: "Identity link source record is not in force" });
              if ("subjectKind" in row && !(row.subjectKind === "ENTITY" ? normalized.entities.some((entity) => entity.competitorEntityId === row.subjectId) : normalized.locations.some((location) => location.locationId === row.subjectId))) throw new EngineError("INVALID_INPUT", { first: "Attribute target is unresolved" });
              if ("canonicalId" in row && row.canonicalId !== null && !(row.kind === "SAME_LOCATION" ? normalized.locations.some((location) => location.locationId === row.canonicalId) : normalized.entities.some((entity) => entity.competitorEntityId === row.canonicalId))) throw new EngineError("INVALID_INPUT", { first: "Identity link canonical target is unresolved" });
              if ("canonicalId" in row) {
                if (row.certainty !== "RESOLVED") throw new EngineError("INVALID_INPUT", { first: "Ambiguous/conflicted cross-source identity link blocks a distinct inventory; no speculative merge" });
                const owns = (evidence: SourceRecordRef[], ref: SourceRecordRef) => evidence.some((candidate) => refKey(candidate) === refKey(ref));
                const targetEntity = normalized.entities.find((entity) => entity.competitorEntityId === row.canonicalId);
                const targetLocation = normalized.locations.find((location) => location.locationId === row.canonicalId);
                const coherent = row.kind === "SAME_ENTITY" ? targetEntity && owns(targetEntity.evidence, row.leftRecord) && owns(targetEntity.evidence, row.rightRecord)
                  : row.kind === "SAME_LOCATION" ? targetLocation && owns(targetLocation.evidence, row.leftRecord) && owns(targetLocation.evidence, row.rightRecord)
                    : targetEntity && normalized.locations.some((location) => location.competitorEntityId === row.canonicalId
                      && (owns(location.evidence, row.leftRecord) && owns(targetEntity.evidence, row.rightRecord)
                        || owns(location.evidence, row.rightRecord) && owns(targetEntity.evidence, row.leftRecord)));
                if (!coherent) throw new EngineError("INVALID_INPUT", { first: "Identity link contradicts declared entity/location/source bindings" });
              }
              if ("scope" in row && !same(row.scope, request.scope)) throw new EngineError("INVALID_INPUT", { first: "Attribute scope is incompatible" });
            }
          }
          const inventory = locations[0]!.inventory;
          if (!same(inventory.scope, request.scope) || !same(inventory.entityDefinition, request.competitorDefinition)
            || inventory.evidence.some((ref) => !refs.has(refKey(ref)) || !activeAt(original.get(refKey(ref))!.validity, request.scope.asOf)
              || !normalized.inputs.find((input) => input.id === ref.inputId)?.roles.includes("competitor.locations"))
            || !same(sortedText(inventory.inventoryLocationIds), sortedText(normalized.locations.filter((row) => activeAt(row.validity, request.scope.asOf) && same(row.geography, request.scope.geography)).map((row) => row.locationId)))) throw new EngineError("INVALID_INPUT", { first: "Location inventory attestation differs from exact scope or supplied identities" });
          evidence = normalized; coverage = inventory;
        } catch (error) {
          if (!(error instanceof EngineError)) throw error;
          validationReason = `EVIDENCE_INVALID:${error.details.first}`;
        }
      }
    }
  }
  const status: CompetitorSourceStatus = validationReason ? "NOT_COMPUTABLE"
    : sources.some((source) => source.status === "NOT_COMPUTABLE") ? "NOT_COMPUTABLE"
      : sources.some((source) => source.status === "NO_COVERAGE") ? "NO_COVERAGE"
        : sources.some((source) => source.status === "NOT_AVAILABLE") ? "NOT_AVAILABLE" : "AVAILABLE";
  const result = {
    contract: "jenan.competitor-analysis.prepared-inputs/v1" as const, evaluatedAt, request, requestHash,
    status, validationReason, sources, inputs, inputsHash: canonicalHash(inputs),
    evidence, coverage, matches: evidence ? classifyCompetitorLocations(evidence, request.scope, evaluatedAt) : [],
    rights: deriveRights(inputs), attribution: deriveAttribution(inputs),
    gaps: normalizeGaps([
      ...inputs.flatMap(deriveInputGaps),
      ...sources.filter((source) => source.status !== "AVAILABLE").map((source) => createGap(competitorGapCatalog, "COMPETITOR_SOURCE_UNAVAILABLE", {}, { subject: source.role })),
      ...(validationReason ? [createGap(competitorGapCatalog, "COMPETITOR_IDENTITY_UNRESOLVED", {}, { subject: "competitor.evidence" })] : []),
    ]), work,
  };
  ensureSize(result);
  return result;
}
