import { compareText, roundTo } from "../shared/canonical";
import type { EngineMetric } from "../shared/contracts";
import { createGap, normalizeGaps, type Gap } from "../shared/gaps";
import { platformStateFor, type MetricStatus } from "../shared/states";
import { scoreSpatialConfidence, metricStatusForBlocks } from "./confidence";
import { isConstraintRole, isFeatureRole, type SpatialParameters } from "./contracts";
import { coverageFor } from "./coverage";
import { dataCenterFeature, type FeatureSource } from "./feature-analysis";
import { spatialGapCatalog } from "./gaps";
import type { ContextTarget } from "./location-context";
import type { SpatialMapPort, SpatialMeasureResult } from "./map-port";
import { MapReadError } from "./map-read-error";

type Analysis = "DENSITY" | "CONSTRAINT_SCREENING";
interface Seed {
  key: string;
  kind: EngineMetric["valueKind"];
  unit: EngineMetric["unit"];
  value: number | null;
  method: string;
  radius: number;
  unsupported?: boolean;
}
export interface AdvancedResult { analysis: Analysis; target: string; metrics: EngineMetric[] }
const MAPPED = "Observed mapped features only; SAMPLE/UNKNOWN coverage is not a complete market inventory.";
const CONSTRAINT = "Spatial facts only; not a legal determination, investment verdict or assurance that no constraints exist.";
const GRID = "Occupied-cell summaries use point features only, a target-centred WGS84 azimuthal equidistant projection and floor(x/cell), floor(y/cell).";
const CLUSTER = "DBSCAN uses point features only in the same local metre projection, ordered by stable feature id; summaries cover the largest radius.";

function labelFor(seed: Seed, role: string) {
  const labels = [
    ["per_km2", "الكثافة المرصودة لكل كم²", "Observed density per km2"],
    ["grid.occupied_cells", "خلايا الشبكة المشغولة", "Occupied grid cells"],
    ["grid.max_cell_count", "أكبر عدد مرصود داخل خلية", "Maximum observed cell count"],
    ["cluster.count", "عدد التجمعات المرصودة", "Observed cluster count"],
    ["cluster.largest", "حجم أكبر تجمع مرصود", "Largest observed cluster size"],
    ["cluster.noise", "النقاط غير المنتمية إلى تجمع", "Observed noise points"],
    ["intersections", "عدد التقاطعات الهندسية", "Geometric intersection count"],
    ["covers", "عدد الأشكال المحتوية للموقع", "Features covering the target"],
    ["overlap_km2", "مساحة اتحاد التداخلات", "Union overlap area"],
    ["nearest", "المسافة إلى أقرب قيد مرصود", "Distance to nearest observed constraint"],
  ] as const;
  const label = labels.find(([suffix]) => seed.key.endsWith(`.${suffix}`));
  return {
    ar: `${label?.[1] ?? "العدد المرصود"} — ${role}${seed.radius > 0 ? ` — ${seed.radius} م` : ""}`,
    en: `${label?.[2] ?? "Observed feature count"} — ${role}${seed.radius > 0 ? ` — ${seed.radius} m` : ""}`,
  };
}

function seedsFor(analysis: Analysis, role: string, parameters: SpatialParameters, data: SpatialMeasureResult | null): Seed[] {
  const largest = Math.max(...parameters.radiiMeters);
  if (analysis === "DENSITY") {
    const seeds: Seed[] = parameters.radiiMeters.flatMap((radius) => {
      const row = data?.radii.find((entry) => entry.radiusMeters === radius);
      return [
        { key: `density.${role}.r${radius}.count`, kind: "COUNT", unit: "count", value: row?.count ?? null, method: "ST_DWithin/geography", radius },
        { key: `density.${role}.r${radius}.per_km2`, kind: "DENSITY", unit: "per_km2",
          value: row === undefined ? null : roundTo(row.count / row.areaKm2, 6), method: "mapped-count/geodesic-buffer-area-v1", radius },
      ];
    });
    for (const [key, value, method] of [
      ["grid.occupied_cells", data?.occupiedCells, `local-aeqd-grid-v1/cell=${parameters.grid.cellMeters}m`],
      ["grid.max_cell_count", data?.maxCellCount, `local-aeqd-grid-v1/cell=${parameters.grid.cellMeters}m`],
      ["cluster.count", data?.clusterCount, `ST_ClusterDBSCAN/eps=${parameters.cluster.epsMeters}m/min=${parameters.cluster.minPoints}`],
      ["cluster.largest", data?.largestCluster, `ST_ClusterDBSCAN/eps=${parameters.cluster.epsMeters}m/min=${parameters.cluster.minPoints}`],
      ["cluster.noise", data?.noiseCount, `ST_ClusterDBSCAN/eps=${parameters.cluster.epsMeters}m/min=${parameters.cluster.minPoints}`],
    ] as const) seeds.push({ key: `density.${role}.${key}`, kind: "COUNT", unit: "count", value: value ?? null, method, radius: largest, unsupported: data?.pointsOnly === false });
    return seeds;
  }
  return [
    { key: `constraint.${role}.intersections`, kind: "COUNT", unit: "count", value: data?.intersects ?? null, method: "ST_Intersects", radius: 0 },
    { key: `constraint.${role}.covers`, kind: "COUNT", unit: "count", value: data?.covers ?? null, method: "ST_Covers", radius: 0 },
    { key: `constraint.${role}.overlap_km2`, kind: "AREA", unit: "km2", value: data === null ? null : roundTo(data.overlapKm2, 6), method: "intersection-union/geography-area-v1", radius: 0 },
    { key: `constraint.${role}.nearest`, kind: "DISTANCE", unit: "m", value: data?.nearestMeters == null ? null : roundTo(data.nearestMeters, 1), method: "ST_Distance/geography/bounded_search", radius: parameters.maxSearchMeters },
    ...parameters.radiiMeters.map((radius): Seed => ({
      key: `constraint.${role}.r${radius}.count`, kind: "COUNT", unit: "count", value: data?.radii.find((entry) => entry.radiusMeters === radius)?.count ?? null,
      method: "ST_DWithin/geography", radius,
    })),
  ];
}

export async function runAdvancedAnalyses(args: {
  port: SpatialMapPort; targets: readonly ContextTarget[]; sources: readonly FeatureSource[];
  analyses: readonly string[]; parameters: SpatialParameters; evaluatedAt: string;
}): Promise<{ results: AdvancedResult[]; gaps: Gap[] }> {
  const results: AdvancedResult[] = [];
  const gaps: Gap[] = [];
  const byRole = new Map(args.sources.map((source) => [source.role, source]));
  for (const analysis of ["DENSITY", "CONSTRAINT_SCREENING"] as const) {
    if (!args.analyses.includes(analysis)) continue;
    const roles = args.parameters.roles.filter(analysis === "DENSITY" ? isFeatureRole : isConstraintRole);
    for (const target of args.targets) {
      const metrics: EngineMetric[] = [];
      for (const role of roles) {
        const source = byRole.get(role);
        const input = source?.input ?? null;
        const siteCoverage = input === null ? null : coverageFor(input, target.location);
        let status: MetricStatus | null = source === undefined ? "NOT_AVAILABLE" : source.kind === "MISSING" ? source.status : null;
        if (siteCoverage?.status === "NONE") status = "NO_COVERAGE";
        if (input?.freshness.status === "EXPIRED") status = "NOT_AVAILABLE";
        let data: SpatialMeasureResult | null = null;
        if (source !== undefined && source.kind !== "MISSING" && status === null) {
          try {
            data = await args.port.measureSpatial({
              source: source.kind === "MAP"
                ? { kind: "MAP", releaseId: source.releaseId, layerId: source.layerKey, featureKind: role.split(":")[1] ?? null }
                : { kind: "DATA_CENTER", features: dataCenterFeature(source) },
              location: target.location, analysis, radiiMeters: args.parameters.radiiMeters,
              maxSearchMeters: args.parameters.maxSearchMeters, grid: args.parameters.grid, cluster: args.parameters.cluster,
            });
            if (!data.valid || data.truncated || data.unrecognized > 0) {
              status = "NOT_COMPUTABLE";
              gaps.push(createGap(spatialGapCatalog, data.truncated ? "RESULT_TRUNCATED" : data.unrecognized > 0 ? "MAP_SOURCE_ID_UNRECOGNIZED" : "DATASET_GEOMETRY_INVALID",
                { dataset: input?.ref.label ?? role, count: data.unrecognized, limit: 10_000 }, { subject: `${target.id}/${analysis}/${role}`, ...(input === null ? {} : { inputId: input.id }) }));
            }
          } catch (error) {
            if (!(error instanceof MapReadError)) throw error;
            status = "NOT_COMPUTABLE";
            gaps.push(createGap(spatialGapCatalog, "BACKEND_UNAVAILABLE", { backend: "POSTGIS", reason: error.kind }, { subject: `${target.id}/${analysis}/${role}` }));
          }
        }
        if (status === "NO_COVERAGE") gaps.push(createGap(spatialGapCatalog, "NO_COVERAGE", { dataset: input?.ref.label ?? role }, { subject: `${target.id}/${role}`, ...(input === null ? {} : { inputId: input.id }) }));
        if (status === "NOT_AVAILABLE") gaps.push(createGap(spatialGapCatalog, "DATASET_NOT_AVAILABLE", { role }, { subject: `${target.id}/${role}` }));
        if (analysis === "DENSITY" && data?.pointsOnly === false) gaps.push(createGap(spatialGapCatalog, "DENSITY_POINTS_REQUIRED", {}, { subject: `${target.id}/${role}` }));
        for (const seed of seedsFor(analysis, role, args.parameters, data)) {
          const coverage = input === null ? null : coverageFor(input, target.location, seed.radius);
          const fullInventory = input?.completeness === "INVENTORY" && coverage?.status === "FULL";
          const limitations = [MAPPED, ...(analysis === "CONSTRAINT_SCREENING" ? [CONSTRAINT] : []),
            ...(coverage?.status === "UNDECLARED" ? ["Search-area coverage is not established; observations are partial, not a complete covered-area total."] : []),
            ...(seed.key.includes(".grid.") ? [GRID] : []), ...(seed.key.includes(".cluster.") ? [CLUSTER] : [])].sort(compareText);
          let metricStatus: MetricStatus = status ?? (seed.unsupported ? "NOT_COMPUTABLE" : coverage?.status === "NONE" ? "NO_COVERAGE"
            : seed.value === null || (seed.value === 0 && seed.kind !== "DISTANCE" && !fullInventory) ? "NOT_COMPUTABLE"
              : fullInventory ? "COMPUTED" : "PARTIAL");
          if (status === null && analysis === "CONSTRAINT_SCREENING" && seed.kind === "AREA" && target.location.type === "Point") metricStatus = "NOT_COMPUTABLE";
          const scored = input === null || coverage === null ? null : scoreSpatialConfidence({
            datasets: [{ input, coverage, geometry: { valid: data?.valid ?? false, fit: "SUITABLE", positionalAccuracy: "UNDECLARED" } }],
            requestedRoles: roles.length, availableRoles: roles.filter((entry) => byRole.get(entry)?.kind !== "MISSING" && byRole.has(entry)).length,
            valueKind: seed.kind === "AREA" || seed.kind === "DISTANCE" ? "COUNT" : seed.kind,
            estimated: false, fallbackApplied: false, evaluatedAt: args.evaluatedAt,
          });
          if (scored?.kind === "NOT_SCORABLE" && status === null) metricStatus = metricStatusForBlocks(scored.blockedBy);
          const hasValue = metricStatus === "COMPUTED" || metricStatus === "PARTIAL";
          if (scored?.kind === "SCORED") gaps.push(...scored.gaps);
          if (status === null && coverage?.status === "UNDECLARED" && input !== null) gaps.push(createGap(spatialGapCatalog, input.coverage?.boundingBox == null ? "COVERAGE_UNDECLARED" : "COVERAGE_PARTIAL",
            { dataset: input.ref.label }, { inputId: input.id, subject: `${target.id}/${seed.key}` }));
          if (metricStatus === "NOT_COMPUTABLE" && status === null && !seed.unsupported) gaps.push(createGap(spatialGapCatalog, "SPATIAL_MEASUREMENT_UNSUPPORTED",
            { metric: seed.key }, { subject: `${target.id}/${seed.key}`, ...(input === null ? {} : { inputId: input.id }) }));
          metrics.push({
            key: seed.key, label: labelFor(seed, role), valueKind: seed.kind, unit: seed.unit, method: seed.method,
            status: metricStatus, platformState: platformStateFor(metricStatus), value: hasValue ? seed.value : null,
            interpretation: "MAPPED_FEATURES_ONLY", inputRefs: input === null ? [] : [input.id],
            confidence: hasValue && scored?.kind === "SCORED" ? scored.breakdown : null, limitations,
          });
        }
      }
      results.push({ analysis, target: target.id, metrics: metrics.sort((a, b) => compareText(a.key, b.key)) });
    }
  }
  return { results, gaps: normalizeGaps(gaps) };
}
