import { compareText } from "../shared/canonical";
import type { EngineInput } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { createGap, normalizeGaps, type Gap } from "../shared/gaps";
import type { DataCenterMapReference } from "@/services/data-center/map-contract";
import type { SpatialNormalizedRequest } from "./contracts";
import { buildDataCenterInput } from "./data-center-inputs";
import {
  DataCenterProviderError, type DataCenterContentOutcome, type DataCenterDiscovery, type DataCenterDiscoveryStatus, type DataCenterGeography, type DataCenterSelection, type SpatialDataCenterPort,
} from "./data-center-port";
import { checkDatasetFeatures, type SpatialDatasetFeature } from "./dataset-features";
import { spatialGapCatalog } from "./gaps";

/**
 * Turns the Data Center datasets a request selects (an exact version, or a type as of an instant) into what an analysis can use: an input
 * descriptor with the rights, quality, source and checksum the Data Center states, and the validated features. It reads through the
 * `SpatialDataCenterPort` only, one selection after another in role order, and it never goes beyond what was asked:
 *
 *  - an exact pin is used as given or not at all; there is no fallback to another version, and a version that cannot be used says why
 *    (unavailable, content invalid, integrity failed, content changed) in a gap, never silently;
 *  - a selection by type is made by the Data Center's written policy; when several datasets were in force the choice is reported;
 *  - the content is read with the checksum discovery reported, so a version that changed in between is refused, not replaced;
 *  - nothing is invented: a value the Data Center does not state stays unstated;
 *  - nothing is written, and no usage is recorded (see `usage-intents.ts`).
 */
export interface DataSourceRequest { role: string; selection: DataCenterSelection }

/**
 * The Data Center selections of a normalized request as requests for the resolver, one per role, in role order (the selections for the Map
 * are not the Data Center's to resolve). An exact version is requested exactly; a type keeps its instant, and is narrowed to the place the
 * analysis is about when the caller gives that geography: the structured coverage the Data Center stores (country, region, box), so that a
 * dataset that does not cover the place is never chosen for it.
 */
export function dataSourceRequestsOf(roles: SpatialNormalizedRequest["data"]["roles"], options: { geography?: DataCenterGeography } = {}): DataSourceRequest[] {
  const requests: DataSourceRequest[] = [];
  for (const [role, selection] of Object.entries(roles)) {
    if (selection.source !== "DATA_CENTER") continue;
    if (selection.versionId !== undefined) requests.push({ role, selection: { kind: "EXACT", versionId: selection.versionId } });
    else if (selection.typeKey !== undefined) {
      requests.push({
        role,
        selection: { kind: "BY_TYPE", typeKey: selection.typeKey, ...(selection.asOf === undefined ? {} : { asOf: selection.asOf }), ...(options.geography === undefined ? {} : { geography: options.geography }) },
      });
    } else throw new EngineError("CONTRACT_VIOLATION", { reason: "data_center_selection_empty" });
  }
  return requests.sort((first, second) => compareText(first.role, second.role));
}

export const dataSourceFailures = [
  "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES", "INTEGRITY_FAILED", "PIN_CONTENT_CHANGED", "NOT_SPATIAL", "CONTENT_INVALID", "BACKEND_UNAVAILABLE",
] as const;
export type DataSourceFailure = typeof dataSourceFailures[number];

/** How the dataset was chosen, so a result can be explained and replayed. */
export interface DataSourceTrace {
  mode: "EXACT" | "BY_TYPE";
  policy: string;
  asOf: string | null;
  asOfExplicit: boolean;
  discoveryStatus: DataCenterDiscoveryStatus;
  selectedVersionId: string | null;
  /** By type: the versions in force, the preferred first, up to the Data Center's listing limit. */
  candidateVersionIds: string[];
  /** More versions were in force than are listed. */
  candidatesTruncated: boolean;
  notInForce: Array<{ versionId: string; reason: string }>;
}

export interface DataCenterRunInputProvenance {
  reference: DataCenterMapReference;
  selections: Array<{ role: string; trace: DataSourceTrace }>;
}

export type ResolvedDataSource =
  | { status: "RESOLVED"; role: string; input: EngineInput; features: SpatialDatasetFeature[]; trace: DataSourceTrace; gaps: Gap[] }
  | { status: DataSourceFailure; role: string; trace: DataSourceTrace | null; gaps: Gap[] };

export interface ResolvedDataSources {
  /** One entry per request, in role order. */
  sources: ResolvedDataSource[];
  /** The inputs actually resolved, each once, sorted by id; roles that resolved to the same version share one input. */
  inputs: EngineInput[];
  /** The gaps that belong to the resolution itself (not the ones every input derives); normalized. */
  gaps: Gap[];
}

const typeKeyOf = (selection: DataCenterSelection) => (selection.kind === "BY_TYPE" ? selection.typeKey : "exact version");

function traceOf(discovery: DataCenterDiscovery): DataSourceTrace {
  if (discovery.traceSnapshot) return discovery.traceSnapshot;
  return {
    mode: discovery.mode, policy: discovery.policy, asOf: discovery.asOf, asOfExplicit: discovery.asOfExplicit, discoveryStatus: discovery.status,
    selectedVersionId: discovery.selected?.version.versionId ?? null, candidateVersionIds: discovery.candidates.map((candidate) => candidate.version.versionId),
    candidatesTruncated: discovery.truncated,
    notInForce: discovery.notInForce.map((entry) => ({ versionId: entry.versionId, reason: entry.reason })),
  };
}

const failure = (role: string, status: DataSourceFailure, trace: DataSourceTrace | null, gap: Gap): ResolvedDataSource => ({ status, role, trace, gaps: [gap] });
const unavailable = (role: string, trace: DataSourceTrace | null) => failure(role, "NOT_AVAILABLE", trace, createGap(spatialGapCatalog, "DATASET_NOT_AVAILABLE", { role }, { subject: role }));
const backendDown = (role: string, trace: DataSourceTrace | null) => failure(role, "BACKEND_UNAVAILABLE", trace, createGap(spatialGapCatalog, "BACKEND_UNAVAILABLE", { backend: "DATA_CENTER" }, { subject: role }));

function discoveryFailure(request: DataSourceRequest, discovery: DataCenterDiscovery, trace: DataSourceTrace): ResolvedDataSource | null {
  const { role, selection } = request;
  switch (discovery.status) {
    case "FOUND": return discovery.selected === null ? unavailable(role, trace) : null;
    case "NOT_AVAILABLE": return unavailable(role, trace);
    case "NO_COVERAGE": return failure(role, "NO_COVERAGE", trace, createGap(spatialGapCatalog, "NO_COVERAGE", { dataset: `Data Center datasets of type ${typeKeyOf(selection)}` }, { subject: role }));
    case "NOT_IN_FORCE": return failure(role, "NOT_IN_FORCE", trace, createGap(spatialGapCatalog, "DATA_CENTER_NOT_IN_FORCE", { typeKey: typeKeyOf(selection), asOf: discovery.asOf ?? "the evaluation instant", role }, { subject: role }));
    case "TOO_MANY_CANDIDATES": return failure(role, "TOO_MANY_CANDIDATES", trace, createGap(spatialGapCatalog, "DATA_CENTER_TOO_MANY_CANDIDATES", { typeKey: typeKeyOf(selection), role }, { subject: role }));
  }
}

function contentFailure(role: string, title: string, outcome: Exclude<DataCenterContentOutcome, { status: "OK" }>, trace: DataSourceTrace): ResolvedDataSource {
  switch (outcome.status) {
    case "NOT_AVAILABLE": return unavailable(role, trace);
    case "INTEGRITY_FAILED": return failure(role, "INTEGRITY_FAILED", trace, createGap(spatialGapCatalog, "DATA_CENTER_INTEGRITY_FAILED", { role }, { subject: role }));
    case "PIN_CONTENT_CHANGED": return failure(role, "PIN_CONTENT_CHANGED", trace, createGap(spatialGapCatalog, "DATA_CENTER_PIN_CHANGED", { role }, { subject: role }));
    case "NOT_SPATIAL": return failure(role, "NOT_SPATIAL", trace, createGap(spatialGapCatalog, "DATA_CENTER_VERSION_NOT_SPATIAL", { role }, { subject: role }));
    case "CONTENT_INVALID": return failure(role, "CONTENT_INVALID", trace, createGap(spatialGapCatalog, "DATA_CENTER_CONTENT_INVALID", { dataset: title, code: outcome.code }, { subject: role }));
  }
}

async function resolveOne(
  request: DataSourceRequest,
  port: SpatialDataCenterPort,
  evaluatedAt: string,
  onInputResolved?: (inputId: string, provenance: DataCenterRunInputProvenance) => void,
): Promise<ResolvedDataSource> {
  const { role, selection } = request;
  let discovery: DataCenterDiscovery;
  try {
    discovery = await port.discover(selection);
  } catch (error) {
    if (error instanceof DataCenterProviderError) return backendDown(role, null);
    throw error;
  }
  const trace = traceOf(discovery);
  const refused = discoveryFailure(request, discovery, trace);
  if (refused !== null) return refused;
  const selected = discovery.selected as NonNullable<DataCenterDiscovery["selected"]>;
  const versionId = selected.version.versionId;
  // An exact pin names the version, so what discovery returned must be that version, whatever the port does.
  if (selection.kind === "EXACT" && versionId !== selection.versionId) return unavailable(role, trace);

  let outcome: DataCenterContentOutcome;
  try {
    outcome = await port.readContent({ versionId, expectedChecksum: selected.version.checksum.value });
  } catch (error) {
    if (error instanceof DataCenterProviderError) return backendDown(role, trace);
    throw error;
  }
  if (outcome.status !== "OK") return contentFailure(role, selected.dataset.title, outcome, trace);
  // What was read must be what was selected: a different version, or different content, is never accepted in its place.
  if (outcome.reference.version.versionId !== versionId || outcome.checksum !== selected.version.checksum.value || outcome.reference.version.checksum.value !== outcome.checksum) {
    return failure(role, "PIN_CONTENT_CHANGED", trace, createGap(spatialGapCatalog, "DATA_CENTER_PIN_CHANGED", { role }, { subject: role }));
  }
  const checked = checkDatasetFeatures(outcome.features);
  if (!checked.ok) return failure(role, "CONTENT_INVALID", trace, createGap(spatialGapCatalog, "DATA_CENTER_CONTENT_INVALID", { dataset: selected.dataset.title, code: checked.code }, { subject: role }));

  const input = buildDataCenterInput({
    reference: outcome.reference, roles: [role], evaluatedAt,
    ...(selection.kind === "BY_TYPE" ? { selection: { policy: discovery.policy, asOf: discovery.asOf ?? evaluatedAt, typeKey: selection.typeKey } } : {}),
  });
  onInputResolved?.(input.id, { reference: outcome.reference, selections: [{ role, trace }] });
  const gaps: Gap[] = [];
  const candidateCount = discovery.traceSnapshot?.candidateVersionIds.length ?? discovery.candidates.length;
  const candidatesTruncated = discovery.traceSnapshot?.candidatesTruncated ?? discovery.truncated;
  if (selection.kind === "BY_TYPE" && candidateCount > 1) {
    // A listing cut at the Data Center's limit counts a lower bound, and says so.
    const others = candidateCount - 1;
    gaps.push(createGap(spatialGapCatalog, "DATA_CENTER_COMPETING_DATASETS", { count: candidatesTruncated ? `${others}+` : others, typeKey: selection.typeKey, dataset: selected.dataset.title, policy: discovery.policy }, { inputId: input.id, subject: role }));
  }
  return { status: "RESOLVED", role, input, features: checked.features, trace, gaps };
}

export async function resolveSpatialDataSources(args: {
  requests: readonly DataSourceRequest[];
  port: SpatialDataCenterPort;
  evaluatedAt: string;
  onInputResolved?: (inputId: string, provenance: DataCenterRunInputProvenance) => void;
}): Promise<ResolvedDataSources> {
  const requests = [...args.requests].sort((first, second) => compareText(first.role, second.role));
  const sources: ResolvedDataSource[] = [];
  for (const request of requests) sources.push(await resolveOne(request, args.port, args.evaluatedAt, args.onInputResolved));

  // Roles that resolved to the same version share one input that lists every role it serves.
  const rolesByInput = new Map<string, string[]>();
  for (const source of sources) if (source.status === "RESOLVED") rolesByInput.set(source.input.id, [...(rolesByInput.get(source.input.id) ?? []), ...source.input.roles]);
  const merged = new Map<string, EngineInput>();
  const final = sources.map((source): ResolvedDataSource => {
    if (source.status !== "RESOLVED") return source;
    const roles = [...new Set(rolesByInput.get(source.input.id) ?? [])].sort(compareText);
    const input = { ...source.input, roles };
    merged.set(input.id, input);
    return { ...source, input };
  });
  return {
    sources: final,
    inputs: [...merged.values()].sort((first, second) => compareText(first.id, second.id)),
    gaps: normalizeGaps(final.flatMap((source) => source.gaps)),
  };
}
