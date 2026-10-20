import { compareText } from "../shared/canonical";
import { EngineError } from "../shared/errors";
import type { EngineEnvironment } from "../shared/states";
import { DEFAULT_CLUSTER, DEFAULT_GRID, DEFAULT_MAX_SEARCH_METERS, DEFAULT_NEAREST_COUNT, DEFAULT_RADII_METERS, spatialAnalyses } from "./constants";
import { normalizedSpatialRequestSchema, spatialRequestSchema, type SpatialDataSelection, type SpatialNormalizedRequest } from "./contracts";
import { resolveMapLayerPolicy, type MapLayerPolicy } from "./policy";

export interface NormalizeOptions {
  environment: EngineEnvironment;
  /** Clock used when the request does not pin an instant. Injected so tests and replays are exact. */
  now?: () => Date;
  /**
   * Whether the caller may pin `options.evaluatedAt`. Off by default: an earlier instant would make stale data look fresh, so only
   * replay and acceptance paths turn it on. A pinned instant is never allowed to be in the future.
   */
  allowEvaluatedAtOverride?: boolean;
}

export interface NormalizationResult {
  normalized: SpatialNormalizedRequest;
  requestId: string | null;
  evaluatedAt: string;
  /** Parameters the caller left out and the engine filled in. Listed for transparency; typing a default explicitly gives the same analysis and the same hash. */
  defaultsApplied: string[];
  mapLayerPolicy: MapLayerPolicy;
}

const FUTURE_TOLERANCE_MS = 60_000;

/** Error details travel to callers, and part of them (a key of the request) is chosen by the caller, so they are kept short. */
const MAX_DETAIL_LENGTH = 300;
function invalid(first: string, issues = 1): never {
  throw new EngineError("INVALID_INPUT", { issues, first: first.slice(0, MAX_DETAIL_LENGTH) });
}

/**
 * The canonical form of a selection: the instant a Data Center type is selected as of is written the one way (`toISOString`), so that two
 * spellings of the same instant hash the same, and it cannot lie after the evaluation instant (a selection "as of" a time that has not
 * come is not a selection of anything that was in force).
 */
function canonicalSelection(role: string, selection: SpatialDataSelection, evaluatedAt: string): SpatialDataSelection {
  if (selection.source !== "DATA_CENTER" || selection.asOf === undefined) return selection;
  const instant = Date.parse(selection.asOf);
  if (Number.isNaN(instant)) return invalid(`data.roles.${role}.asOf: not a valid instant`);
  if (instant > Date.parse(evaluatedAt) + FUTURE_TOLERANCE_MS) return invalid(`data.roles.${role}.asOf: cannot be later than the evaluation instant`);
  return { ...selection, asOf: new Date(instant).toISOString() };
}

/**
 * Validates a request and turns it into its canonical form: defaults filled in, radii sorted ascending, roles and analyses sorted and
 * de-duplicated (analyses in the order of the engine), candidates sorted by id. Two requests that ask for the same analysis normalize
 * to the same object, so they have the same hash.
 */
export function normalizeSpatialRequest(input: unknown, options: NormalizeOptions): NormalizationResult {
  const parsed = spatialRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return invalid(`${(issue?.path ?? []).join(".") || "$"}: ${issue?.message ?? "invalid request"}`, parsed.error.issues.length);
  }
  const request = parsed.data;
  const mapLayerPolicy = resolveMapLayerPolicy(options.environment, request.mapLayerPolicy);

  const now = (options.now ?? (() => new Date()))();
  const pinned = request.options?.evaluatedAt;
  if (pinned !== undefined) {
    if (!options.allowEvaluatedAtOverride) return invalid("options.evaluatedAt: pinning the evaluation instant is not allowed for this caller");
    if (Date.parse(pinned) > now.getTime() + FUTURE_TOLERANCE_MS) return invalid("options.evaluatedAt: the evaluation instant cannot be in the future");
  }

  const defaultsApplied: string[] = [];
  if (request.mapLayerPolicy === undefined) defaultsApplied.push("mapLayerPolicy");
  const evaluatedAt = pinned ?? now.toISOString();
  const dataRoles = Object.fromEntries(Object.entries(request.data?.roles ?? {}).map(([role, selection]) => [role, canonicalSelection(role, selection, evaluatedAt)]));
  const parameters = request.parameters ?? {};
  const orDefault = <T>(name: string, value: T | undefined, fallback: T): T => {
    if (value !== undefined) return value;
    defaultsApplied.push(`parameters.${name}`);
    return fallback;
  };
  const radiiMeters = [...new Set(orDefault<readonly number[]>("radiiMeters", parameters.radiiMeters, DEFAULT_RADII_METERS))].sort((first, second) => first - second);
  const roles = [...new Set(orDefault<readonly string[]>("roles", parameters.roles, []))].sort(compareText);
  const requested = new Set(request.analyses);

  const normalized: SpatialNormalizedRequest = {
    contract: request.contract,
    analyses: spatialAnalyses.filter((analysis) => requested.has(analysis)),
    location: request.location,
    candidates: [...(request.candidates ?? [])].sort((first, second) => compareText(first.id, second.id)),
    parameters: {
      radiiMeters,
      roles,
      nearestCount: orDefault("nearestCount", parameters.nearestCount, DEFAULT_NEAREST_COUNT),
      maxSearchMeters: orDefault("maxSearchMeters", parameters.maxSearchMeters, DEFAULT_MAX_SEARCH_METERS),
      cluster: orDefault("cluster", parameters.cluster, { epsMeters: DEFAULT_CLUSTER.epsMeters, minPoints: DEFAULT_CLUSTER.minPoints }),
      grid: orDefault("grid", parameters.grid, { cellMeters: DEFAULT_GRID.cellMeters }),
    },
    data: { roles: dataRoles },
  };
  const checked = normalizedSpatialRequestSchema.safeParse(normalized);
  if (!checked.success) throw new EngineError("CONTRACT_VIOLATION", { reason: "normalized_request_invalid", first: checked.error.issues[0]?.message ?? "invalid" });

  return {
    normalized: checked.data,
    requestId: request.options?.requestId ?? null,
    evaluatedAt,
    defaultsApplied: defaultsApplied.sort(compareText),
    mapLayerPolicy,
  };
}
