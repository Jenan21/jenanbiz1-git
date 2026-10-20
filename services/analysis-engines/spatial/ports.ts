import type { AreaGeometry, PointGeometry } from "./geometry-precheck";

/**
 * The seam between the Spatial Engine and wherever its spatial computation runs. In v1 the compute backend is PostGIS. The engine is
 * written against this port so the computation can move (the application database, or a dedicated read-only connection) without any
 * change to the request and result contracts. The port is read-only by construction: nothing here can write, and it never touches the
 * schema of the Map.
 *
 * Milestone 1 fixes only the seam. The query primitives (locate, nearest, count, density, screening) are added, with tests, by the
 * milestones that implement the analyses that use them.
 */
export type SpatialPlacement = "APP_DATABASE" | "DEDICATED_CONNECTION";

export interface SpatialBackendCapabilities {
  backend: "POSTGIS";
  placement: SpatialPlacement;
  readOnly: true;
  /** Versions reported by the backend itself; null when it could not be determined. */
  postgis: string | null;
  geos: string | null;
  proj: string | null;
  /** Whether the Map's published layers can be read through this connection. */
  mapSchemaReachable: boolean;
}

/** A feature supplied inline. Test fixtures only: a production run reads Data Center versions and registered Map layers. */
export interface InlineFeature {
  id: string;
  kind?: string;
  name?: string;
  geometry: PointGeometry | AreaGeometry;
}

/** Where the features of one role come from. */
export type LayerHandle =
  | { source: "MAP_LAYER"; releaseId: string; layerKey: string }
  | { source: "INLINE_GEOJSON"; id: string; features: readonly InlineFeature[] };

export interface SpatialDataPort {
  capabilities(): Promise<SpatialBackendCapabilities>;
}
