import { compareText } from "../shared/canonical";
import type { EngineInput, EngineMetric, MetricUnit, ValueKind } from "../shared/contracts";
import { createGap, type Gap } from "../shared/gaps";
import type { Bilingual } from "../shared/primitives";
import { platformStateFor, type MetricStatus } from "../shared/states";
import {
  metricStatusForBlocks, scoreSpatialConfidence, type ConfidenceBlock, type CoverageAssessment, type GeometryFit, type SpatialConfidenceDataset,
} from "./confidence";
import { ADMIN_EDGE_NEAR_METERS, MAX_ADMIN_UNITS_PER_LEVEL, SEARCH_LADDER_METERS } from "./constants";
import type { SpatialLocation } from "./contracts";
import { spatialGapCatalog } from "./gaps";
import { mapAdminLayers, type MapAdminLayer } from "./map-contract";
import type { MapAdminUnit, MapLocateResult, MapNearestResult, SpatialMapPort } from "./map-port";
import { MapReadError, type MapReadErrorKind } from "./map-read-error";
import type { LocationContextMapState } from "./map-state";

/**
 * LOCATION_CONTEXT: where a location lies according to the Map's data. It states facts and measurements and nothing else: the country the
 * boundary belongs to, the administrative region and governorate whose polygons cover the location and how far the location is from their
 * edges, and the nearest mapped place of each requested kind. It never says whether a location is good or what to do with it.
 *
 * Every figure rests on mapped polygons and mapped features, so every metric says MAPPED_FEATURES_ONLY. A figure that cannot be supported
 * is not produced: it carries a status that says why (no coverage, no data, not computable, nothing found) and no value, never a zero.
 * Whatever is uncertain is reported as a gap next to the figure it limits.
 */
export interface ContextTarget { id: string; location: SpatialLocation }
export interface ContextOptions { maxSearchMeters: number; evaluatedAt: string }
export interface TargetContext {
  metrics: EngineMetric[];
  gaps: Gap[];
  /** How the target lies against the national boundary; UNKNOWN when that could not be established. Used for the run's data availability. */
  coverage: "FULL" | "PARTIAL" | "NONE" | "UNKNOWN";
}

interface Seed { key: string; label: Bilingual; valueKind: ValueKind; unit: MetricUnit }
/** A figure with its value, and any limitation that belongs to this figure alone. */
type ValuedSeed = Seed & { value: number | string | boolean; limitations?: readonly string[] };
interface Group {
  datasets: SpatialConfidenceDataset[];
  refs: readonly string[];
  limitations: readonly string[];
  /** What the gaps of this group are about: `<target>/<metric key>`. */
  subject: string;
  /** The role named when a group has no data at all. */
  role: string;
  scoreKind: ValueKind;
}
type PlaceLayer = LocationContextMapState["places"][number]["layer"];

const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort(compareText);
const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);
const failureKind = (error: unknown): MapReadErrorKind => (error instanceof MapReadError ? error.kind : "UNKNOWN");
const seed = (key: string, ar: string, en: string, valueKind: ValueKind, unit: MetricUnit = "none"): Seed => ({ key, label: { ar, en }, valueKind, unit });

const LEVELS: Record<MapAdminLayer, { key: string; ar: string; en: string; title: string }> = {
  regions: { key: "region", ar: "المنطقة الإدارية", en: "region", title: "Region" },
  governorates: { key: "governorate", ar: "المحافظة", en: "governorate", title: "Governorate" },
};
const DISTANCE_LIMITATION = "Straight-line distance on the Earth's surface, not a travel distance.";
const GEOMETRY = (fit: GeometryFit) => ({ fit, positionalAccuracy: "UNDECLARED", valid: true }) as const;

function valueless(source: Seed, status: MetricStatus, inputRefs: readonly string[], limitations: readonly string[]): EngineMetric {
  return {
    key: source.key, label: source.label, status, platformState: platformStateFor(status), valueKind: source.valueKind, unit: source.unit, value: null,
    interpretation: "MAPPED_FEATURES_ONLY", inputRefs: sortedUnique(inputRefs), confidence: null, limitations: sortedUnique(limitations),
  };
}

export function assessCoverage(coverage: MapLocateResult["coverage"] | undefined): CoverageAssessment {
  if (coverage === null || coverage === undefined) return { status: "UNDECLARED" };
  if (coverage.status === "PARTIAL") return coverage.fraction === null ? { status: "UNDECLARED" } : { status: "PARTIAL", fraction: coverage.fraction };
  return { status: coverage.status };
}

/** One gap for each reason a figure could not be scored, naming the dataset it concerns. */
function gapsForBlocks(blocks: readonly ConfidenceBlock[], inputs: ReadonlyMap<string, EngineInput>, group: Group): Gap[] {
  return blocks.map((block) => {
    const input = block.inputId === null ? undefined : inputs.get(block.inputId);
    const reference = input === undefined ? { subject: group.subject } : { inputId: input.id, subject: group.subject };
    const dataset = input?.ref.label ?? group.role;
    switch (block.code) {
      case "NO_COVERAGE": return createGap(spatialGapCatalog, "NO_COVERAGE", { dataset }, reference);
      case "DATA_EXPIRED": return createGap(spatialGapCatalog, "DATA_EXPIRED", { dataset }, reference);
      case "DATASET_GEOMETRY_INVALID": return createGap(spatialGapCatalog, "DATASET_GEOMETRY_INVALID", { dataset }, reference);
      case "DATASET_NOT_AVAILABLE": return createGap(spatialGapCatalog, "DATASET_NOT_AVAILABLE", { role: group.role }, reference);
    }
  });
}

class LocationContextRun {
  private readonly metrics: EngineMetric[] = [];
  private readonly gaps: Gap[] = [];
  private readonly inputs = new Map<string, EngineInput>();
  private readonly isArea: boolean;
  private readonly unofficial: boolean;
  private located: MapLocateResult | null = null;
  private failure: MapReadErrorKind | null = null;
  private coverage: CoverageAssessment = { status: "UNDECLARED" };

  constructor(private readonly port: SpatialMapPort, private readonly state: LocationContextMapState, private readonly target: ContextTarget, private readonly options: ContextOptions) {
    this.isArea = target.location.type !== "Point";
    // Official only when the Map's boundary record says so; a missing or unreadable record is "not official".
    this.unofficial = state.boundaryFacts === null || !state.boundaryFacts.official;
    const layers = [state.boundary, ...mapAdminLayers.map((level) => state.levels[level]), ...state.places.map((place) => place.layer)];
    for (const layer of layers) if (layer.available) this.inputs.set(layer.input.id, layer.input);
  }

  async run(): Promise<TargetContext> {
    await this.locate();
    this.boundaryMetrics();
    for (const level of mapAdminLayers) this.levelMetrics(level);
    for (const place of this.state.places) await this.placeMetrics(place.role, place.layer);
    this.metrics.sort((first, second) => compareText(first.key, second.key));
    const national = this.located === null ? null : this.located.coverage;
    return { metrics: this.metrics, gaps: this.gaps, coverage: national === null ? "UNKNOWN" : national.status };
  }

  private get boundaryInput(): EngineInput | null {
    return this.state.boundary.available ? this.state.boundary.input : null;
  }
  private get boundaryRefs(): string[] {
    return this.boundaryInput === null ? [] : [this.boundaryInput.id];
  }
  private boundaryDatasets(fit: GeometryFit): SpatialConfidenceDataset[] {
    return this.boundaryInput === null ? [] : [{ input: this.boundaryInput, coverage: this.coverage, geometry: GEOMETRY(fit) }];
  }

  // --------------------------------------------------------------------------------------------------------------- emission
  private pushAll(seeds: readonly Seed[], status: MetricStatus, refs: readonly string[], limitations: readonly string[]) {
    for (const source of seeds) this.metrics.push(valueless(source, status, refs, limitations));
  }
  private backendFailed(seeds: readonly Seed[], refs: readonly string[], kind: MapReadErrorKind, subject: string) {
    this.pushAll(seeds, "NOT_COMPUTABLE", refs, [`The spatial backend failed (${kind}), so this figure was not computed.`]);
    this.gaps.push(createGap(spatialGapCatalog, "BACKEND_UNAVAILABLE", { backend: "POSTGIS" }, { subject }));
  }
  private score(group: Group) {
    return scoreSpatialConfidence({ datasets: group.datasets, requestedRoles: 1, availableRoles: 1, valueKind: group.scoreKind, estimated: false, fallbackApplied: false, evaluatedAt: this.options.evaluatedAt });
  }

  /** Scores the data of a group and emits its figures with their confidence; when the data cannot support them, emits the status that says why instead. */
  private emit(group: Group, seeds: readonly ValuedSeed[]) {
    const outcome = this.score(group);
    if (outcome.kind === "NOT_SCORABLE") {
      this.pushAll(seeds, metricStatusForBlocks(outcome.blockedBy), group.refs, group.limitations);
      this.gaps.push(...gapsForBlocks(outcome.blockedBy, this.inputs, group));
      return;
    }
    const status = group.datasets.some((dataset) => dataset.coverage.status === "PARTIAL") ? "PARTIAL" : "COMPUTED";
    for (const source of seeds) {
      this.metrics.push({
        key: source.key, label: source.label, status, platformState: platformStateFor(status), valueKind: source.valueKind, unit: source.unit, value: source.value,
        interpretation: "MAPPED_FEATURES_ONLY", inputRefs: sortedUnique(group.refs), confidence: structuredClone(outcome.breakdown),
        limitations: sortedUnique([...group.limitations, ...(source.limitations ?? [])]),
      });
    }
    this.gaps.push(...outcome.gaps.map((gap) => ({ ...gap, subject: this.target.id })));
  }

  /** The target lies outside the coverage of the data: the figures are unknown, and scoring must say so rather than produce a value. */
  private emitNoCoverage(group: Group, seeds: readonly Seed[]) {
    const outcome = this.score(group);
    if (outcome.kind !== "NOT_SCORABLE") throw new Error("A target outside the coverage of the data must not be scorable");
    this.pushAll(seeds, metricStatusForBlocks(outcome.blockedBy), group.refs, group.limitations);
    this.gaps.push(...gapsForBlocks(outcome.blockedBy, this.inputs, group));
  }

  // ---------------------------------------------------------------------------------------------------------------- locate
  private async locate() {
    const levels = mapAdminLayers.filter((level) => this.state.levels[level].available);
    if (this.state.publishedReleaseId === null || (!this.state.boundary.available && levels.length === 0)) return;
    try {
      this.located = await this.port.locate({ releaseId: this.state.publishedReleaseId, location: this.target.location, levels });
      this.coverage = assessCoverage(this.located.coverage);
    } catch (error) {
      this.failure = failureKind(error);
    }
  }

  // ---------------------------------------------------------------------------------------------- national boundary, country
  private boundaryMetrics() {
    const within = seed("context.within_boundary", "الموقع داخل حدود الدولة المرسومة في الخريطة", "The location lies inside the national boundary drawn in the Map", "BOOLEAN");
    const country = seed("context.country", "رمز الدولة بحسب حدود الخريطة", "Country code according to the Map's boundary", "CATEGORICAL");
    const input = this.boundaryInput;
    if (input === null) return this.pushAll([within, country], "NOT_AVAILABLE", [], []);
    const refs = this.boundaryRefs;
    if (this.failure !== null) return this.backendFailed([within, country], refs, this.failure, `${this.target.id}/${within.key}`);
    const national = this.located === null ? null : this.located.coverage;
    if (national === null) return this.pushAll([within, country], "NOT_COMPUTABLE", refs, ["The Map returned no boundary for its release."]);

    const limitations = [
      "Compared with the national boundary stored in the Map; its positional accuracy is not declared.",
      ...(this.unofficial ? ["Based on an unofficial boundary that no government authority issued."] : []),
    ];
    // Whether the location is inside is the question being answered, so the boundary is judged as covering it: "no" is a value, not a missing one.
    this.emit(
      { datasets: [{ input, coverage: { status: "FULL" }, geometry: GEOMETRY("SUITABLE") }], refs, limitations, subject: `${this.target.id}/${within.key}`, role: "admin:country", scoreKind: "BOOLEAN" },
      [{ ...within, value: national.status === "FULL" }],
    );
    const countryCode = this.state.boundaryFacts?.countryCode ?? null;
    if (countryCode === null) return this.pushAll([country], "NOT_AVAILABLE", refs, ["The boundary record declares no country code."]);
    this.emit({ datasets: this.boundaryDatasets("SUITABLE"), refs, limitations, subject: `${this.target.id}/${country.key}`, role: "admin:country", scoreKind: "CATEGORICAL" }, [{ ...country, value: countryCode }]);
  }

  // --------------------------------------------------------------------------------------------------- administrative levels
  private adminLimitations(): string[] {
    const anchor = this.located?.anchor;
    return [
      "Assigned from the polygons stored in the Map; their positional accuracy is not declared.",
      ...(this.unofficial ? ["Based on unofficial boundaries that no government authority issued."] : []),
      ...(this.isArea && anchor !== undefined ? [`For an area the unit is stated for its representative point (${anchor.longitude.toFixed(6)}, ${anchor.latitude.toFixed(6)}).`] : []),
    ];
  }

  private levelMetrics(level: MapAdminLayer) {
    const names = LEVELS[level];
    const base = `context.${names.key}`;
    const subject = `${this.target.id}/${base}`;
    const primary = seed(base, `${names.ar} بحسب بيانات الخريطة`, `Administrative ${names.en} according to the Map's data`, "CATEGORICAL");
    const distance = seed(`${base}.boundary_distance`, `المسافة إلى حد ${names.ar}`, `Distance to the edge of the ${names.en} polygon`, "DISTANCE", "m");
    const contains = seed(`${base}.contains_target`, `${names.ar} تحتوي المنطقة المطلوبة بالكامل`, `The ${names.en} polygon contains the whole requested area`, "BOOLEAN");
    const candidates = seed(`${base}.intersecting_units`, `${names.ar}: الوحدات التي يتقاطع معها الموقع`, `${names.title} polygons that intersect the location`, "TEXT");
    const everyFigure = this.isArea ? [primary, distance, contains] : [primary, distance];
    const layer = this.state.levels[level];
    if (!layer.available) return this.pushAll(everyFigure, "NOT_AVAILABLE", [], []);

    const levelInput = layer.input;
    const refs = [...this.boundaryRefs, levelInput.id];
    if (this.failure !== null) return this.backendFailed(everyFigure, refs, this.failure, subject);

    const found = this.located?.levels[level] ?? { units: [] as MapAdminUnit[], truncated: false };
    const anchored = found.units.filter((unit) => unit.coversAnchor);
    const groupFor = (fit: GeometryFit, limitations: readonly string[], key: string, scoreKind: ValueKind): Group => ({
      datasets: [...this.boundaryDatasets("SUITABLE"), { input: levelInput, coverage: this.coverage, geometry: GEOMETRY(fit) }],
      refs, limitations, subject: `${this.target.id}/${key}`, role: `admin:${names.key}`, scoreKind,
    });
    const labels = (units: readonly MapAdminUnit[]) => units.map((unit) => unit.label).sort(compareText).join(" | ");
    const emitCandidates = (fit: GeometryFit) => {
      if (found.units.length >= 2) this.emit(groupFor(fit, this.adminLimitations(), candidates.key, "TEXT"), [{ ...candidates, value: clip(labels(found.units), 1000) }]);
    };

    if (this.coverage.status === "NONE") return this.emitNoCoverage(groupFor("SUITABLE", [], base, "CATEGORICAL"), everyFigure);
    if (anchored.length === 0) {
      this.pushAll(everyFigure, "NOT_FOUND_WITHIN_RADIUS", refs, [`No ${names.en} polygon of the Map covers the location.`]);
      // Only when the location is known to lie inside the mapped country is a missing polygon a gap of the data.
      if (this.coverage.status !== "UNDECLARED") this.gaps.push(createGap(spatialGapCatalog, "ADMIN_UNIT_NOT_FOUND", { dataset: levelInput.ref.label }, { inputId: levelInput.id, subject }));
      return;
    }
    if (anchored.length > 1) {
      this.pushAll(everyFigure, "NOT_COMPUTABLE", refs, ["More than one polygon of this level covers the location, so no single unit is stated."]);
      this.gaps.push(createGap(spatialGapCatalog, "ADMIN_AMBIGUOUS_ON_BOUNDARY", { units: labels(anchored) }, { inputId: levelInput.id, subject }));
      return emitCandidates("PROXY");
    }

    const unit = anchored[0] as MapAdminUnit;
    const edge = unit.edgeDistanceMeters;
    // Within ADMIN_EDGE_NEAR_METERS of the edge, and whenever the distance could not be measured, the assignment is only a proxy for what an official boundary would give.
    const nearEdge = edge === null || edge <= ADMIN_EDGE_NEAR_METERS;
    const fit: GeometryFit = nearEdge ? "PROXY" : "SUITABLE";
    const seeds: ValuedSeed[] = [{ ...primary, value: clip(unit.label, 1000) }];
    if (edge !== null) seeds.push({ ...distance, value: edge, limitations: [DISTANCE_LIMITATION] });
    if (this.isArea) seeds.push({ ...contains, value: unit.coversTarget });
    this.emit(groupFor(fit, this.adminLimitations(), base, "CATEGORICAL"), seeds);
    if (edge === null) this.metrics.push(valueless(distance, "NOT_COMPUTABLE", refs, ["The distance to the edge could not be measured."]));
    else if (nearEdge) this.gaps.push(createGap(spatialGapCatalog, "ADMIN_NEAR_BOUNDARY", { unit: unit.label, distance: edge }, { inputId: levelInput.id, subject }));
    if (this.isArea && found.units.length > 1) this.gaps.push(createGap(spatialGapCatalog, "ADMIN_TARGET_SPANS_UNITS", { units: labels(found.units) }, { inputId: levelInput.id, subject }));
    emitCandidates(fit);
    if (found.truncated) this.gaps.push(createGap(spatialGapCatalog, "RESULT_TRUNCATED", { limit: MAX_ADMIN_UNITS_PER_LEVEL }, { inputId: levelInput.id, subject: `${this.target.id}/${candidates.key}` }));
  }

  // ------------------------------------------------------------------------------------------------------- nearest places
  private async placeMetrics(role: string, layer: PlaceLayer) {
    const kind = role === "place" ? null : role.slice("place:".length);
    const base = `context.${role}.nearest`;
    const subject = `${this.target.id}/${base}.distance`;
    const what = kind === null ? { ar: "مكان مسمّى", en: "mapped place" } : { ar: `مكان مسمّى من نوع «${kind}»`, en: `mapped place of kind “${kind}”` };
    const distance = seed(`${base}.distance`, `المسافة إلى أقرب ${what.ar}`, `Distance to the nearest ${what.en}`, "DISTANCE", "m");
    const name = seed(`${base}.name`, `اسم أقرب ${what.ar}`, `Name of the nearest ${what.en}`, "TEXT");
    const kindSeed = seed(`${base}.kind`, "نوع أقرب مكان مسمّى", "Kind of the nearest mapped place", "CATEGORICAL");
    const everyFigure = kind === null ? [distance, name, kindSeed] : [distance, name];
    if (!layer.available) return this.pushAll(everyFigure, "NOT_AVAILABLE", [], []);

    const { input } = layer;
    const refs = [...this.boundaryRefs, input.id];
    const group: Group = { datasets: [{ input, coverage: this.coverage, geometry: GEOMETRY("EXACT") }], refs, limitations: ["Mapped places only; the Map does not declare that its places are complete."], subject, role, scoreKind: "DISTANCE" };

    // Coverage comes from the national boundary, so a failure to establish it leaves the figures unknown instead of guessing that the location is covered.
    if (this.failure !== null && this.state.boundary.available) return this.backendFailed(everyFigure, refs, this.failure, subject);
    if (this.coverage.status === "NONE") return this.emitNoCoverage({ ...group, limitations: [] }, everyFigure);

    let found: MapNearestResult;
    try {
      const rings = SEARCH_LADDER_METERS.filter((meters) => meters <= this.options.maxSearchMeters);
      found = await this.port.nearest({ releaseId: layer.releaseId, layerId: "places", location: this.target.location, kind, rings, limit: 1 });
    } catch (error) {
      return this.backendFailed(everyFigure, refs, failureKind(error), subject);
    }

    const best = found.matches[0];
    const stray = found.unrecognized;
    // A feature whose kind cannot be read might be the nearest of the wanted kind, so the answer is only given when none is as near as the best match.
    if (stray.count > 0 && (best === undefined || (stray.nearestMeters !== null && stray.nearestMeters <= best.distanceMeters))) {
      this.pushAll(everyFigure, "NOT_COMPUTABLE", refs, ["Features whose kind cannot be read were found nearby, so the nearest place of the requested kind cannot be stated."]);
      this.gaps.push(createGap(spatialGapCatalog, "MAP_SOURCE_ID_UNRECOGNIZED", { count: stray.count, dataset: input.ref.label }, { inputId: input.id, subject }));
      return;
    }
    if (best === undefined) {
      const limitations = [`Nothing mapped of this kind was found within ${found.searchedMeters} m.`, ...(this.coverage.status === "UNDECLARED" ? ["The extent covered by the data is not declared."] : [])];
      return this.pushAll(everyFigure, "NOT_FOUND_WITHIN_RADIUS", refs, limitations);
    }
    const seeds: ValuedSeed[] = [{ ...distance, value: best.distanceMeters, limitations: [DISTANCE_LIMITATION] }, { ...name, value: clip(best.label, 1000) }];
    if (kind === null) seeds.push({ ...kindSeed, value: best.kind });
    this.emit(group, seeds);
  }
}

export function computeLocationContext(port: SpatialMapPort, state: LocationContextMapState, target: ContextTarget, options: ContextOptions): Promise<TargetContext> {
  return new LocationContextRun(port, state, target, options).run();
}
