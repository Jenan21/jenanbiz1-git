import {
  computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, EngineError, createGap, normalizeGaps, compareText,
  type DataAvailability, type EngineEnvironment, type Gap,
} from "../shared";
import { PRIMARY_TARGET_ID, SPATIAL_ENGINE_KEY, SPATIAL_ENGINE_VERSION, SPATIAL_REQUEST_CONTRACT, SPATIAL_RESULT_CONTRACT, SPATIAL_SUPPORTED_ANALYSES, spatialExclusions } from "./constants";
import { spatialConfidencePolicy } from "./confidence";
import { isPlaceRole, spatialResultSchema, type SpatialNormalizedRequest, type SpatialResult } from "./contracts";
import { spatialGapCatalog } from "./gaps";
import { computeLocationContext, type ContextTarget, type TargetContext } from "./location-context";
import { mapAdminLayers, mapLayerForRole, type MapDescription } from "./map-contract";
import type { GeometryCheck, SpatialMapPort } from "./map-port";
import { MapReadError } from "./map-read-error";
import { BOUNDARY_ROLE, resolveMapState, type LayerState, type LocationContextMapState } from "./map-state";
import { prepareSpatialRequest } from "./prepare";
import type { SpatialBackendCapabilities } from "./ports";

/**
 * Runs the Spatial Engine for the analyses this version implements (LOCATION_CONTEXT). The engine reads the Map through a port and writes
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
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const backendUnavailable = (reason: string) => new EngineError("BACKEND_UNAVAILABLE", { backend: "POSTGIS", reason });
const reasonOf = (error: unknown) => (error instanceof MapReadError ? error.kind : "UNKNOWN");

/**
 * Reads the pins of the request. The Data Center cannot be read yet, so a pin to it is refused instead of being silently ignored. A pin to a
 * Map layer must name the layer the role is read from, and its release, if any, must be a release id.
 */
function readPins(request: SpatialNormalizedRequest, placeRoles: readonly string[]): Map<string, string | null> {
  const pins = new Map<string, string | null>();
  for (const [role, selection] of Object.entries(request.data.roles)) {
    if (selection.source === "DATA_CENTER") throw new EngineError("INVALID_INPUT", { reason: "data_center_pin_not_supported", role: clip(role, 80) });
    if (!placeRoles.includes(role)) continue; // LOCATION_CONTEXT reads place roles only
    if (selection.layerKey !== mapLayerForRole(role)) throw new EngineError("INVALID_INPUT", { reason: "map_pin_layer_mismatch", role: clip(role, 80) });
    if (selection.releaseId !== undefined && !UUID.test(selection.releaseId)) throw new EngineError("INVALID_INPUT", { reason: "map_pin_release_invalid", role: clip(role, 80) });
    pins.set(role, selection.releaseId ?? null);
  }
  return pins;
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
  const placeRoles = normalized.parameters.roles.filter(isPlaceRole);
  const pins = readPins(normalized, placeRoles);

  const capabilities = await probe(port, options.requireReadOnlyRole ?? options.environment === "production");
  const targets: ContextTarget[] = [{ id: PRIMARY_TARGET_ID, location: normalized.location }, ...normalized.candidates.map((candidate) => ({ id: candidate.id, location: candidate.location }))];
  await checkTargets(port, targets);

  // What the Map offers: the published release for the boundary, the administrative levels and unpinned places, and each pinned release for its places.
  let published: MapDescription;
  const pinned = new Map<string, MapDescription>();
  try {
    published = await port.describeMap({ layers: [...mapAdminLayers, ...(placeRoles.length > 0 ? ["places"] : [])] });
    for (const releaseId of new Set([...pins.values()].filter((id): id is string => id !== null))) pinned.set(releaseId, await port.describeMap({ releaseId, layers: ["places"] }));
  } catch (error) {
    throw backendUnavailable(reasonOf(error));
  }
  const resolved = resolveMapState({ published, pinned, placeRoles: placeRoles.map((role) => ({ role, releaseId: pins.get(role) ?? null })), policy: prepared.mapLayerPolicy, evaluatedAt });

  const contexts: Array<{ target: ContextTarget; context: TargetContext }> = [];
  for (const target of targets) contexts.push({ target, context: await computeLocationContext(port, resolved.state, target, { maxSearchMeters: normalized.parameters.maxSearchMeters, evaluatedAt }) });
  const results = contexts.map(({ target, context }) => ({ analysis: "LOCATION_CONTEXT" as const, target: target.id, metrics: context.metrics }));

  // ------------------------------------------------------------------------------------------------------------------ gaps
  const { inputs } = resolved;
  const unofficial = resolved.state.boundaryFacts === null || !resolved.state.boundaryFacts.official;
  const gaps: Gap[] = [...resolved.gaps, ...inputs.flatMap((entry) => deriveInputGaps(entry)), ...contexts.flatMap(({ context }) => context.gaps)];
  if (unofficial) for (const entry of inputs.filter((candidate) => candidate.roles.some((role) => role.startsWith("admin:")))) gaps.push(createGap(spatialGapCatalog, "BOUNDARY_UNOFFICIAL", { dataset: entry.ref.label }, { inputId: entry.id }));
  if (results.some((entry) => entry.metrics.some((metric) => metric.valueKind === "DISTANCE"))) gaps.push(createGap(spatialGapCatalog, "NETWORK_ANALYSIS_NOT_SUPPORTED"));
  const normalizedGaps = normalizeGaps(gaps);

  const dataAvailability = availabilityOf(resolved.state, contexts.map(({ context }) => context.coverage));
  const finishedAt = options.clock();
  const result = {
    contract: SPATIAL_RESULT_CONTRACT,
    runId: options.newRunId(),
    evaluatedAt,
    engine: {
      key: SPATIAL_ENGINE_KEY, version: SPATIAL_ENGINE_VERSION, contracts: { request: SPATIAL_REQUEST_CONTRACT, result: SPATIAL_RESULT_CONTRACT }, environment: options.environment,
      policies: [spatialConfidencePolicy],
      runtime: { backend: capabilities.backend, placement: capabilities.placement, postgis: capabilities.postgis, geos: capabilities.geos, proj: capabilities.proj },
      capabilities: { analyses: [...SPATIAL_SUPPORTED_ANALYSES], excluded: [...spatialExclusions] },
    },
    status: deriveRunStatus(results.flatMap((entry) => entry.metrics), normalizedGaps),
    request: { normalized, defaultsApplied: prepared.defaultsApplied, mapLayerPolicy: prepared.mapLayerPolicy },
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
