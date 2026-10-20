import {
  computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, normalizeGaps, type EngineEnvironment, type EngineInput, type EngineMetric, type Gap,
} from "@/services/analysis-engines/shared";
import {
  prepareSpatialRequest, scoreSpatialConfidence, SPATIAL_ENGINE_KEY, SPATIAL_ENGINE_VERSION, SPATIAL_REQUEST_CONTRACT, SPATIAL_RESULT_CONTRACT, spatialConfidencePolicy, spatialExclusions,
  type SpatialConfidenceDataset, type SpatialRequestInput, type SpatialResult,
} from "@/services/analysis-engines/spatial";
import { evaluatedAt, makeInput } from "./analysis-engine-fixtures";
import { baseRequest } from "./spatial-request-fixtures";

export { baseRequest, circleRing, riyadh, square } from "./spatial-request-fixtures";

export const cleanDataset = (input: EngineInput = makeInput({ freshness: { status: "FRESH", sourcePublishedAt: evaluatedAt, freshnessDays: 90, expiresAt: null } })): SpatialConfidenceDataset => ({
  input, coverage: { status: "FULL" }, geometry: { fit: "EXACT", positionalAccuracy: "DECLARED", valid: true },
});

export interface SpatialResultOptions {
  request?: SpatialRequestInput;
  /** Custom inputs need custom metrics that refer to them. */
  inputs?: EngineInput[];
  metrics?: EngineMetric[];
  extraGaps?: Gap[];
  environment?: EngineEnvironment;
}

/** A complete, valid Spatial result for one point, one analysis and one dataset, built through the real preparation and scoring path. */
export function makeSpatialResult(options: SpatialResultOptions = {}): SpatialResult & Record<string, unknown> {
  if (options.inputs && !options.metrics) throw new Error("custom inputs need custom metrics that refer to them");
  const environment = options.environment ?? "test";
  const prepared = prepareSpatialRequest(options.request ?? baseRequest(), { environment, now: () => new Date(evaluatedAt) });
  const defaultInput = makeInput({ freshness: { status: "FRESH", sourcePublishedAt: evaluatedAt, freshnessDays: 90, expiresAt: null } });
  const inputs = [...(options.inputs ?? [defaultInput])].sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0));
  const outcome = scoreSpatialConfidence({ datasets: [cleanDataset(defaultInput)], requestedRoles: 1, availableRoles: 1, valueKind: "DISTANCE", estimated: false, fallbackApplied: false, evaluatedAt });
  if (outcome.kind !== "SCORED") throw new Error("fixture must be scorable");
  const metrics = options.metrics ?? [{
    key: "proximity.poi:hospital.n1.distance", label: { ar: "أقرب مستشفى", en: "Nearest hospital" }, status: "COMPUTED" as const, platformState: "COMPUTED" as const,
    valueKind: "DISTANCE" as const, unit: "m" as const, value: 1250, interpretation: "MAPPED_FEATURES_ONLY" as const, inputRefs: [defaultInput.id], confidence: outcome.breakdown, limitations: [],
  }];
  const gaps = normalizeGaps([...inputs.flatMap((input) => deriveInputGaps(input)), ...(options.inputs ? [] : outcome.gaps), ...(options.extraGaps ?? [])]);
  const roles = [...new Set(inputs.flatMap((input) => input.roles))].sort();
  const result = {
    contract: SPATIAL_RESULT_CONTRACT, runId: "run-1", evaluatedAt: prepared.evaluatedAt,
    engine: {
      key: SPATIAL_ENGINE_KEY, version: SPATIAL_ENGINE_VERSION, contracts: { request: SPATIAL_REQUEST_CONTRACT, result: SPATIAL_RESULT_CONTRACT }, environment,
      policies: [spatialConfidencePolicy], runtime: { backend: "NONE" as const, placement: null, postgis: null, geos: null, proj: null },
      capabilities: { analyses: [...prepared.normalized.analyses], excluded: [...spatialExclusions] },
    },
    status: "COMPLETED" as const,
    request: { normalized: prepared.normalized, defaultsApplied: prepared.defaultsApplied, mapLayerPolicy: prepared.mapLayerPolicy },
    inputs,
    dataAvailability: roles.map((role) => ({ role, status: "AVAILABLE" as const, inputIds: inputs.filter((input) => input.roles.includes(role)).map((input) => input.id) })),
    results: [{ analysis: prepared.normalized.analyses[0] as SpatialResult["results"][number]["analysis"], target: "primary", metrics }],
    gaps, attribution: deriveAttribution(inputs), rights: deriveRights(inputs),
    determinism: { requestHash: "a".repeat(64), inputsHash: "a".repeat(64), outputHash: "a".repeat(64) },
    limits: { costUnits: prepared.cost.units, budgetUnits: prepared.cost.budgetUnits },
    timing: { startedAt: "2026-10-20T12:00:00.100Z", finishedAt: "2026-10-20T12:00:00.250Z", durationMs: 150 },
  };
  const cloned = structuredClone(result) as unknown as SpatialResult & Record<string, unknown>;
  return resealSpatial(cloned);
}

export function resealSpatial<T extends SpatialResult & Record<string, unknown>>(result: T): T {
  result.status = deriveRunStatus(result.results.flatMap((entry) => entry.metrics), result.gaps);
  result.determinism = computeDeterminism(result);
  return result;
}
