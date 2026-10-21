import { compareText } from "../shared/canonical";
import type { EngineInput } from "../shared/contracts";
import { createGap, normalizeGaps, type Gap } from "../shared/gaps";
import { spatialGapCatalog } from "./gaps";
import { buildMapBoundaryInput, buildMapLayerInput } from "./map-inputs";
import { assessMapRegistration, isMapTileLayer, mapAdminLayers, type MapAdminLayer, type MapBoundaryFacts, type MapDescription } from "./map-contract";
import type { MapLayerPolicy } from "./policy";

/**
 * The Map layers a LOCATION_CONTEXT run can use, decided once per run from what the Map says about itself: which release is published,
 * which layers it registers and with what provenance. The decision applies the Map-layer policy (production reads registered layers
 * only; development and test may use unregistered ones, labelled and with lowered confidence) and never invents a layer: a layer that
 * is missing, empty or excluded is simply unavailable, and its measurements say so.
 */
export interface AvailableLayer { available: true; input: EngineInput; releaseId: string; layerKey: string }
export interface UnavailableLayer { available: false }
export type LayerState = AvailableLayer | UnavailableLayer;

export interface LocationContextMapState {
  /** The release the Map has published, or null when there is none. The national boundary and the administrative levels always come from it. */
  publishedReleaseId: string | null;
  boundary: LayerState;
  boundaryFacts: MapBoundaryFacts | null;
  levels: Record<MapAdminLayer, LayerState>;
  /** One entry per requested place role, in role order. Roles of the same release share one input. */
  places: ReadonlyArray<{ role: string; layer: LayerState }>;
}

export interface ResolveMapStateArgs {
  /** The Map's published release, described for the administrative levels and every place layer that is not pinned. */
  published: MapDescription;
  /** Pinned releases (place layer only), described by release id. */
  pinned: ReadonlyMap<string, MapDescription>;
  /** The place roles of the run, each with the release it is pinned to (null: the published release). */
  placeRoles: ReadonlyArray<{ role: string; releaseId: string | null }>;
  policy: MapLayerPolicy;
  evaluatedAt: string;
  includeContext?: boolean;
}

export interface ResolvedMapState {
  state: LocationContextMapState;
  /** The inputs actually used, each once, sorted by id. */
  inputs: EngineInput[];
  /** Why layers are missing or excluded, and the state of the Map. Gaps that follow from an input's own description are added by the engine. */
  gaps: Gap[];
}

export interface FeatureMapRequest { role: string; layerKey: string; releaseId: string | null }
export interface FeatureMapSourceState extends FeatureMapRequest { layer: LayerState }
export interface ResolvedFeatureMapState {
  sources: FeatureMapSourceState[];
  inputs: EngineInput[];
  gaps: Gap[];
}

const UNAVAILABLE: UnavailableLayer = { available: false };
const adminRoles: Record<MapAdminLayer, string> = { regions: "admin:region", governorates: "admin:governorate" };
export const BOUNDARY_ROLE = "admin:country";

/** The Map's own words for why it has nothing to offer: a state, never an error. */
function mapStateWord(description: MapDescription): string | null {
  const { runtime, release } = description;
  if (runtime === null) return "not configured";
  if (runtime.status !== "enabled") return runtime.status;
  if (runtime.publishedReleaseId === null || release === null || release.status !== "Published") return "no published release";
  return null;
}

export function resolveMapState(args: ResolveMapStateArgs): ResolvedMapState {
  const { published, pinned, placeRoles, policy, evaluatedAt } = args;
  const includeContext = args.includeContext ?? true;
  const gaps: Gap[] = [];
  const used = new Map<string, EngineInput>();
  let excluded = false;
  const unavailable = (role: string) => gaps.push(createGap(spatialGapCatalog, "DATASET_NOT_AVAILABLE", { role }));
  const keep = (input: EngineInput) => { used.set(input.id, input); };

  const stateWord = includeContext ? mapStateWord(published) : null;
  if (stateWord !== null) gaps.push(createGap(spatialGapCatalog, "MAP_NOT_PUBLISHED", { state: stateWord }));

  const resolveLayer = (description: MapDescription, layerKey: string, roles: readonly string[], roleForGap: string): LayerState => {
    const facts = description.layers.find((layer) => layer.id === layerKey);
    if (description.release === null || facts === undefined || !facts.hasFeatures) { unavailable(roleForGap); return UNAVAILABLE; }
    const registration = assessMapRegistration(description, { provenance: facts.provenance, binding: facts.binding });
    if (!registration.registered && policy === "REGISTERED_ONLY") { excluded = true; unavailable(roleForGap); return UNAVAILABLE; }
    const input = buildMapLayerInput({ layerKey, roles, release: description.release, boundary: description.boundary, provenance: facts.provenance, registered: registration.registered, evaluatedAt });
    keep(input);
    return { available: true, input, releaseId: description.release.id, layerKey };
  };

  // The national boundary of the published release.
  let boundary: LayerState = UNAVAILABLE;
  if (includeContext && (published.release === null || published.boundary === null)) unavailable(BOUNDARY_ROLE);
  else if (includeContext && published.boundary !== null && published.release !== null) {
    const registration = assessMapRegistration(published, { provenance: published.boundary.provenance, binding: null });
    if (!registration.registered && policy === "REGISTERED_ONLY") { excluded = true; unavailable(BOUNDARY_ROLE); }
    else {
      const input = buildMapBoundaryInput({ roles: [BOUNDARY_ROLE], release: published.release, boundary: published.boundary, registered: registration.registered, evaluatedAt });
      keep(input);
      boundary = { available: true, input, releaseId: published.release.id, layerKey: "boundary" };
    }
  }

  const levels = {} as Record<MapAdminLayer, LayerState>;
  for (const level of mapAdminLayers) {
    levels[level] = includeContext ? resolveLayer(published, level, [adminRoles[level]], adminRoles[level]) : UNAVAILABLE;
  }

  // Place roles that read the same release share one place input; each role still gets its own availability. A pin to the published release is no pin at all.
  const releaseOf = (releaseId: string | null) => (releaseId !== null && releaseId === published.release?.id ? null : releaseId);
  const byRelease = new Map<string | null, string[]>();
  for (const { role, releaseId } of includeContext ? placeRoles : []) byRelease.set(releaseOf(releaseId), [...(byRelease.get(releaseOf(releaseId)) ?? []), role]);
  const placeLayerByRelease = new Map<string | null, LayerState>();
  for (const [releaseId, roles] of [...byRelease.entries()].sort((first, second) => compareText(first[0] ?? "", second[0] ?? ""))) {
    const description = releaseId === null ? published : pinned.get(releaseId);
    if (description === undefined) { for (const role of roles) unavailable(role); placeLayerByRelease.set(releaseId, UNAVAILABLE); continue; }
    // One input serves all the roles of a release; when it cannot be used, every one of those roles reports that it has no data.
    const layer = resolveLayer(description, "places", roles, roles[0] as string);
    if (!layer.available) for (const extra of roles.slice(1)) unavailable(extra);
    placeLayerByRelease.set(releaseId, layer);
  }
  const places = placeRoles
    .map(({ role, releaseId }) => ({ role, layer: placeLayerByRelease.get(releaseOf(releaseId)) ?? UNAVAILABLE }))
    .sort((first, second) => compareText(first.role, second.role));

  if (excluded) gaps.push(createGap(spatialGapCatalog, "UNREGISTERED_LAYERS_EXCLUDED"));
  return {
    state: { publishedReleaseId: published.release?.id ?? null, boundary, boundaryFacts: published.boundary, levels, places },
    inputs: [...used.values()].sort((first, second) => compareText(first.id, second.id)),
    gaps: normalizeGaps(gaps),
  };
}

/** Resolves Map-backed measurement roles under the same registration policy used by LOCATION_CONTEXT. */
export function resolveFeatureMapState(args: {
  published: MapDescription;
  pinned: ReadonlyMap<string, MapDescription>;
  requests: readonly FeatureMapRequest[];
  policy: MapLayerPolicy;
  evaluatedAt: string;
}): ResolvedFeatureMapState {
  const { published, pinned, policy, evaluatedAt } = args;
  const gaps: Gap[] = [];
  const inputs = new Map<string, EngineInput>();
  const sources: FeatureMapSourceState[] = [];
  let excluded = false;
  const normalized = args.requests.map((request) => ({
    ...request,
    releaseId: request.releaseId !== null && request.releaseId === published.release?.id ? null : request.releaseId,
  })).sort((first, second) => compareText(first.role, second.role));
  const groups = new Map<string, FeatureMapRequest[]>();
  for (const request of normalized) {
    const key = `${request.releaseId ?? ""}\u0000${request.layerKey}`;
    groups.set(key, [...(groups.get(key) ?? []), request]);
  }

  for (const requests of groups.values()) {
    const first = requests[0];
    if (first === undefined) continue;
    const description = first.releaseId === null ? published : pinned.get(first.releaseId);
    const roles = requests.map((request) => request.role).sort(compareText);
    const unavailable = () => {
      for (const request of requests) {
        gaps.push(createGap(spatialGapCatalog, "DATASET_NOT_AVAILABLE", { role: request.role }, { subject: request.role }));
        sources.push({ ...request, layer: UNAVAILABLE });
      }
    };
    if (description === undefined || !isMapTileLayer(first.layerKey) || description.release === null) {
      unavailable();
      continue;
    }
    const facts = description.layers.find((layer) => layer.id === first.layerKey);
    if (facts === undefined || !facts.hasFeatures) {
      unavailable();
      continue;
    }
    const registration = assessMapRegistration(description, { provenance: facts.provenance, binding: facts.binding });
    if (!registration.registered && policy === "REGISTERED_ONLY") {
      excluded = true;
      unavailable();
      continue;
    }
    const input = buildMapLayerInput({
      layerKey: first.layerKey, roles, release: description.release, boundary: description.boundary,
      provenance: facts.provenance, registered: registration.registered, evaluatedAt,
    });
    inputs.set(input.id, input);
    for (const request of requests) {
      sources.push({ ...request, layer: { available: true, input, releaseId: description.release.id, layerKey: first.layerKey } });
    }
  }
  if (excluded) gaps.push(createGap(spatialGapCatalog, "UNREGISTERED_LAYERS_EXCLUDED"));
  return {
    sources: sources.sort((first, second) => compareText(first.role, second.role)),
    inputs: [...inputs.values()].sort((first, second) => compareText(first.id, second.id)),
    gaps: normalizeGaps(gaps),
  };
}
