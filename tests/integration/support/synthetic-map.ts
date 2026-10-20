import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { governoratesProvenance, osmProvenance, realCoverage, regionsProvenance } from "../../unit/support/spatial-map-fixtures";

/**
 * A small synthetic Map with geometry whose answers can be worked out by hand, built through the Map's own release state machine
 * (Draft, Processing, rows, Ready, Approved, Published) by an administrator connection on a scratch database.
 *
 *   national boundary   lon 40..50 x lat 20..30           (country code ZZ, so nothing here can be mistaken for the real data)
 *   regions             West 40..45 x 20..30 | East 45..50 x 20..30          they share the edge lon = 45
 *   governorates        Alpha 40..45 x 20..25 | Beta 40..45 x 25..30         they share the edge lat = 25
 *                       Gamma 45..49 x 20..30  (nothing covers lon 49..50)   Delta 46..47 x 22..23 lies inside Gamma
 *   places              neighbourhoods and localities at known positions
 */
export type Ring = Array<[number, number]>;
export const rect = (west: number, south: number, east: number, north: number): { type: "Polygon"; coordinates: Ring[] } => ({
  type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
});
export const point = (longitude: number, latitude: number) => ({ type: "Point" as const, coordinates: [longitude, latitude] as [number, number] });

export interface SeedFeature { layerId: string; label: string; sourceId: string | null; geometry: unknown }
export interface SeedBinding { layerId: string; provenance: unknown; status?: "ready" | "unavailable" | "warning"; enabled?: boolean }
export interface SeedRelease {
  version: string;
  /** The status the release ends in. Published also points the Map's runtime at it. */
  finalStatus: "Processing" | "Ready" | "Approved" | "Published";
  boundary?: { geometry: unknown; coverage: unknown } | null;
  features: SeedFeature[];
  bindings: SeedBinding[];
}

const SYNTHETIC_COUNTRY = "ZZ";
export const syntheticCoverage = (layers: Array<{ id: string; provenance: unknown }>, over: Record<string, unknown> = {}) => ({
  ...realCoverage, countryCode: SYNTHETIC_COUNTRY, boundarySource: "synthetic test boundary", layers, ...over,
});
export const allLayerProvenance = [
  { id: "regions", provenance: regionsProvenance }, { id: "governorates", provenance: governoratesProvenance }, { id: "places", provenance: osmProvenance },
];

export const WORLD = {
  country: { type: "MultiPolygon" as const, coordinates: [rect(40, 20, 50, 30).coordinates] },
  regions: [{ label: "West Region", geometry: rect(40, 20, 45, 30) }, { label: "East Region", geometry: rect(45, 20, 50, 30) }],
  governorates: [
    { label: "Alpha", geometry: rect(40, 20, 45, 25) }, { label: "Beta", geometry: rect(40, 25, 45, 30) },
    { label: "Gamma", geometry: rect(45, 20, 49, 30) }, { label: "Delta", geometry: rect(46, 22, 47, 23) },
  ],
};
export const tile = (ordinal: number) => `12/${100 + ordinal}/${200 + ordinal}/${ordinal}`;
export const placeId = (kind: string, ordinal: number) => `places:${kind}:${tile(ordinal)}`;

export const standardFeatures = (): SeedFeature[] => [
  ...WORLD.regions.map((entry) => ({ layerId: "regions", label: entry.label, sourceId: null, geometry: entry.geometry })),
  ...WORLD.governorates.map((entry) => ({ layerId: "governorates", label: entry.label, sourceId: null, geometry: entry.geometry })),
  { layerId: "places", label: "Hayy Alpha", sourceId: placeId("neighbourhood", 1), geometry: point(42.0, 22.0) },
  { layerId: "places", label: "Hayy Beta", sourceId: placeId("neighbourhood", 2), geometry: point(42.0, 27.0) },
  { layerId: "places", label: "Qarya East", sourceId: placeId("locality", 3), geometry: point(47.5, 27.0) },
  { layerId: "places", label: "Qarya Gamma", sourceId: placeId("locality", 4), geometry: point(47.0, 21.0) },
];
export const standardBindings = (): SeedBinding[] => [{ layerId: "regions", provenance: regionsProvenance }, { layerId: "places", provenance: osmProvenance }];

/** The standard synthetic release: governorates are data-only (no display binding), as in the real Saudi release. */
export const standardRelease = (version: string, finalStatus: SeedRelease["finalStatus"] = "Published"): SeedRelease => ({
  version, finalStatus, boundary: { geometry: WORLD.country, coverage: syntheticCoverage(allLayerProvenance) }, features: standardFeatures(), bindings: standardBindings(),
});

/** Builds a release through the Map's state machine and returns its id. */
export async function seedRelease(client: Client, spec: SeedRelease): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO jenan_map.release (id, version, status, source, "sourceDate", license, "createdBy") VALUES ($1, $2, 'Draft', $3, $4, 'ODbL-1.0', 'engine-tests')`,
    [id, spec.version, "Synthetic test release", "2026-10-17T04:00:00.000Z"],
  );
  await client.query(`UPDATE jenan_map.release SET status = 'Processing' WHERE id = $1`, [id]);
  if (spec.boundary) {
    await client.query(
      `INSERT INTO jenan_map.boundary (id, "releaseId", authority, source, geometry, coverage) VALUES ($1, $2, $3, $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), $6::jsonb)`,
      [randomUUID(), id, "synthetic open data — not a government authority", "synthetic boundary", JSON.stringify(spec.boundary.geometry), JSON.stringify(spec.boundary.coverage)],
    );
  }
  for (const feature of spec.features) {
    await client.query(
      `INSERT INTO jenan_map.feature (id, "releaseId", label, category, geometry, search, "sourceId", "layerId", aliases)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), to_tsvector('simple', $3), $6, $4, '{}')`,
      [randomUUID(), id, feature.label, feature.layerId, JSON.stringify(feature.geometry), feature.sourceId],
    );
  }
  for (const binding of spec.bindings) {
    await client.query(
      `INSERT INTO jenan_map.release_layer ("releaseId", "layerId", visibility, status, "styleLayerIds", enabled, provenance) VALUES ($1, $2, 'public', $3, ARRAY[$2::text], $4, $5::jsonb)`,
      [id, binding.layerId, binding.status ?? "ready", binding.enabled ?? true, JSON.stringify(binding.provenance)],
    );
  }
  const order = ["Ready", "Approved", "Published"] as const;
  for (const status of order.slice(0, order.indexOf(spec.finalStatus as typeof order[number]) + 1)) {
    if (status === "Approved") await client.query(`UPDATE jenan_map.release SET status = 'Approved', "reviewedBy" = 'engine-tests', "reviewedAt" = now() WHERE id = $1`, [id]);
    else if (status === "Published") await client.query(`UPDATE jenan_map.release SET status = 'Published', "publishedAt" = now() WHERE id = $1`, [id]);
    else await client.query(`UPDATE jenan_map.release SET status = $2 WHERE id = $1`, [id, status]);
  }
  if (spec.finalStatus === "Published") await setRuntime(client, "enabled", id);
  return id;
}

export async function setRuntime(client: Client, status: "enabled" | "maintenance" | "disabled", releaseId: string | null) {
  await client.query(`UPDATE jenan_map.runtime SET status = $1, "publishedReleaseId" = $2, revision = revision + 1, "updatedAt" = now() WHERE id = 1`, [status, releaseId]);
}
