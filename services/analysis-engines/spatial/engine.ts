import {
  computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, EngineError, createGap, normalizeGaps, compareText,
  type DataAvailability, type EngineEnvironment, type EngineInput, type Gap,
} from "../shared";
import { DataCenterProviderError, type SpatialDataCenterPort } from "./data-center-port";
import { PRIMARY_TARGET_ID, SPATIAL_ENGINE_KEY, SPATIAL_ENGINE_VERSION, SPATIAL_REQUEST_CONTRACT, SPATIAL_RESULT_CONTRACT, SPATIAL_SUPPORTED_ANALYSES, spatialExclusions } from "./constants";
import { spatialConfidencePolicy } from "./confidence";
import { compareAnalysisResults, isFeatureRole, isPlaceRole, isPopulationRole, spatialResultSchema, type SpatialNormalizedRequest, type SpatialResult } from "./contracts";
import { spatialGapCatalog } from "./gaps";
import { computeLocationContext, type ContextTarget, type TargetContext } from "./location-context";
import { mapAdminLayers, mapLayerForRole, type MapDescription } from "./map-contract";
import type { GeometryCheck, SpatialMapPort } from "./map-port";
import { MapReadError } from "./map-read-error";
import { BOUNDARY_ROLE, resolveFeatureMapState, resolveMapState, type FeatureMapRequest, type LayerState, type LocationContextMapState } from "./map-state";
import { dataSourceRequestsOf, resolveSpatialDataSources, type DataCenterRunInputProvenance } from "./data-sources";
import { targetGeography } from "./dataset-features";
import { resolveFeatureSources, runFeatureAnalyses } from "./feature-analysis";
import { prepareSpatialRequest } from "./prepare";
import type { SpatialBackendCapabilities } from "./ports";

/**
 * Runs the Spatial Engine for the analyses this version implements. The engine reads the Map through a port and writes
 * nothing; the clock and the run id are injected, so a run can be replayed exactly. Whatever the engine returns has been checked against
 * its own result contract, and a result that breaks it is never returned.
 */
export interface RunSpatialOptions {
  environment: EngineEnvironment;
  /** The only source of time the engine uses. */
  clock: () => Date;
  newRunId: () => string;
  /** The server's budget in cost units; a caller cannot choose it. */
  budgetUnits?: number;
  /** Lets the request pin `options.evaluatedAt` (replay and acceptance paths only). */
  allowEvaluatedAtOverride?: boolean;
  /** Refuse to run when the connected role could write to the Map. On by default in production. */
  requireReadOnlyRole?: boolean;
  /** The actor-scoped Data Center adapter; absent configuration yields per-role unavailable outcomes, never a Map fallback. */
  dataCenterPort?: SpatialDataCenterPort;
  /** Internal persistence hook; provenance is captured separately from the engine's public input descriptor. */
  captureDataCenterInput?: (inputId: string, provenance: DataCenterRunInputProvenance) => void;
  /** Exact pins and envelope metadata supplied only by the persisted-run replay service. */
  replay?: {
    mapReleaseId: string | null;
    mapReleaseByRole: Readonly<Record<string, string>>;
    defaultsApplied: readonly string[];
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const backendUnavailable = (reason: string) => new EngineError("BACKEND_UNAVAILABLE", { backend: "POSTGIS", reason });
const reasonOf = (error: unknown) => (error instanceof MapReadError ? error.kind : "UNKNOWN");

/**
 * Reads the pins of the request. LOCATION_CONTEXT reads places from the Map, so a pin to a Data Center dataset for a place role is refused
 * rather than silently replaced by Map data; a pin to a Map layer must name the layer the role is read from, and its release, if any, must
 * be a release id. A pin for a role this analysis does not read (a point of interest, a road) is not used and not resolved, as for a role
 * with no pin: the Data Center datasets those roles select are read by the analyses that measure them.
 */
function readPins(request: SpatialNormalizedRequest, placeRoles: readonly string[], measuredRoles: ReadonlySet<string>): Map<string, string | null> {
  const pins = new Map<string, string | null>();
  for (const [role, selection] of Object.entries(request.data.roles)) {
    const contextPlace = placeRoles.includes(role);
    if (!contextPlace && !measuredRoles.has(role)) continue;
    if (selection.source === "DATA_CENTER") {
      if (contextPlace) throw new EngineError("INVALID_INPUT", { reason: "data_center_pin_for_map_role", role: clip(role, 80) });
      continue;
    }
    if (selection.layerKey !== mapLayerForRole(role)) throw new EngineError("INVALID_INPUT", { reason: "map_pin_layer_mismatch", role: clip(role, 80) });
    if (selection.releaseId !== undefined && !UUID.test(selection.releaseId)) throw new EngineError("INVALID_INPUT", { reason: "map_pin_release_invalid", role: clip(role, 80) });
    pins.set(role, selection.releaseId ?? null);
  }
  return pins;
}

function unavailableDataCenter(): SpatialDataCenterPort {
  const unavailable = async (): Promise<never> => { throw new DataCenterProviderError("UNAVAILABLE"); };
  return { discover: unavailable, readContent: unavailable, resolveMapReference: unavailable };
}

function uniqueInputs(...groups: readonly EngineInput[][]): EngineInput[] {
  const inputs = new Map<string, EngineInput>();
  for (const group of groups) for (const input of group) {
    const prior = inputs.get(input.id);
    inputs.set(input.id, prior === undefined ? input : { ...prior, roles: [...new Set([...prior.roles, ...input.roles])].sort(compareText) });
  }
  return [...inputs.values()].sort((first, second) => compareText(first.id, second.id));
}

function mergeAvailability(groups: readonly DataAvailability[][]): DataAvailability[] {
  const byRole = new Map<string, DataAvailability>();
  for (const group of groups) for (const entry of group) {
    const prior = byRole.get(entry.role);
    if (prior === undefined) { byRole.set(entry.role, entry); continue; }
    const statuses = [prior.status, entry.status];
    const status: DataAvailability["status"] = statuses.includes("AVAILABLE") ? "AVAILABLE"
      : statuses.includes("NO_COVERAGE") ? "NO_COVERAGE" : statuses.includes("EXPIRED") ? "EXPIRED" : "NOT_AVAILABLE";
    byRole.set(entry.role, { role: entry.role, status, inputIds: [...new Set([...prior.inputIds, ...entry.inputIds])].sort(compareText) });
  }
  return [...byRole.values()].sort((first, second) => compareText(first.role, second.role));
}

function featureMapRequests(request: SpatialNormalizedRequest, roles: readonly string[], pins: ReadonlyMap<string, string | null>): FeatureMapRequest[] {
  return roles.flatMap((role) => {
    const selection = request.data.roles[role];
    if (selection?.source === "DATA_CENTER") return [];
    const layerKey = selection?.source === "MAP" ? selection.layerKey : mapLayerForRole(role);
    if (layerKey === null || layerKey === undefined) return [];
    return [{ role, layerKey, releaseId: selection?.source === "MAP" ? selection.releaseId ?? pins.get(role) ?? null : pins.get(role) ?? null }];
  }).sort((first, second) => compareText(first.role, second.role));
}

function selectionsForRoles(request: SpatialNormalizedRequest, roles: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(request.data.roles).filter(([role]) => roles.has(role)));
}

function metricRoles(request: SpatialNormalizedRequest): string[] {
  if (!request.analyses.some((analysis) => analysis === "PROXIMITY" || analysis === "CATCHMENT")) return [];
  const roles = request.parameters.roles.filter(isFeatureRole);
  if (request.analyses.includes("CATCHMENT")) roles.push(...request.parameters.roles.filter(isPopulationRole));
  return [...new Set(roles)].sort(compareText);
}

async function probe(port: SpatialMapPort, requireReadOnlyRole: boolean): Promise<SpatialBackendCapabilities> {
  let capabilities: SpatialBackendCapabilities;
  try {
    capabilities = await port.capabilities();
  } catch (error) {
    throw backendUnavailable(reasonOf(error));
  }
  if (capabilities.contractProblems.length > 0) throw backendUnavailable("MAP_CONTRACT_MISMATCH");
  if (!capabilities.mapSchemaReachable) throw backendUnavailable("MAP_NOT_REACHABLE");
  if (requireReadOnlyRole && capabilities.roleCanWrite) throw backendUnavailable("ROLE_CAN_WRITE");
  return capabilities;
}

async function checkTargets(port: SpatialMapPort, targets: readonly ContextTarget[]): Promise<void> {
  let checks: GeometryCheck[];
  try {
    checks = await port.checkGeometries(targets.map((target) => target.location));
  } catch (error) {
    if (error instanceof MapReadError && error.kind === "INVALID_GEOMETRY") throw new EngineError("INVALID_INPUT", { reason: "invalid_geometry" });
    throw backendUnavailable(reasonOf(error));
  }
  if (checks.length !== targets.length) throw new EngineError("CONTRACT_VIOLATION", { reason: "geometry_check_count" });
  checks.forEach((check, index) => {
    if (!check.valid) throw new EngineError("INVALID_INPUT", { reason: "invalid_geometry", target: (targets[index] as ContextTarget).id, detail: clip(check.reason, 200) });
  });
}

export async function runSpatialAnalysis(port: SpatialMapPort, input: unknown, options: RunSpatialOptions): Promise<SpatialResult> {
  const startedAt = options.clock();
  const prepared = prepareSpatialRequest(input, {
    environment: options.environment, now: options.clock,
    ...(options.allowEvaluatedAtOverride === undefined ? {} : { allowEvaluatedAtOverride: options.allowEvaluatedAtOverride }),
    ...(options.budgetUnits === undefined ? {} : { budgetUnits: options.budgetUnits }),
  });
  const { normalized, evaluatedAt } = prepared;
  const unsupported = normalized.analyses.find((analysis) => !(SPATIAL_SUPPORTED_ANALYSES as readonly string[]).includes(analysis));
  if (unsupported !== undefined) throw new EngineError("INVALID_INPUT", { reason: "analysis_not_supported", analysis: unsupported });
  const wantsContext = normalized.analyses.includes("LOCATION_CONTEXT");
  const placeRoles = wantsContext ? normalized.parameters.roles.filter(isPlaceRole) : [];
  const measuredRoles = metricRoles(normalized);
  const featureRoleCount = normalized.parameters.roles.filter(isFeatureRole).length;
  const populationRoleCount = normalized.parameters.roles.filter(isPopulationRole).length;
  const proximityMetricCount = normalized.analyses.includes("PROXIMITY")
    ? featureRoleCount * normalized.parameters.nearestCount * 3 : 0;
  const catchmentMetricCount = normalized.analyses.includes("CATCHMENT")
    ? (featureRoleCount + populationRoleCount) * normalized.parameters.radiiMeters.length : 0;
  const requestedMetricCount = Math.max(proximityMetricCount, catchmentMetricCount);
  if (requestedMetricCount > 500) throw new EngineError("REQUEST_TOO_LARGE", { reason: "result_metric_limit", maximum: 500, requested: requestedMetricCount });
  const pins = readPins(normalized, placeRoles, new Set(measuredRoles));
  if (options.replay) for (const role of [...new Set([...placeRoles, ...measuredRoles])]) {
    if (pins.get(role) == null && options.replay.mapReleaseByRole[role] !== undefined) pins.set(role, options.replay.mapReleaseByRole[role] as string);
  }

  const capabilities = await probe(port, options.requireReadOnlyRole ?? options.environment === "production");
  const targets: ContextTarget[] = [{ id: PRIMARY_TARGET_ID, location: normalized.location }, ...normalized.candidates.map((candidate) => ({ id: candidate.id, location: candidate.location }))];
  await checkTargets(port, targets);

  const mapRequests = featureMapRequests(normalized, measuredRoles, pins);
  const describedLayers = [
    ...(wantsContext ? [...mapAdminLayers, ...(placeRoles.length > 0 ? ["places"] : [])] : []),
    ...mapRequests.filter((request) => request.releaseId === null).map((request) => request.layerKey),
  ];
  let published: MapDescription;
  const pinned = new Map<string, MapDescription>();
  try {
    const publishedRequest = options.replay === undefined
      ? { layers: [...new Set(describedLayers)].sort(compareText) }
      : { releaseId: options.replay.mapReleaseId, layers: [...new Set(describedLayers)].sort(compareText) };
    published = await port.describeMap(publishedRequest);
    const layersByRelease = new Map<string, string[]>();
    for (const { layerKey, releaseId } of mapRequests) if (releaseId !== null && releaseId !== published.release?.id) {
      layersByRelease.set(releaseId, [...(layersByRelease.get(releaseId) ?? []), layerKey]);
    }
    for (const role of placeRoles) {
      const releaseId = pins.get(role);
      if (releaseId !== undefined && releaseId !== null && releaseId !== published.release?.id) {
        layersByRelease.set(releaseId, [...(layersByRelease.get(releaseId) ?? []), "places"]);
      }
    }
    for (const [releaseId, layers] of [...layersByRelease.entries()].sort(([first], [second]) => compareText(first, second))) {
      pinned.set(releaseId, await port.describeMap({ releaseId, layers: [...new Set(layers)].sort(compareText) }));
    }
  } catch (error) {
    throw backendUnavailable(reasonOf(error));
  }
  const resolved = resolveMapState({
    published, pinned, placeRoles: placeRoles.map((role) => ({ role, releaseId: pins.get(role) ?? null })),
    policy: prepared.mapLayerPolicy, evaluatedAt, includeContext: wantsContext,
  });
  const resolvedMapFeatures = resolveFeatureMapState({ published, pinned, requests: mapRequests, policy: prepared.mapLayerPolicy, evaluatedAt });

  const dcRoleSet = new Set(measuredRoles);
  const selections = selectionsForRoles(normalized, dcRoleSet);
  const discoveryRequests = dataSourceRequestsOf(selections, {
    geography: measuredRoles.length === 0 ? undefined : targetGeography(targets.map((target) => target.location), Math.max(normalized.parameters.maxSearchMeters, ...normalized.parameters.radiiMeters)),
  });
  const dataCenter = await resolveSpatialDataSources({
    requests: discoveryRequests, port: options.dataCenterPort ?? unavailableDataCenter(), evaluatedAt,
    ...(options.captureDataCenterInput === undefined ? {} : { onInputResolved: options.captureDataCenterInput }),
  });
  const featureSources = resolveFeatureSources(resolvedMapFeatures.sources, dataCenter.sources, measuredRoles);

  const contexts: Array<{ target: ContextTarget; context: TargetContext }> = [];
  if (wantsContext) for (const target of targets) {
    contexts.push({ target, context: await computeLocationContext(port, resolved.state, target, { maxSearchMeters: normalized.parameters.maxSearchMeters, evaluatedAt }) });
  }
  const contextResults = contexts.map(({ target, context }) => ({ analysis: "LOCATION_CONTEXT" as const, target: target.id, metrics: context.metrics }));
  const featureResults = await runFeatureAnalyses({
    port, targets, sources: featureSources, analyses: normalized.analyses, parameters: normalized.parameters, evaluatedAt,
  });
  const results = [...contextResults, ...featureResults.results].sort(compareAnalysisResults);

  // ------------------------------------------------------------------------------------------------------------------ gaps
  const inputs = uniqueInputs(resolved.inputs, resolvedMapFeatures.inputs, dataCenter.inputs);
  const unofficial = resolved.state.boundaryFacts === null || !resolved.state.boundaryFacts.official;
  const gaps: Gap[] = [
    ...resolved.gaps, ...resolvedMapFeatures.gaps, ...dataCenter.gaps, ...featureResults.gaps,
    ...inputs.flatMap((entry) => deriveInputGaps(entry)), ...contexts.flatMap(({ context }) => context.gaps),
  ];
  if (wantsContext && unofficial) for (const entry of inputs.filter((candidate) => candidate.roles.some((role) => role.startsWith("admin:")))) {
    gaps.push(createGap(spatialGapCatalog, "BOUNDARY_UNOFFICIAL", { dataset: entry.ref.label }, { inputId: entry.id }));
  }
  if (results.some((entry) => entry.metrics.some((metric) => metric.valueKind === "DISTANCE"))) gaps.push(createGap(spatialGapCatalog, "NETWORK_ANALYSIS_NOT_SUPPORTED"));
  const normalizedGaps = normalizeGaps(gaps);

  const dataAvailability = mergeAvailability([
    ...(wantsContext ? [availabilityOf(resolved.state, contexts.map(({ context }) => context.coverage))] : []),
    featureResults.dataAvailability,
  ]);
  const finishedAt = options.clock();
  const result = {
    contract: SPATIAL_RESULT_CONTRACT,
    runId: options.newRunId(),
    evaluatedAt,
    engine: {
      key: SPATIAL_ENGINE_KEY, version: SPATIAL_ENGINE_VERSION, contracts: { request: SPATIAL_REQUEST_CONTRACT, result: SPATIAL_RESULT_CONTRACT }, environment: options.environment,
      policies: [spatialConfidencePolicy],
      runtime: { backend: capabilities.backend, placement: capabilities.placement, postgis: capabilities.postgis, geos: capabilities.geos, proj: capabilities.proj, mapReleaseId: resolved.state.publishedReleaseId },
      capabilities: { analyses: [...SPATIAL_SUPPORTED_ANALYSES], excluded: [...spatialExclusions] },
    },
    status: deriveRunStatus(results.flatMap((entry) => entry.metrics), normalizedGaps),
    request: { normalized, defaultsApplied: options.replay?.defaultsApplied ?? prepared.defaultsApplied, mapLayerPolicy: prepared.mapLayerPolicy },
    inputs,
    dataAvailability,
    results,
    gaps: normalizedGaps,
    attribution: deriveAttribution(inputs),
    rights: deriveRights(inputs),
    determinism: { requestHash: "0".repeat(64), inputsHash: "0".repeat(64), outputHash: "0".repeat(64) },
    limits: { costUnits: prepared.cost.units, budgetUnits: prepared.cost.budgetUnits },
    timing: { startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()) },
  };
  result.determinism = computeDeterminism(result);

  const checked = spatialResultSchema.safeParse(result);
  if (!checked.success) throw new EngineError("CONTRACT_VIOLATION", { reason: "result_invalid", first: clip(checked.error.issues[0]?.message ?? "invalid", 300) });
  return checked.data;
}

/** Which data each role had. A role is NO_COVERAGE only when every target lies outside the national boundary; the boundary itself defines the coverage. */
function availabilityOf(state: LocationContextMapState, coverages: ReadonlyArray<TargetContext["coverage"]>): DataAvailability[] {
  const entry = (role: string, layer: LayerState, coverageApplies: boolean): DataAvailability => {
    if (!layer.available) return { role, status: "NOT_AVAILABLE", inputIds: [] };
    const outside = coverageApplies && coverages.length > 0 && coverages.every((coverage) => coverage === "NONE");
    return { role, status: outside ? "NO_COVERAGE" : "AVAILABLE", inputIds: [layer.input.id] };
  };
  const roles: DataAvailability[] = [
    entry(BOUNDARY_ROLE, state.boundary, false),
    entry("admin:region", state.levels.regions, true),
    entry("admin:governorate", state.levels.governorates, true),
    ...state.places.map((place) => entry(place.role, place.layer, true)),
  ];
  return roles.sort((first, second) => compareText(first.role, second.role));
}
