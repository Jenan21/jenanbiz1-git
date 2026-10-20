import { z } from "zod";
import type { BoundingBox } from "./geometry-precheck";

/**
 * What the Spatial Engine knows about the Jenan PRO Map, written as a contract and kept pure (no database, no Map code).
 * The adapter reads the Map's tables with fixed, read-only SQL; this module says which tables and columns it relies on, how
 * a layer's kind is read from a feature's `sourceId`, which layers count as registered, and how provenance and the official
 * status of boundaries are interpreted. Everything uncertain fails closed: an unknown format is not guessed, an undeclared
 * boundary status is "not official", and an unreviewed layer is "not registered".
 */
export const MAP_SCHEMA = "jenan_map";
const DAY_MS = 86_400_000;

// ----------------------------------------------------------------------------------------------------------------- layers
export const mapAdminLayers = ["regions", "governorates"] as const;
export type MapAdminLayer = typeof mapAdminLayers[number];
/** Layers whose features carry their kind in `sourceId` (`places:locality:12/2513/1735/2`). The administrative layers do not. */
export const mapTileLayers = ["places", "pois", "roads"] as const;
export type MapTileLayer = typeof mapTileLayers[number];
export const isMapTileLayer = (layerId: string): layerId is MapTileLayer => (mapTileLayers as readonly string[]).includes(layerId);

const roleLayers: Readonly<Record<string, string>> = { place: "places", poi: "pois", road: "roads", competitor: "competitors", population: "population" };
/** The Map layer a role is read from, or null when the Map has no layer for it (constraints, unknown namespaces). */
export function mapLayerForRole(role: string): string | null {
  const namespace = role.split(":", 1)[0] as string;
  return Object.prototype.hasOwnProperty.call(roleLayers, namespace) ? (roleLayers[namespace] as string) : null;
}

const layerLabels: Readonly<Record<string, string>> = {
  boundary: "National boundary", regions: "Regions", governorates: "Governorates", places: "Places", pois: "Points of interest", roads: "Roads", competitors: "Competitors", population: "Population",
};
export const mapLayerLabel = (layerId: string) => (Object.prototype.hasOwnProperty.call(layerLabels, layerId) ? (layerLabels[layerId] as string) : layerId);

// ---------------------------------------------------------------------------------------------------------------- sourceId
/**
 * The kind of a place, point of interest or road is not a column: the Map encodes it in `sourceId` as `<layer>:<kind>:<z>/<x>/<y>/<n>`.
 * That is a Map-internal encoding, so it is read with one strict pattern and nothing else. A value that does not match exactly is
 * "unrecognized" and its kind stays unknown: it is never matched loosely, never split on ":" and never guessed from the label.
 * The same pattern string is used by the parser here and by the adapter's SQL, so both sides always agree.
 */
const KIND_PATTERN = "[a-z][a-z0-9_]{0,39}";
const TILE_PATTERN = "[0-9]{1,2}/[0-9]{1,7}/[0-9]{1,7}/[0-9]{1,9}";
const KIND_ONLY = new RegExp(`^${KIND_PATTERN}$`);
const SOURCE_ID = new RegExp(`^(${mapTileLayers.join("|")}):(${KIND_PATTERN}):([0-9]{1,2})/([0-9]{1,7})/([0-9]{1,7})/([0-9]{1,9})$`);
export const MAX_SOURCE_ID_LENGTH = 120;

/** POSIX-compatible pattern (valid for PostgreSQL and JavaScript alike) that recognizes a layer's source ids, of one kind or of any kind. */
export function sourceIdPattern(layerId: MapTileLayer, kind?: string): string {
  if (!isMapTileLayer(layerId)) throw new RangeError(`Layer ${layerId} does not encode kinds in sourceId`);
  if (kind !== undefined && !KIND_ONLY.test(kind)) throw new RangeError("A kind is lower-case letters, digits and underscores, starting with a letter");
  return `^${layerId}:${kind ?? KIND_PATTERN}:${TILE_PATTERN}$`;
}

export type ParsedSourceId =
  | { ok: true; layer: MapTileLayer; kind: string; tile: { z: number; x: number; y: number }; ordinal: number }
  | { ok: false; reason: "MISSING" | "NOT_KIND_ADDRESSED" | "FORMAT" | "LAYER_MISMATCH" };
export function parseMapSourceId(layerId: string, sourceId: string | null | undefined): ParsedSourceId {
  if (!isMapTileLayer(layerId)) return { ok: false, reason: "NOT_KIND_ADDRESSED" };
  if (sourceId === null || sourceId === undefined || sourceId === "") return { ok: false, reason: "MISSING" };
  if (sourceId.length > MAX_SOURCE_ID_LENGTH) return { ok: false, reason: "FORMAT" };
  const match = SOURCE_ID.exec(sourceId);
  if (!match) return { ok: false, reason: "FORMAT" };
  if (match[1] !== layerId) return { ok: false, reason: "LAYER_MISMATCH" };
  return { ok: true, layer: layerId, kind: match[2] as string, tile: { z: Number(match[3]), x: Number(match[4]), y: Number(match[5]) }, ordinal: Number(match[6]) };
}

// ------------------------------------------------------------------------------------------------------------- provenance
const requiredText = (max: number) => z.string().trim().min(1).max(max);
const instant = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), "An ISO 8601 instant");
/** The reviewed provenance of one layer. The Map requires all seven keys when it accepts a layer, so a layer missing any of them is not reviewed. */
export const mapProvenanceSchema = z.object({
  source: requiredText(2000), organization: requiredText(2000), url: requiredText(2000), license: requiredText(2000), attribution: requiredText(4000),
  sourceDate: instant, importedAt: instant,
});
export type MapProvenance = z.infer<typeof mapProvenanceSchema>;

/** The coverage record of a release's boundary, as the Map writes it (`jenan_map.boundary.coverage`). */
export const mapCoverageSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  authoritative: z.boolean().optional(),
  unofficial: z.boolean().optional(),
  notice: requiredText(500).optional(),
  boundaryAuthority: requiredText(500).optional(),
  boundarySource: requiredText(500).optional(),
  boundarySha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  coverageVerified: z.boolean().optional(),
  coverageBasis: requiredText(200).optional(),
  provenance: z.unknown().optional(),
  layers: z.array(z.object({ id: requiredText(100), provenance: z.unknown() })).max(100).optional(),
});
export type MapCoverage = z.infer<typeof mapCoverageSchema>;

/** A boundary is official only when the Map says so explicitly. Silence, `unofficial: true` and any malformed record all mean "not official". */
export function isOfficialBoundary(coverage: Pick<MapCoverage, "authoritative" | "unofficial"> | null): boolean {
  return coverage !== null && coverage.authoritative === true && coverage.unofficial !== true;
}

export interface MapBoundaryFacts {
  id: string;
  authority: string;
  source: string;
  countryCode: string | null;
  official: boolean;
  notice: string | null;
  /** The authority exactly as the Map recorded it (for example "geoBoundaries open data — not a Saudi government authority"). */
  authorityText: string;
  sha256: string | null;
  boundingBox: BoundingBox | null;
  /** Reviewed provenance listed by the release for each dataset it holds, keyed by layer id. */
  layerProvenance: Record<string, MapProvenance>;
  provenance: MapProvenance | null;
}
export interface RawMapBoundaryRow { id: string; authority: string; source: string; coverage: unknown; west: number | null; south: number | null; east: number | null; north: number | null }

export function interpretMapBoundary(row: RawMapBoundaryRow): MapBoundaryFacts {
  const parsed = mapCoverageSchema.safeParse(row.coverage);
  const coverage = parsed.success ? parsed.data : null;
  const layerProvenance: Record<string, MapProvenance> = {};
  for (const entry of coverage?.layers ?? []) {
    const reviewed = mapProvenanceSchema.safeParse(entry.provenance);
    if (reviewed.success && !Object.prototype.hasOwnProperty.call(layerProvenance, entry.id)) layerProvenance[entry.id] = reviewed.data;
  }
  const own = coverage?.provenance === undefined ? null : mapProvenanceSchema.safeParse(coverage.provenance);
  const corners = [row.west, row.south, row.east, row.north];
  const boundingBox = corners.every((value): value is number => typeof value === "number" && Number.isFinite(value)) && (row.west as number) <= (row.east as number) && (row.south as number) <= (row.north as number)
    ? { west: row.west as number, south: row.south as number, east: row.east as number, north: row.north as number } : null;
  return {
    id: row.id, authority: row.authority, source: row.source, countryCode: coverage?.countryCode ?? null, official: isOfficialBoundary(coverage),
    notice: coverage?.notice ?? null, authorityText: coverage?.boundaryAuthority ?? row.authority, sha256: coverage?.boundarySha256 ?? null, boundingBox,
    layerProvenance, provenance: own?.success ? own.data : null,
  };
}

// --------------------------------------------------------------------------------------------------------------- registration
export const mapRuntimeStatuses = ["enabled", "maintenance", "disabled"] as const;
export const mapReleaseStatuses = ["Draft", "Processing", "Ready", "Approved", "Published", "Archived", "Failed"] as const;
export const mapBindingStatuses = ["ready", "unavailable", "warning"] as const;
export interface MapRuntimeFacts { status: typeof mapRuntimeStatuses[number]; publishedReleaseId: string | null }
export interface MapReleaseFacts {
  id: string; version: string; status: typeof mapReleaseStatuses[number]; source: string; sourceDate: string | null; license: string; publishedAt: string | null;
}
export interface MapLayerFacts {
  id: string;
  /** Reviewed provenance the release lists for this layer; null when the layer is not listed or its provenance is incomplete. */
  provenance: MapProvenance | null;
  binding: { enabled: boolean; status: typeof mapBindingStatuses[number]; visibility: string } | null;
  hasFeatures: boolean;
}
export interface MapDescription {
  runtime: MapRuntimeFacts | null;
  release: MapReleaseFacts | null;
  boundary: MapBoundaryFacts | null;
  layers: MapLayerFacts[];
}

export const unregisteredReasons = ["MAP_NOT_ENABLED", "RELEASE_NOT_ACTIVE", "RELEASE_NOT_PUBLISHED", "PROVENANCE_NOT_REVIEWED", "BINDING_WITHDRAWN"] as const;
export type UnregisteredReason = typeof unregisteredReasons[number];

/**
 * A layer is registered when the Map serves it: the Map is enabled, its release is the one the Map has published, and the release
 * lists reviewed provenance for the layer. A display binding is not required (data-only layers such as the governorates have none),
 * but a binding that the Map has disabled or marked unavailable withdraws the layer. Anything else is unregistered.
 */
export function assessMapRegistration(
  description: Pick<MapDescription, "runtime" | "release">,
  layer: { provenance: MapProvenance | null; binding: MapLayerFacts["binding"] },
): { registered: boolean; reasons: UnregisteredReason[] } {
  const reasons: UnregisteredReason[] = [];
  const { runtime, release } = description;
  if (!runtime || runtime.status !== "enabled") reasons.push("MAP_NOT_ENABLED");
  if (!release || !runtime || runtime.publishedReleaseId !== release.id) reasons.push("RELEASE_NOT_ACTIVE");
  if (!release || release.status !== "Published") reasons.push("RELEASE_NOT_PUBLISHED");
  if (layer.provenance === null) reasons.push("PROVENANCE_NOT_REVIEWED");
  if (layer.binding && (!layer.binding.enabled || layer.binding.status === "unavailable")) reasons.push("BINDING_WITHDRAWN");
  return { registered: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------------------------------------------- freshness
/**
 * The Map records when a layer's source was published but declares no freshness period. The engine applies these documented defaults
 * (boundaries change slowly, extracts of mapped places change continuously) and says so on the input it describes.
 */
export const MAP_FRESHNESS_DAYS = { default: 365, boundary: 1825, regions: 1825, governorates: 1825 } as const;
export function mapFreshnessDays(layerKey: string): number {
  return Object.prototype.hasOwnProperty.call(MAP_FRESHNESS_DAYS, layerKey) && layerKey !== "default" ? MAP_FRESHNESS_DAYS[layerKey as keyof typeof MAP_FRESHNESS_DAYS] : MAP_FRESHNESS_DAYS.default;
}
export interface MapFreshness { status: "FRESH" | "STALE" | "UNKNOWN"; sourcePublishedAt: string | null; freshnessDays: number | null; expiresAt: null }
/** A source without a usable date is UNKNOWN, never silently fresh. */
export function mapFreshness(sourceDate: string | null, freshnessDays: number, evaluatedAt: string): MapFreshness {
  if (sourceDate === null || Number.isNaN(Date.parse(sourceDate)) || Number.isNaN(Date.parse(evaluatedAt))) return { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null };
  const stale = Date.parse(evaluatedAt) - Date.parse(sourceDate) > freshnessDays * DAY_MS;
  return { status: stale ? "STALE" : "FRESH", sourcePublishedAt: new Date(sourceDate).toISOString(), freshnessDays, expiresAt: null };
}

// ------------------------------------------------------------------------------------------------------------- read contract
/**
 * The tables and columns the adapter reads, with their exact PostgreSQL types (`format_type`). The adapter checks this against the
 * connected database before it reads anything, and the contract tests check it against the Map's own migrations and against real data.
 */
export const MAP_READ_CONTRACT = {
  schema: MAP_SCHEMA,
  tables: {
    runtime: { id: "integer", status: "text", publishedReleaseId: "uuid" },
    release: { id: "uuid", version: "text", status: "text", source: "text", sourceDate: "timestamp with time zone", license: "text", publishedAt: "timestamp with time zone" },
    boundary: { id: "uuid", releaseId: "uuid", authority: "text", source: "text", coverage: "jsonb", geometry: "geometry(MultiPolygon,4326)" },
    release_layer: { releaseId: "uuid", layerId: "text", visibility: "text", status: "text", enabled: "boolean" },
    feature: { id: "uuid", releaseId: "uuid", label: "text", layerId: "text", sourceId: "text", geometry: "geometry(Geometry,4326)" },
  },
  /** Indexes the queries rely on for speed. Their absence slows the engine down but does not change a result, so only the tests check them. */
  indexes: [
    { table: "feature", name: "feature_release_idx", method: "btree", expression: "\"releaseId\"" },
    { table: "feature", name: "feature_geometry_idx", method: "gist", expression: "(geometry)" },
    { table: "feature", name: "feature_geography_idx", method: "gist", expression: "(geometry)::geography" },
    { table: "boundary", name: "boundary_geometry_idx", method: "gist", expression: "(geometry)" },
  ],
} as const;
export const MAP_CONTRACT_TABLES = Object.keys(MAP_READ_CONTRACT.tables);
export interface CatalogColumn { table: string; column: string; type: string }
export interface CatalogIndex { table: string; name: string; definition: string }

/** Differences between the connected database and the contract: a missing table or column, or a column whose type changed. Empty means they agree. */
export function findMapContractProblems(columns: readonly CatalogColumn[]): string[] {
  const problems: string[] = [];
  const found = new Map(columns.map((entry) => [`${entry.table}.${entry.column}`, entry.type]));
  const tablesSeen = new Set(columns.map((entry) => entry.table));
  for (const [table, expected] of Object.entries(MAP_READ_CONTRACT.tables)) {
    if (!tablesSeen.has(table)) { problems.push(`${MAP_SCHEMA}.${table} is missing`); continue; }
    for (const [column, type] of Object.entries(expected)) {
      const actual = found.get(`${table}.${column}`);
      if (actual === undefined) problems.push(`${MAP_SCHEMA}.${table}.${column} is missing`);
      else if (actual !== type) problems.push(`${MAP_SCHEMA}.${table}.${column} is ${actual}, expected ${type}`);
    }
  }
  return problems;
}
export function findMapIndexProblems(indexes: readonly CatalogIndex[]): string[] {
  return MAP_READ_CONTRACT.indexes.flatMap((expected) => {
    const actual = indexes.find((entry) => entry.table === expected.table && entry.name === expected.name);
    if (!actual) return [`${MAP_SCHEMA}.${expected.table} has no index ${expected.name}`];
    const normalized = actual.definition.replace(/\s+/g, " ");
    const problems: string[] = [];
    if (!normalized.includes(`USING ${expected.method}`)) problems.push(`${expected.name} is not a ${expected.method} index`);
    if (!normalized.includes(expected.expression)) problems.push(`${expected.name} does not index ${expected.expression}`);
    return problems;
  });
}
