import type { SpatialLocation } from "./contracts";
import type { MapAdminLayer, MapDescription } from "./map-contract";
import type { SpatialDataPort } from "./ports";

/**
 * The engine's view of the Map: a handful of typed, read-only questions. Nothing here accepts SQL or a table name, and every answer is
 * plain data, so the PostGIS adapter can be replaced (another connection, another placement) without touching the analyses.
 */
export interface MapDescribeRequest {
  /** The release to describe. Omitted: the release the Map has published. */
  releaseId?: string | null;
  /** The layers whose reviewed provenance, binding and feature presence are wanted. */
  layers: readonly string[];
}

export type GeometryCheck = { valid: true } | { valid: false; reason: string };

export interface MapLocateRequest {
  releaseId: string;
  location: SpatialLocation;
  levels: readonly MapAdminLayer[];
}
export interface MapAdminUnit {
  id: string;
  label: string;
  /** The unit's polygon covers the representative point of the target (the point itself for a point). Edges count as covered. */
  coversAnchor: boolean;
  coversTarget: boolean;
  /** Geodesic distance from the target to the edge of this unit's polygon; measured only for units that cover the anchor. */
  edgeDistanceMeters: number | null;
}
export interface MapLocateResult {
  /** A point guaranteed to lie on the target: the target itself, or PostGIS's point-on-surface for an area. */
  anchor: { longitude: number; latitude: number };
  /** The target against the release's boundary. Null when the release has no boundary. */
  coverage: { status: "FULL" | "PARTIAL" | "NONE"; fraction: number | null } | null;
  /** Units whose polygons intersect the target, per level, in a stable order. */
  levels: Record<string, { units: MapAdminUnit[]; truncated: boolean }>;
}

export interface MapNearestRequest {
  releaseId: string;
  layerId: string;
  location: SpatialLocation;
  /** The kind wanted (`locality`), or null for any recognized kind. */
  kind: string | null;
  /**
   * Ascending search distances in metres. The search stops at the first ring that holds `limit` features of the wanted kind or any feature
   * whose kind cannot be read (nothing beyond that distance can be trusted), and otherwise after the last ring.
   */
  rings: readonly number[];
  limit: number;
}
export interface MapNearestFeature { id: string; label: string; kind: string; sourceId: string; distanceMeters: number }
export interface MapNearestResult {
  /** The largest ring that was searched. */
  searchedMeters: number;
  /** The ring in which the last of the matches was found, or null when there are no matches. */
  ringMeters: number | null;
  /** Features of the wanted kind, nearest first. */
  matches: MapNearestFeature[];
  /** Features within the searched rings whose `sourceId` is not recognized, so whose kind is unknown. */
  unrecognized: { count: number; nearestMeters: number | null };
}

export interface MapCountRequest {
  releaseId: string;
  layerId: string;
  location: SpatialLocation;
  kind: string | null;
  radiiMeters: readonly number[];
}
export interface MapCountResult {
  radii: Array<{ radiusMeters: number; count: number; unrecognized: number }>;
}

export interface DatasetMeasureRequest {
  features: readonly unknown[];
  location: SpatialLocation;
  radiiMeters: readonly number[];
  maxSearchMeters: number;
  nearestCount: number;
  includePopulation: boolean;
}
export interface DatasetMeasureResult {
  valid: boolean;
  nearest: Array<{ index: number; id: string | null; name: string | null; distanceMeters: number }>;
  radii: Array<{ radiusMeters: number; count: number; populationEstimate: number | null }>;
}

export interface SpatialMapPort extends SpatialDataPort {
  describeMap(request: MapDescribeRequest): Promise<MapDescription>;
  checkGeometries(locations: readonly SpatialLocation[]): Promise<GeometryCheck[]>;
  locate(request: MapLocateRequest): Promise<MapLocateResult>;
  nearest(request: MapNearestRequest): Promise<MapNearestResult>;
  countFeatures(request: MapCountRequest): Promise<MapCountResult>;
  measureDataset(request: DatasetMeasureRequest): Promise<DatasetMeasureResult>;
}
