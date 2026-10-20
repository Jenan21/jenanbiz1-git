import { compareText, roundTo } from "../shared/canonical";
import type { DataAvailability, EngineInput, EngineMetric } from "../shared/contracts";
import { createGap, normalizeGaps, type Gap } from "../shared/gaps";
import { platformStateFor, type MetricStatus } from "../shared/states";
import type { ResolvedDataSource } from "./data-sources";
import { scoreSpatialConfidence, metricStatusForBlocks, type CoverageAssessment } from "./confidence";
import { buildMapFeatureRef } from "./map-contract";
import { MapReadError } from "./map-read-error";
import type { FeatureMapSourceState } from "./map-state";
import { isFeatureRole, isPopulationRole, type SpatialLocation, type SpatialParameters } from "./contracts";
import { SEARCH_LADDER_METERS } from "./constants";
import { boundingBoxOf } from "./geometry-precheck";
import type { SpatialMapPort, DatasetMeasureResult, MapNearestResult } from "./map-port";
import type { ContextTarget } from "./location-context";
import { spatialGapCatalog } from "./gaps";
import type { SpatialDatasetFeature } from "./dataset-features";

type AvailableSource =
  | { role: string; kind: "MAP"; input: EngineInput; releaseId: string; layerKey: string }
  | { role: string; kind: "DATA_CENTER"; input: EngineInput; features: readonly SpatialDatasetFeature[] };
type MissingSource = { role: string; kind: "MISSING"; status: MetricStatus; input: EngineInput | null; referenceKind: "MAP" | "DATA_CENTER" | null };
type FeatureSource = AvailableSource | MissingSource;
type TargetMetrics = { analysis: "PROXIMITY" | "CATCHMENT"; target: string; metrics: EngineMetric[] };

const GEOMETRY = { fit: "SUITABLE", positionalAccuracy: "UNDECLARED", valid: true } as const;
const LIMITATIONS = {
  mapped: "The result describes features in this dataset; it is not a complete real-world inventory.",
  distance: "Straight-line distance on the Earth's surface, not a travel distance.",
  population: "Area-weighted estimate assumes population is evenly distributed within each source polygon.",
} as const;
const roleTitle = (role: string) => role.replace(":", " ");
const radiusLabel = (radius: number) => `${radius} m`;
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

function coverageFor(input: EngineInput, location: SpatialLocation): CoverageAssessment {
  const extent = input.coverage?.boundingBox;
  if (extent === undefined || extent === null) return { status: "UNDECLARED" };
  const target = boundingBoxOf(location);
  const intersects = target.west <= extent.east && target.east >= extent.west && target.south <= extent.north && target.north >= extent.south;
  if (!intersects) return { status: "NONE" };
  const contains = extent.west <= target.west && extent.east >= target.east && extent.south <= target.south && extent.north >= target.north;
  return { status: contains ? "FULL" : "UNDECLARED" };
}

function sourceFromDataCenter(source: ResolvedDataSource): FeatureSource {
  if (source.status === "RESOLVED") return { role: source.role, kind: "DATA_CENTER", input: source.input, features: source.features };
  const status: MetricStatus = source.status === "NO_COVERAGE" ? "NO_COVERAGE"
    : source.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE";
  return { role: source.role, kind: "MISSING", status, input: null, referenceKind: "DATA_CENTER" };
}

function dataCenterFeature(source: AvailableSource & { kind: "DATA_CENTER" }) {
  return source.features.map((feature) => ({
    type: "Feature",
    ...(feature.id === null ? {} : { id: feature.id }),
    properties: feature.properties,
    geometry: feature.geometry,
  }));
}

function hasPopulationSchema(features: readonly SpatialDatasetFeature[]): boolean {
  return features.length > 0 && features.every((feature) => (
    (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon")
    && typeof feature.properties?.population === "number"
    && Number.isSafeInteger(feature.properties.population)
    && feature.properties.population >= 0
  ));
}

function populationSchemaGap(input: EngineInput, role: string): Gap {
  return createGap(spatialGapCatalog, "POPULATION_DATA_SCHEMA_UNSUPPORTED", { dataset: input.ref.label }, { inputId: input.id, subject: role });
}

function coverageGap(input: EngineInput, subject: string): Gap {
  return createGap(spatialGapCatalog, "NO_COVERAGE", { dataset: input.ref.label }, { inputId: input.id, subject });
}

function failureGap(role: string, reason: string, subject: string): Gap {
  return createGap(spatialGapCatalog, "BACKEND_UNAVAILABLE", { backend: "POSTGIS", reason }, { subject: `${subject}/${role}` });
}

function geometryGap(input: EngineInput, subject: string): Gap {
  return createGap(spatialGapCatalog, "DATASET_GEOMETRY_INVALID", { dataset: input.ref.label }, { inputId: input.id, subject });
}

function unrecognizedGap(input: EngineInput, role: string, count: number, subject: string): Gap {
  return createGap(spatialGapCatalog, "MAP_SOURCE_ID_UNRECOGNIZED", { count: String(count), dataset: input.ref.label }, { inputId: input.id, subject: `${subject}/${role}` });
}

function statusMetric(args: {
  key: string; label: { ar: string; en: string }; kind: EngineMetric["valueKind"]; unit: EngineMetric["unit"];
  status: MetricStatus; input: EngineInput | null; limitations?: readonly string[];
}): EngineMetric {
  return {
    key: args.key, label: args.label, status: args.status, platformState: platformStateFor(args.status), valueKind: args.kind, unit: args.unit,
    value: null, interpretation: "MAPPED_FEATURES_ONLY",
    inputRefs: args.input === null ? [] : [args.input.id], confidence: null, limitations: [...(args.limitations ?? [])],
  };
}

function metric(args: {
  key: string; label: { ar: string; en: string }; kind: EngineMetric["valueKind"]; unit: EngineMetric["unit"];
  value: number | string; input: EngineInput; location: SpatialLocation; evaluatedAt: string;
  requestedRoles: number; availableRoles: number; estimated?: boolean; limitations?: readonly string[];
}): { metric: EngineMetric; gaps: Gap[] } {
  const confidence = scoreSpatialConfidence({
    datasets: [{ input: args.input, coverage: coverageFor(args.input, args.location), geometry: GEOMETRY }],
    requestedRoles: Math.max(1, args.requestedRoles), availableRoles: Math.min(args.availableRoles, Math.max(1, args.requestedRoles)),
    valueKind: args.kind, estimated: args.estimated ?? false, fallbackApplied: false, evaluatedAt: args.evaluatedAt,
  });
  if (confidence.kind === "NOT_SCORABLE") {
    const status = metricStatusForBlocks(confidence.blockedBy);
    const gaps = confidence.blockedBy.flatMap((block) => {
      if (block.code === "NO_COVERAGE") return [coverageGap(args.input, args.key)];
      if (block.code === "DATA_EXPIRED") return [createGap(spatialGapCatalog, "DATA_EXPIRED", { dataset: args.input.ref.label }, { inputId: args.input.id, subject: args.key })];
      if (block.code === "DATASET_GEOMETRY_INVALID") return [geometryGap(args.input, args.key)];
      return [];
    });
    return {
      metric: statusMetric({ ...args, status, input: args.input }),
      gaps,
    };
  }
  return {
    metric: {
      key: args.key, label: args.label, status: args.estimated ? "ESTIMATED" : "COMPUTED", platformState: platformStateFor(args.estimated ? "ESTIMATED" : "COMPUTED"),
      valueKind: args.kind, unit: args.unit, value: args.value, interpretation: args.estimated ? "ESTIMATE" : "MAPPED_FEATURES_ONLY",
      inputRefs: [args.input.id], confidence: confidence.breakdown, limitations: [...(args.limitations ?? [])].sort(compareText),
    },
    gaps: confidence.gaps,
  };
}

function sourceFailureMetric(key: string, label: { ar: string; en: string }, kind: EngineMetric["valueKind"], unit: EngineMetric["unit"], source: FeatureSource, input?: EngineInput | null) {
  if (source.kind === "MISSING") return statusMetric({ key, label, kind, unit, status: source.status, input: source.input });
  return statusMetric({ key, label, kind, unit, status: "NOT_AVAILABLE", input: input ?? null });
}

function mapNearestFailure(result: MapNearestResult, rank: number): boolean {
  const match = result.matches[rank - 1];
  return result.unrecognized.count > 0 && (
    result.unrecognized.nearestMeters === null || match === undefined || result.unrecognized.nearestMeters <= match.distanceMeters
  );
}

function mapSource(input: EngineInput, source: FeatureMapSourceState): FeatureSource {
  if (!source.layer.available) return { role: source.role, kind: "MISSING", status: "NOT_AVAILABLE", input, referenceKind: "MAP" };
  if (input.freshness.status === "EXPIRED") return { role: source.role, kind: "MISSING", status: "NOT_AVAILABLE", input, referenceKind: "MAP" };
  return { role: source.role, kind: "MAP", input, releaseId: source.layer.releaseId, layerKey: source.layer.layerKey };
}

function missingSource(role: string, status: MetricStatus = "NOT_AVAILABLE", referenceKind: MissingSource["referenceKind"] = null, input: EngineInput | null = null): FeatureSource {
  return { role, kind: "MISSING", status, input, referenceKind };
}

function availabilityFor(sources: readonly FeatureSource[], targets: readonly ContextTarget[]): DataAvailability[] {
  return sources.map((source) => {
    const input = source.input;
    const outsideAllTargets = input !== null && targets.length > 0
      && targets.every((target) => coverageFor(input, target.location).status === "NONE");
    const status: DataAvailability["status"] = input?.freshness.status === "EXPIRED" ? "EXPIRED"
      : source.kind === "MISSING" ? source.status === "NO_COVERAGE" ? "NO_COVERAGE" : "NOT_AVAILABLE"
        : outsideAllTargets ? "NO_COVERAGE" : "AVAILABLE";
    return { role: source.role, status, inputIds: input === null ? [] : [input.id] };
  }).sort((first, second) => compareText(first.role, second.role));
}

export function resolveFeatureSources(mapSources: readonly FeatureMapSourceState[], dcSources: readonly ResolvedDataSource[], roles: readonly string[]): FeatureSource[] {
  const mapByRole = new Map(mapSources.map((source) => [source.role, source]));
  const dcByRole = new Map(dcSources.map((source) => [source.role, source]));
  return [...new Set(roles)].sort(compareText).map((role) => {
    const dc = dcByRole.get(role);
    if (dc !== undefined) return sourceFromDataCenter(dc);
    const map = mapByRole.get(role);
    if (map !== undefined) {
      if (!map.layer.available) return missingSource(role, "NOT_AVAILABLE", "MAP");
      return mapSource(map.layer.input, map);
    }
    return missingSource(role, "NOT_AVAILABLE", "MAP");
  });
}

function populationValue(measurement: DatasetMeasureResult, radiusMeters: number): number | null {
  const row = measurement.radii.find((entry) => entry.radiusMeters === radiusMeters);
  return row?.populationEstimate === null || row === undefined ? null : Math.round(row.populationEstimate);
}

function countForRadius(measurement: DatasetMeasureResult, radiusMeters: number): number | null {
  return measurement.radii.find((entry) => entry.radiusMeters === radiusMeters)?.count ?? null;
}

function sourceForMapCount(result: { radii: Array<{ radiusMeters: number; count: number; unrecognized: number }> }, radius: number) {
  return result.radii.find((entry) => entry.radiusMeters === radius) ?? null;
}

function shouldNotReportZero(input: EngineInput, count: number): boolean {
  return count === 0 && input.completeness !== "INVENTORY";
}

function proximityMetrics(args: {
  role: string; source: FeatureSource; target: ContextTarget; nearestCount: number; nearest: MapNearestResult | DatasetMeasureResult | null;
  evaluatedAt: string; requestedRoles: number; availableRoles: number; gaps: Gap[]; failureStatus?: MetricStatus;
}): EngineMetric[] {
  const { role, source, target, nearest } = args;
  const output: EngineMetric[] = [];
  const isMap = source.kind === "MAP" || (source.kind === "MISSING" && source.referenceKind === "MAP");
  const datasetNearest = nearest !== null && "valid" in nearest ? nearest.nearest : null;
  const mapNearest = nearest !== null && "unrecognized" in nearest ? nearest : null;
  for (let rank = 1; rank <= args.nearestCount; rank += 1) {
    const prefix = `proximity.${role}.n${rank}`;
    const label = { ar: `المعلم الأقرب ${rank} للدور ${roleTitle(role)}`, en: `Nearest feature ${rank} for ${roleTitle(role)}` };
    const match = isMap ? mapNearest?.matches[rank - 1] : datasetNearest?.[rank - 1];
    const mapUnknown = isMap && mapNearest !== null && mapNearestFailure(mapNearest, rank);
    if (source.kind === "MISSING" || args.failureStatus !== undefined || nearest === null) {
      const status = source.kind === "MISSING" ? source.status : args.failureStatus ?? "NOT_COMPUTABLE";
      for (const suffix of ["distance", "name", ...(isMap ? ["feature_ref"] : [])]) {
        output.push(statusMetric({
          key: `${prefix}.${suffix}`, label, kind: suffix === "distance" ? "DISTANCE" : "TEXT", unit: suffix === "distance" ? "m" : "none",
          status, input: source.input,
        }));
      }
      continue;
    }
    if (coverageFor(source.input, target.location).status === "NONE") {
      args.gaps.push(coverageGap(source.input, `${target.id}/${prefix}`));
      for (const suffix of ["distance", "name", ...(isMap ? ["feature_ref"] : [])]) {
        output.push(statusMetric({
          key: `${prefix}.${suffix}`, label, kind: suffix === "distance" ? "DISTANCE" : "TEXT", unit: suffix === "distance" ? "m" : "none",
          status: "NO_COVERAGE", input: source.input, limitations: [LIMITATIONS.mapped],
        }));
      }
      continue;
    }
    if (!match) {
      const status: MetricStatus = mapUnknown ? "NOT_COMPUTABLE" : "NOT_FOUND_WITHIN_RADIUS";
      if (mapUnknown && mapNearest !== null) args.gaps.push(unrecognizedGap(source.input, role, mapNearest.unrecognized.count, `${target.id}/${prefix}`));
      for (const suffix of ["distance", "name", ...(isMap ? ["feature_ref"] : [])]) {
        output.push(statusMetric({
          key: `${prefix}.${suffix}`, label, kind: suffix === "distance" ? "DISTANCE" : "TEXT", unit: suffix === "distance" ? "m" : "none",
          status, input: source.input, limitations: [LIMITATIONS.mapped],
        }));
      }
      continue;
    }
    if (mapUnknown) {
      args.gaps.push(unrecognizedGap(source.input, role, mapNearest?.unrecognized.count ?? 0, `${target.id}/${prefix}`));
      for (const suffix of ["distance", "name", "feature_ref"]) {
        output.push(statusMetric({ key: `${prefix}.${suffix}`, label, kind: suffix === "distance" ? "DISTANCE" : "TEXT", unit: suffix === "distance" ? "m" : "none", status: "NOT_COMPUTABLE", input: source.input }));
      }
      continue;
    }
    const distance = match.distanceMeters;
    const nearestName = "label" in match
      ? clip(match.label, 1000)
      : clip(match.name ?? match.id ?? `Feature ${match.index + 1}`, 1000);
    const distanceMetric = metric({
      key: `${prefix}.distance`, label: { ...label, ar: `${label.ar} — المسافة`, en: `${label.en} — distance` }, kind: "DISTANCE", unit: "m",
      value: roundTo(distance, 1), input: source.input, location: target.location, evaluatedAt: args.evaluatedAt,
      requestedRoles: args.requestedRoles, availableRoles: args.availableRoles, limitations: [LIMITATIONS.distance, LIMITATIONS.mapped],
    });
    const nameMetric = metric({
      key: `${prefix}.name`, label: { ...label, ar: `${label.ar} — الاسم`, en: `${label.en} — name` }, kind: "TEXT", unit: "none",
      value: nearestName, input: source.input, location: target.location, evaluatedAt: args.evaluatedAt,
      requestedRoles: args.requestedRoles, availableRoles: args.availableRoles, limitations: [LIMITATIONS.mapped],
    });
    output.push(distanceMetric.metric, nameMetric.metric);
    args.gaps.push(...distanceMetric.gaps, ...nameMetric.gaps);
    if (isMap && "label" in match) {
      const feature = match;
      const reference = buildMapFeatureRef(source.releaseId, feature.id);
      output.push(reference === null
        ? statusMetric({ key: `${prefix}.feature_ref`, label: { ...label, ar: `${label.ar} — المرجع`, en: `${label.en} — reference` }, kind: "TEXT", unit: "none", status: "NOT_COMPUTABLE", input: source.input })
        : metric({
          key: `${prefix}.feature_ref`, label: { ...label, ar: `${label.ar} — المرجع`, en: `${label.en} — reference` }, kind: "TEXT", unit: "none",
          value: reference, input: source.input, location: target.location, evaluatedAt: args.evaluatedAt,
          requestedRoles: args.requestedRoles, availableRoles: args.availableRoles, limitations: [LIMITATIONS.mapped],
        }).metric);
    }
  }
  return output;
}

function catchmentMetrics(args: {
  source: FeatureSource; target: ContextTarget; radiiMeters: readonly number[]; measurement: DatasetMeasureResult | null;
  mapCounts: Array<{ radiusMeters: number; count: number; unrecognized: number }> | null; evaluatedAt: string;
  requestedRoles: number; availableRoles: number; populationSchemaValid: boolean; gaps: Gap[]; failureStatus?: MetricStatus;
}): EngineMetric[] {
  const { source, target } = args;
  const output: EngineMetric[] = [];
  if (source.kind !== "MISSING" && source.input.completeness !== "INVENTORY") {
    args.gaps.push(createGap(spatialGapCatalog, "COUNT_IS_NOT_AN_INVENTORY", {}, { inputId: source.input.id }));
  }
  for (const radius of isPopulationRole(source.role) ? [] : args.radiiMeters) {
    const label = { ar: `عدد معالم ${roleTitle(source.role)} ضمن ${radiusLabel(radius)}`, en: `Mapped ${roleTitle(source.role)} within ${radiusLabel(radius)}` };
    const key = `catchment.r${radius}.count.${source.role}`;
    if (source.kind === "MISSING") {
      output.push(sourceFailureMetric(key, label, "COUNT", "count", source));
      continue;
    }
    const mapRow = source.kind === "MAP" ? sourceForMapCount({ radii: args.mapCounts ?? [] }, radius) : null;
    const count = source.kind === "MAP" ? mapRow?.count ?? null : args.measurement === null ? null : countForRadius(args.measurement, radius);
    const unknown = mapRow?.unrecognized ?? 0;
    if (count === null || args.failureStatus !== undefined) {
      output.push(statusMetric({ key, label, kind: "COUNT", unit: "count", status: args.failureStatus ?? "NOT_COMPUTABLE", input: source.input }));
      continue;
    }
    if (coverageFor(source.input, target.location).status === "NONE") {
      output.push(statusMetric({ key, label, kind: "COUNT", unit: "count", status: "NO_COVERAGE", input: source.input, limitations: [LIMITATIONS.mapped] }));
      args.gaps.push(coverageGap(source.input, `${target.id}/${key}`));
      continue;
    }
    if (unknown > 0) {
      args.gaps.push(unrecognizedGap(source.input, source.role, unknown, `${target.id}/${key}`));
      output.push(statusMetric({ key, label, kind: "COUNT", unit: "count", status: "NOT_COMPUTABLE", input: source.input }));
      continue;
    }
    if (shouldNotReportZero(source.input, count)) {
      output.push(statusMetric({ key, label, kind: "COUNT", unit: "count", status: "NOT_FOUND_WITHIN_RADIUS", input: source.input, limitations: [LIMITATIONS.mapped] }));
      continue;
    }
    const counted = metric({
      key, label, kind: "COUNT", unit: "count", value: count, input: source.input, location: target.location,
      evaluatedAt: args.evaluatedAt, requestedRoles: args.requestedRoles, availableRoles: args.availableRoles, limitations: [LIMITATIONS.mapped],
    });
    output.push(counted.metric);
    args.gaps.push(...counted.gaps);
  }
  if (!isPopulationRole(source.role)) return output;
  for (const radius of args.radiiMeters) {
    const key = `catchment.r${radius}.population`;
    const label = { ar: `السكان التقديريون ضمن ${radiusLabel(radius)}`, en: `Estimated population within ${radiusLabel(radius)}` };
    if (source.kind === "MISSING") {
      output.push(sourceFailureMetric(key, label, "POPULATION", "people", source));
      continue;
    }
    if (source.kind !== "DATA_CENTER" || !args.populationSchemaValid || args.measurement === null || args.failureStatus !== undefined) {
      output.push(statusMetric({ key, label, kind: "POPULATION", unit: "people", status: "NOT_COMPUTABLE", input: source.input, limitations: [LIMITATIONS.population] }));
      continue;
    }
    const value = populationValue(args.measurement, radius);
    if (value === null) {
      const outsideCoverage = coverageFor(source.input, target.location).status === "NONE";
      output.push(statusMetric({
        key, label, kind: "POPULATION", unit: "people", status: outsideCoverage ? "NO_COVERAGE" : "NOT_COMPUTABLE",
        input: source.input, limitations: [LIMITATIONS.population],
      }));
      if (outsideCoverage) args.gaps.push(coverageGap(source.input, `${target.id}/${key}`));
      continue;
    }
    const estimated = metric({
      key, label, kind: "POPULATION", unit: "people", value, input: source.input, location: target.location,
      evaluatedAt: args.evaluatedAt, requestedRoles: args.requestedRoles, availableRoles: args.availableRoles, estimated: true,
      limitations: [LIMITATIONS.population],
    });
    output.push(estimated.metric);
    args.gaps.push(...estimated.gaps);
    args.gaps.push(createGap(spatialGapCatalog, "POPULATION_AREA_WEIGHTED_ESTIMATE", {}, { inputId: source.input.id, subject: `${target.id}/catchment/population` }));
  }
  return output;
}

function geometryFeatures(source: AvailableSource & { kind: "DATA_CENTER" }) {
  return dataCenterFeature(source);
}

export async function runFeatureAnalyses(args: {
  port: SpatialMapPort; targets: readonly ContextTarget[]; sources: readonly FeatureSource[];
  analyses: readonly string[]; parameters: SpatialParameters; evaluatedAt: string;
}): Promise<{ results: TargetMetrics[]; gaps: Gap[]; dataAvailability: DataAvailability[] }> {
  const results: TargetMetrics[] = [];
  const gaps: Gap[] = [];
  const featureRoles = args.parameters.roles.filter(isFeatureRole);
  const requestedRoles = featureRoles.length + (args.parameters.roles.some(isPopulationRole) ? 1 : 0);
  const availableRoles = args.sources.filter((source) => source.kind !== "MISSING").length;
  const selectedSources = new Map(args.sources.map((source) => [source.role, source]));
  const dataCenters = new Map(args.sources.filter((source): source is AvailableSource & { kind: "DATA_CENTER" } => source.kind === "DATA_CENTER").map((source) => [source.role, source]));
  const populationSchemas = new Map<string, boolean>();
  for (const source of dataCenters.values()) {
    if (source.input.roles.includes("population")) {
      const valid = hasPopulationSchema(source.features);
      populationSchemas.set(source.input.id, valid);
      if (!valid) gaps.push(populationSchemaGap(source.input, "population"));
    }
  }
  const measured = new Map<string, Promise<DatasetMeasureResult>>();
  const measurementFor = (source: AvailableSource & { kind: "DATA_CENTER" }, target: ContextTarget) => {
    const key = `${source.input.id}\u0000${target.id}`;
    const prior = measured.get(key);
    if (prior !== undefined) return prior;
    const request = args.port.measureDataset({
      features: geometryFeatures(source), location: target.location, radiiMeters: args.parameters.radiiMeters,
      maxSearchMeters: Math.max(args.parameters.maxSearchMeters, ...args.parameters.radiiMeters),
      nearestCount: args.parameters.nearestCount, includePopulation: source.input.roles.includes("population") && (populationSchemas.get(source.input.id) ?? false),
    });
    measured.set(key, request);
    return request;
  };
  for (const target of args.targets) {
    if (args.analyses.includes("PROXIMITY")) {
      const metrics: EngineMetric[] = [];
      for (const role of featureRoles) {
        const source = selectedSources.get(role) ?? missingSource(role);
        let nearest: MapNearestResult | DatasetMeasureResult | null = null;
        let failureStatus: MetricStatus | undefined;
        if (source.kind === "MAP") {
          try {
            nearest = await args.port.nearest({
              releaseId: source.releaseId, layerId: source.layerKey, location: target.location,
              kind: role.includes(":") ? role.slice(role.indexOf(":") + 1) : null,
              rings: SEARCH_LADDER_METERS.filter((ring) => ring <= args.parameters.maxSearchMeters), limit: args.parameters.nearestCount,
            });
          } catch (error) {
            const reason = error instanceof MapReadError ? error.kind : "UNKNOWN";
            gaps.push(failureGap(role, reason, `${target.id}/proximity`));
            failureStatus = "NOT_COMPUTABLE";
          }
        } else if (source.kind === "DATA_CENTER") {
          try {
            nearest = await measurementFor(source, target);
            if (!nearest.valid) {
              gaps.push(geometryGap(source.input, `${target.id}/proximity/${role}`));
              nearest = null;
              failureStatus = "NOT_COMPUTABLE";
            }
          } catch (error) {
            gaps.push(failureGap(role, error instanceof MapReadError ? error.kind : "UNKNOWN", `${target.id}/proximity`));
            failureStatus = "NOT_COMPUTABLE";
          }
        }
        metrics.push(...proximityMetrics({
          role, source, target, nearestCount: args.parameters.nearestCount, nearest, evaluatedAt: args.evaluatedAt,
          requestedRoles, availableRoles, gaps, ...(failureStatus === undefined ? {} : { failureStatus }),
        }));
      }
      results.push({ analysis: "PROXIMITY", target: target.id, metrics: metrics.sort((first, second) => compareText(first.key, second.key)) });
    }
    if (args.analyses.includes("CATCHMENT")) {
      const metrics: EngineMetric[] = [];
      for (const role of featureRoles) {
        const source = selectedSources.get(role) ?? missingSource(role);
        let measurement: DatasetMeasureResult | null = null;
        let mapCounts: Array<{ radiusMeters: number; count: number; unrecognized: number }> | null = null;
        let failureStatus: MetricStatus | undefined;
        if (source.kind === "MAP") {
          try {
            mapCounts = (await args.port.countFeatures({
              releaseId: source.releaseId, layerId: source.layerKey, location: target.location,
              kind: role.includes(":") ? role.slice(role.indexOf(":") + 1) : null, radiiMeters: args.parameters.radiiMeters,
            })).radii;
          } catch (error) {
            gaps.push(failureGap(role, error instanceof MapReadError ? error.kind : "UNKNOWN", `${target.id}/catchment`));
            failureStatus = "NOT_COMPUTABLE";
          }
        } else if (source.kind === "DATA_CENTER") {
          try {
            measurement = await measurementFor(source, target);
            if (!measurement.valid) {
              gaps.push(geometryGap(source.input, `${target.id}/catchment/${role}`));
              measurement = null;
              failureStatus = "NOT_COMPUTABLE";
            }
          } catch (error) {
            gaps.push(failureGap(role, error instanceof MapReadError ? error.kind : "UNKNOWN", `${target.id}/catchment`));
            failureStatus = "NOT_COMPUTABLE";
          }
        }
        metrics.push(...catchmentMetrics({
          source, target, radiiMeters: args.parameters.radiiMeters, measurement, mapCounts, evaluatedAt: args.evaluatedAt,
          requestedRoles, availableRoles, populationSchemaValid: true, gaps, ...(failureStatus === undefined ? {} : { failureStatus }),
        }));
      }
      const populationSource = args.parameters.roles.find(isPopulationRole);
      if (populationSource !== undefined) {
        const source = selectedSources.get(populationSource) ?? missingSource(populationSource);
        let measurement: DatasetMeasureResult | null = null;
        let failureStatus: MetricStatus | undefined;
        if (source.kind === "DATA_CENTER") {
          try {
            measurement = await measurementFor(source, target);
            if (!measurement.valid) {
              gaps.push(geometryGap(source.input, `${target.id}/catchment/population`));
              measurement = null;
              failureStatus = "NOT_COMPUTABLE";
            }
          } catch (error) {
            gaps.push(failureGap(populationSource, error instanceof MapReadError ? error.kind : "UNKNOWN", `${target.id}/catchment`));
            failureStatus = "NOT_COMPUTABLE";
          }
        }
        metrics.push(...catchmentMetrics({
          source, target, radiiMeters: args.parameters.radiiMeters, measurement, mapCounts: null, evaluatedAt: args.evaluatedAt,
          requestedRoles, availableRoles, populationSchemaValid: source.kind === "DATA_CENTER" ? (populationSchemas.get(source.input.id) ?? false) : false, gaps,
          ...(failureStatus === undefined ? {} : { failureStatus }),
        }));
      }
      results.push({ analysis: "CATCHMENT", target: target.id, metrics: metrics.sort((first, second) => compareText(first.key, second.key)) });
    }
  }
  return { results, gaps: normalizeGaps(gaps), dataAvailability: availabilityFor(args.sources, args.targets) };
}

export function featureSourceFromMap(source: FeatureMapSourceState): FeatureSource {
  if (!source.layer.available) return missingSource(source.role, "NOT_AVAILABLE", "MAP");
  return mapSource(source.layer.input, source);
}

export function featureSourceFromDataCenter(source: ResolvedDataSource): FeatureSource {
  return sourceFromDataCenter(source);
}
