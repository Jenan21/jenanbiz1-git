import type { DataCenterGeoFeature } from "@/services/data-center/contracts";
import type { SpatialLocation } from "./contracts";
import type { DataCenterGeography } from "./data-center-port";
import { boundingBoxOf, type BoundingBox } from "./geometry-precheck";

/**
 * What the engine requires of the features of a dataset it reads from the Data Center, on top of the Data Center's own GeoJSON validation
 * (WGS84, positions in range, closed rings, structure limits). Anything else is refused as a whole: a feature without a geometry or a
 * geometry collection is never skipped silently, because a measurement over "the features that happened to be usable" would not be a
 * measurement over the dataset. Topological validity (self-intersection and the like) is decided by PostGIS when the features reach it.
 */
export const MAX_DATASET_FEATURES = 10_000;
export const datasetContentProblems = ["NO_FEATURES", "TOO_MANY_FEATURES", "FEATURE_WITHOUT_GEOMETRY", "GEOMETRY_COLLECTION_NOT_SUPPORTED"] as const;
export type DatasetContentProblem = typeof datasetContentProblems[number];

export interface SpatialDatasetFeature {
  /** The position of the feature in the dataset's content: with the version, a stable reference to it. */
  index: number;
  /** The GeoJSON `id` of the feature when it has a usable one (a string of up to 128 characters, or a finite number). */
  id: string | null;
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] };
}
export type DatasetFeatureCheck = { ok: true; features: SpatialDatasetFeature[] } | { ok: false; code: DatasetContentProblem; index: number | null };

function featureId(feature: DataCenterGeoFeature): string | null {
  const id = (feature as { id?: unknown }).id;
  if (typeof id === "string") return id.length > 0 && id.length <= 128 ? id : null;
  return typeof id === "number" && Number.isFinite(id) ? String(id) : null;
}

export function checkDatasetFeatures(features: readonly DataCenterGeoFeature[]): DatasetFeatureCheck {
  if (features.length === 0) return { ok: false, code: "NO_FEATURES", index: null };
  if (features.length > MAX_DATASET_FEATURES) return { ok: false, code: "TOO_MANY_FEATURES", index: null };
  const checked: SpatialDatasetFeature[] = [];
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index] as DataCenterGeoFeature;
    if (feature.geometry === null) return { ok: false, code: "FEATURE_WITHOUT_GEOMETRY", index };
    if (feature.geometry.type === "GeometryCollection") return { ok: false, code: "GEOMETRY_COLLECTION_NOT_SUPPORTED", index };
    checked.push({ index, id: featureId(feature), properties: feature.properties, geometry: feature.geometry });
  }
  return { ok: true, features: checked };
}

const METERS_PER_DEGREE = 111_320;
/**
 * The geographic filter for discovering datasets that cover where the analysis happens: the box of every target, widened by the distance the
 * analysis looks around it. Longitude degrees shrink with latitude, so the widening uses the highest latitude the widened box reaches.
 * The box is clamped to the globe; areas that cross the antimeridian are not supported in v1.
 */
export function targetGeography(locations: readonly SpatialLocation[], marginMeters: number): DataCenterGeography {
  const boxes: BoundingBox[] = locations.map((location) => boundingBoxOf(location));
  const union = boxes.reduce<BoundingBox>((box, next) => ({ west: Math.min(box.west, next.west), south: Math.min(box.south, next.south), east: Math.max(box.east, next.east), north: Math.max(box.north, next.north) }),
    { west: Number.POSITIVE_INFINITY, south: Number.POSITIVE_INFINITY, east: Number.NEGATIVE_INFINITY, north: Number.NEGATIVE_INFINITY });
  const latitudeMargin = marginMeters / METERS_PER_DEGREE;
  const highest = Math.min(89, Math.max(Math.abs(union.south - latitudeMargin), Math.abs(union.north + latitudeMargin)));
  const longitudeMargin = marginMeters / (METERS_PER_DEGREE * Math.cos((highest * Math.PI) / 180));
  return {
    boundingBox: {
      west: Math.max(-180, union.west - longitudeMargin), south: Math.max(-90, union.south - latitudeMargin),
      east: Math.min(180, union.east + longitudeMargin), north: Math.min(90, union.north + latitudeMargin),
    },
  };
}
