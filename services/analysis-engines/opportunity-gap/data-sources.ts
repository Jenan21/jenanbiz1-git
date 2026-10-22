import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys, sha256Hex } from "../shared/canonical";
import { deriveAttribution, deriveInputGaps, deriveRights, type EngineInput } from "../shared/contracts";
import { normalizeGaps } from "../shared/gaps";
import { opportunityDiscoverySchema, opportunityReadSchema, type OpportunityDataPort, type OpportunitySourceReference } from "./data-port";
import { bindOpportunityDataset, opportunityDatasetSchema, typeKeyByOpportunityRole, type OpportunityDataset, type OpportunityDatasetRole } from "./datasets";
import { opportunityInputSchema, sortedUnique, type OpportunityEvidence } from "./model";
import { ensureOpportunitySize, normalizeOpportunityEvidence, normalizeOpportunityRequest, type OpportunityRequest } from "./request";

export type OpportunitySourceStatus = "AVAILABLE" | "PARTIAL" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE";
export interface OpportunityPreparedSource {
  phase: "CURRENT" | "HISTORICAL"; role: OpportunityDatasetRole; requestedVersionId: string | null;
  status: OpportunitySourceStatus; reason: string;
  reference: OpportunitySourceReference | null; dataset: OpportunityDataset | null;
  input: EngineInput | null; contentHash: string | null;
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
function inputFrom(reference: OpportunitySourceReference, dataset: OpportunityDataset): EngineInput {
  return opportunityInputSchema.parse({
    id: `dc:${reference.version.versionId}`, roles: [dataset.role], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: reference.version.versionId, version: reference.version.number, label: reference.dataset.title },
    checksum: reference.version.checksum, source: { name: reference.source.name, organization: reference.source.organization, url: reference.source.url },
    ownership: reference.ownership.ownership, license: reference.rights.license, licenseClass: reference.rights.licenseClass, usagePolicy: reference.rights.usagePolicy,
    attribution: { text: reference.rights.attribution.text, required: reference.rights.attribution.required }, allowExport: reference.rights.allowExport,
    completeness: dataset.coverage.completeness, evidenceStatus: reference.version.evidenceStatus, quality: reference.quality,
    freshness: { status: reference.freshness.status, sourcePublishedAt: reference.freshness.sourcePublishedAt, freshnessDays: reference.freshness.freshnessDays, expiresAt: reference.freshness.expiresAt },
    coverage: reference.coverage, limitations: sortedUnique(dataset.limitations),
  });
}
export function requiredOpportunityRoles(request: OpportunityRequest): OpportunityDatasetRole[] {
  const roles = new Set<OpportunityDatasetRole>(request.data.roles.map((pin) => pin.role));
  if (request.analyses.includes("DEMAND_SUPPLY_GAP")) { roles.add("need.observations"); roles.add("supply.capacity"); }
  if (request.analyses.includes("BENCHMARK_GAP")) { roles.add("provision.observations"); roles.add("benchmarks.targets"); }
  return [...roles].sort(compareText);
}
export async function prepareOpportunityData(port: OpportunityDataPort, raw: unknown, evaluatedAt: string) {
  const normalized = normalizeOpportunityRequest(raw, evaluatedAt);
  const request = normalized.normalized;
  const work = { discoveries: 0, reads: 0, parsedRows: 0 };
  const sources: OpportunityPreparedSource[] = [];
  const original = new Map<string, string>();
  async function load(pin: OpportunityRequest["data"]["roles"][number], phase: OpportunityPreparedSource["phase"], scope: OpportunityRequest["scope"]) {
    const fail = (status: OpportunitySourceStatus, reason: string): OpportunityPreparedSource => ({
      phase, role: pin.role, requestedVersionId: pin.versionId, status, reason, reference: null, dataset: null, input: null, contentHash: null,
    });
    work.discoveries++;
    const discovery = opportunityDiscoverySchema.safeParse(await port.discover({ versionIds: [pin.versionId] }));
    if (!discovery.success) return fail("NOT_COMPUTABLE", "DISCOVERY_CONTRACT_INVALID");
    const selection = discovery.data;
    if (selection.status !== "FOUND") return fail("NOT_AVAILABLE", "SOURCE_UNAVAILABLE");
    const metadata = selection.candidates[0]?.reference;
    if (!metadata || selection.candidates.length !== 1 || selection.unavailableVersionIds.length || selection.notInForce.length
      || metadata.version.versionId !== pin.versionId) return fail("NOT_COMPUTABLE", "EXACT_SELECTION_INVALID");
    if (metadata.version.checksum.value !== pin.checksum) return fail("NOT_COMPUTABLE", "CHECKSUM_MISMATCH");
    work.reads++;
    const read = opportunityReadSchema.safeParse(await port.read({ versionId: pin.versionId, expectedChecksum: pin.checksum }));
    if (!read.success) return fail("NOT_COMPUTABLE", "READ_CONTRACT_INVALID");
    if (read.data.status !== "AVAILABLE") return fail(read.data.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE", read.data.status === "NOT_AVAILABLE" ? "SOURCE_UNAVAILABLE" : "CHECKSUM_MISMATCH");
    const data = read.data; const reference = data.reference;
    if (!same(omitKeys(reference, ["resolvedAt"]), omitKeys(metadata, ["resolvedAt"]))
      || reference.version.versionId !== pin.versionId || reference.version.checksum.value !== pin.checksum || data.integrity.checksum !== pin.checksum) return fail("NOT_COMPUTABLE", "REFERENCE_OR_INTEGRITY_MISMATCH");
    if (reference.dataset.layer !== "DATA" || reference.dataset.typeKey !== typeKeyByOpportunityRole[pin.role] || data.contentKind !== "OTHER") return fail("NOT_COMPUTABLE", "ROLE_TYPE_MISMATCH");
    if (!reference.rights.license.trim() || !reference.rights.usagePolicy.trim() || reference.version.evidenceStatus === "CONFLICTED"
      || reference.version.evidenceStatus === "ESTIMATED" || reference.ownership.ownership === "AI_GENERATED") return fail("NOT_COMPUTABLE", "RIGHTS_OR_EVIDENCE_INVALID");
    const dates = [reference.resolvedAt, reference.version.createdAt, reference.publication.publishedAt, reference.freshness.sourcePublishedAt];
    if (dates.some((date) => date !== null && Date.parse(date) > Date.parse(evaluatedAt))
      || reference.quality.status !== "UNAVAILABLE" && Date.parse(reference.quality.measuredAt) > Date.parse(evaluatedAt)) return fail("NOT_COMPUTABLE", "FUTURE_METADATA");
    if (reference.freshness.status === "EXPIRED" || [reference.freshness.expiresAt, reference.freshness.effectiveTo].some((date) => date !== null && Date.parse(date) <= Date.parse(evaluatedAt))
      || reference.freshness.effectiveFrom !== null && Date.parse(reference.freshness.effectiveFrom) > Date.parse(evaluatedAt)) return fail("NOT_COMPUTABLE", "SOURCE_NOT_IN_FORCE");
    let rawDataset: unknown;
    try { rawDataset = JSON.parse(data.content); } catch (error) { if (!(error instanceof SyntaxError)) throw error; return fail("NOT_COMPUTABLE", "DATASET_JSON_INVALID"); }
    const parsed = opportunityDatasetSchema.safeParse(rawDataset);
    if (!parsed.success) return fail("NOT_COMPUTABLE", "DATASET_CONTRACT_INVALID");
    const dataset = parsed.data;
    work.parsedRows += dataset.rows.length + dataset.sourceRecords.length;
    if (work.parsedRows > 10_000) throw new RangeError("Combined Opportunity parsed rows exceed 10000");
    if (dataset.role !== pin.role || dataset.sourceId !== reference.source.sourceId) return fail("NOT_COMPUTABLE", "SOURCE_ROLE_MISMATCH");
    if (!same(dataset.definition, request.definition)) return fail("NOT_COMPUTABLE", "UNIT_OR_DEFINITION_MISMATCH");
    if (dataset.sourceRecords.some((record) => record.recordedAt > evaluatedAt)) return fail("NOT_COMPUTABLE", "FUTURE_SOURCE_RECORD");
    const periodEnd = dataset.scope.time.kind === "INTERVAL" ? dataset.scope.time.endDate : dataset.scope.time.date;
    if (periodEnd > evaluatedAt.slice(0, 10)) return fail("NOT_COMPUTABLE", "FUTURE_REPORTING_PERIOD");
    const geography = dataset.scope.dimensions.geography;
    if (reference.coverage && (!reference.coverage.countryCodes.includes(geography.countryCode)
      || reference.coverage.regionCodes.length && !reference.coverage.regionCodes.includes(geography.code))) return fail("NOT_COMPUTABLE", "GEOGRAPHY_METADATA_CONFLICT");
    let bound: ReturnType<typeof bindOpportunityDataset>;
    try { bound = bindOpportunityDataset(dataset, reference); }
    catch (error) { if (!(error instanceof z.ZodError)) throw error; return fail("NOT_COMPUTABLE", "FACT_SEMANTICS_INVALID"); }
    for (const fact of bound) if (fact.benchmark && (!same(fact.benchmark.policy, request.benchmarkPolicy)
      || fact.benchmark.validFrom > evaluatedAt || fact.benchmark.validUntil <= evaluatedAt)) return fail("NOT_COMPUTABLE", "BENCHMARK_POLICY_OR_VALIDITY_INVALID");
    let input: EngineInput;
    try { input = inputFrom(reference, dataset); } catch (error) { if (!(error instanceof z.ZodError)) throw error; return fail("NOT_COMPUTABLE", "INPUT_METADATA_INVALID"); }
    const semanticDimensions = ["metricDefinition", "methodology", "cohort", "universe", "adjustment"] as const;
    if (semanticDimensions.some((key) => !same(dataset.scope.dimensions[key], scope.dimensions[key]))) return fail("NOT_COMPUTABLE", "SCOPE_DEFINITION_OR_METHOD_MISMATCH");
    const contentHash = sha256Hex(data.content);
    const snapshot = canonicalize({ reference: omitKeys(reference, ["resolvedAt"]), contentHash });
    if (original.has(pin.versionId) && original.get(pin.versionId) !== snapshot) return fail("NOT_COMPUTABLE", "EXACT_VERSION_CHANGED_DURING_PREPARATION");
    original.set(pin.versionId, snapshot);
    const covered = same(dataset.scope, scope) && reference.coverage !== null && dataset.coverage.status !== "NONE";
    const fresh = reference.freshness.status === "FRESH" && reference.freshness.sourcePublishedAt !== null
      && Date.parse(evaluatedAt) - Date.parse(reference.freshness.sourcePublishedAt) < reference.freshness.freshnessDays * 86_400_000;
    const status: OpportunitySourceStatus = !covered ? "NO_COVERAGE" : dataset.coverage.status !== "COMPLETE"
      || input.completeness !== "INVENTORY" || bound.some((fact) => fact.coverage !== "COMPLETE" || fact.value === null) || !fresh ? "PARTIAL" : "AVAILABLE";
    return { phase, role: pin.role, requestedVersionId: pin.versionId, status,
      reason: status === "AVAILABLE" ? "VALIDATED" : status === "PARTIAL" ? "SCOPED_SUBSET_ONLY" : "SCOPE_NOT_COVERED",
      reference, dataset, input, contentHash } satisfies OpportunityPreparedSource;
  }
  for (const role of requiredOpportunityRoles(request)) {
    const pins = request.data.roles.filter((pin) => pin.role === role);
    if (!pins.length) sources.push({ phase: "CURRENT", role, requestedVersionId: null, status: "NOT_AVAILABLE", reason: "EXACT_PIN_REQUIRED", reference: null, dataset: null, input: null, contentHash: null });
    for (const pin of pins) sources.push(await load(pin, "CURRENT", request.scope));
  }
  if (request.historical) {
    const roles = [...new Set<OpportunityDatasetRole>([...requiredOpportunityRoles(request), ...request.historical.versions.map((pin) => pin.role)])].sort(compareText);
    for (const role of roles) {
      const pins = request.historical.versions.filter((pin) => pin.role === role);
      if (!pins.length) sources.push({ phase: "HISTORICAL", role, requestedVersionId: null, status: "NOT_AVAILABLE", reason: "EXACT_PIN_REQUIRED", reference: null, dataset: null, input: null, contentHash: null });
      for (const pin of pins) sources.push(await load(pin, "HISTORICAL", request.historical.scope));
    }
  }
  const makeEvidence = (phase: OpportunityPreparedSource["phase"]): OpportunityEvidence => {
    const usable = sources.filter((source) => source.phase === phase && ["AVAILABLE", "PARTIAL"].includes(source.status));
    const inputs = usable.map((source) => source.input!);
    const facts = usable.flatMap((source) => bindOpportunityDataset(source.dataset!, source.reference!));
    return normalizeOpportunityEvidence({ inputs, facts });
  };
  const current = makeEvidence("CURRENT"); const historical = makeEvidence("HISTORICAL");
  const descriptors = [...new Map(sources.filter((source) => source.input).map((source) => [source.input!.id, source.input!])).values()].sort((a, b) => compareText(a.id, b.id));
  const ready = sources.length > 0 && sources.every((source) => source.status === "AVAILABLE");
  const status: OpportunitySourceStatus = !sources.length ? "NOT_AVAILABLE"
    : sources.some((source) => source.status === "NOT_COMPUTABLE") ? "NOT_COMPUTABLE"
    : sources.some((source) => source.status === "NOT_AVAILABLE") ? "NOT_AVAILABLE"
    : sources.some((source) => source.status === "NO_COVERAGE") ? "NO_COVERAGE"
    : ready ? "AVAILABLE" : "PARTIAL";
  const result = {
    contract: "jenan.opportunity-gap.preparation/v1" as const, version: "1.0.0-m2", evaluatedAt,
    request: { normalized: request, evaluatedAt }, sources, current, historical,
    gaps: normalizeGaps(descriptors.flatMap(deriveInputGaps)),
    rights: deriveRights(descriptors), attribution: deriveAttribution(descriptors), work,
    ready, status, reason: !sources.length ? "NO_EXACT_SOURCES_REQUESTED" : ready ? "EXACT_SOURCES_VALIDATED" : "SEE_SOURCE_VALIDATION_REASONS",
    realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
  };
  const prepared = { ...result, determinism: {
    requestHash: normalized.requestHash, inputsHash: canonicalHash({ sources, current, historical }), outputHash: canonicalHash(result),
  } };
  ensureOpportunitySize(prepared);
  return prepared;
}
