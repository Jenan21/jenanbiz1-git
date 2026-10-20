import { z } from "zod";
import { roundTo } from "../../shared/canonical";
import { MAX_ADMIN_UNITS_PER_LEVEL } from "../constants";
import type { SpatialLocation } from "../contracts";
import {
  interpretMapBoundary, isMapTileLayer, findMapContractProblems, MAP_CONTRACT_TABLES, MAP_SCHEMA, mapBindingStatuses, mapReleaseStatuses, mapRuntimeStatuses, parseMapSourceId, sourceIdPattern,
  type MapDescription, type MapLayerFacts,
} from "../map-contract";
import { MapReadError } from "../map-read-error";
import type {
  DatasetMeasureRequest, DatasetMeasureResult, GeometryCheck, MapAdminUnit, MapCountRequest, MapCountResult, MapDescribeRequest, MapLocateRequest, MapLocateResult, MapNearestFeature, MapNearestRequest, MapNearestResult, SpatialMapPort,
} from "../map-port";
import type { SpatialBackendCapabilities } from "../ports";
import { openReadOnlySession, type ReadOnlySession, type ReadOnlySessionConfig, type SessionPool } from "./read-only-session";
import { QUERIES } from "./queries";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const optionalText = z.string().nullable();

const presenceRow = z.object({ present: z.boolean() });
const versionRow = z.object({ postgis: optionalText, geos: optionalText, proj: optionalText });
const catalogRow = z.object({ table: z.string(), column: z.string(), type: z.string() });
const roleRow = z.object({ superuser: z.boolean(), writeAll: z.boolean(), schemaUsage: z.boolean(), canSelectAll: z.boolean(), canWriteSome: z.boolean(), tables: z.number().int() });
const runtimeRow = z.object({ status: z.enum(mapRuntimeStatuses), publishedReleaseId: uuid.nullable() });
const releaseRow = z.object({ id: uuid, version: z.string(), status: z.enum(mapReleaseStatuses), source: z.string(), sourceDate: optionalText, license: z.string(), publishedAt: optionalText });
const boundaryRow = z.object({
  id: uuid, authority: z.string(), source: z.string(), coverage: z.unknown(),
  west: z.number().nullable(), south: z.number().nullable(), east: z.number().nullable(), north: z.number().nullable(),
});
const layerRow = z.object({
  layerId: z.string(), bindingEnabled: z.boolean().nullable(), bindingStatus: z.enum(mapBindingStatuses).nullable(), bindingVisibility: optionalText, hasFeatures: z.boolean(),
});
const geometryCheckRow = z.object({ ordinal: z.number().int(), valid: z.boolean(), reason: optionalText });
const coverageRow = z.object({
  anchorLongitude: z.number(), anchorLatitude: z.number(), hasBoundary: z.boolean(), covers: z.boolean(), intersects: z.boolean(), fraction: z.number().nullable(),
});
const unitRow = z.object({
  level: z.string(), id: uuid, label: z.string(), coversAnchor: z.boolean(), coversTarget: z.boolean(), edgeDistanceMeters: z.number().nullable(), rank: z.number().int(),
});
const nearestRow = z.discriminatedUnion("part", [
  // A feature's id becomes part of the reference the result carries, so it must be the canonical form PostgreSQL prints for a uuid.
  z.object({ part: z.literal("match"), id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), label: z.string(), sourceId: z.string(), distance: z.number() }),
  z.object({ part: z.literal("unrecognized"), count: z.number().int().min(0), distance: z.number().nullable() }),
]);
const countRow = z.object({ radiusMeters: z.number().positive(), count: z.number().int().nonnegative(), unrecognized: z.number().int().nonnegative() });
const datasetMeasureRow = z.object({
  valid: z.boolean(),
  nearest: z.array(z.object({ index: z.number().int().nonnegative(), id: z.string().nullable(), name: z.string().nullable(), distanceMeters: z.number().nonnegative() }).strict()),
  radii: z.array(z.object({ radiusMeters: z.number().positive(), count: z.number().int().nonnegative(), populationEstimate: z.number().nonnegative().nullable() }).strict()),
}).strict();

/** A row that is not what the contract says is a changed Map, not a bad request: the read fails closed instead of coercing it. */
function parseRows<Schema extends z.ZodType>(schema: Schema, rows: readonly unknown[]): Array<z.output<Schema>> {
  return rows.map((row) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) throw new MapReadError("SCHEMA_MISMATCH");
    return parsed.data;
  });
}

/** `3.5.2`, `3.9.0-CAPI-1.16.2`: the first word of what the backend reports, so that build paths and options in a version string never leave the adapter. */
const cleanVersion = (value: string | null): string | null => {
  const word = value?.trim().split(/\s+/, 1)[0] ?? "";
  return /^[0-9][0-9A-Za-z._+-]{0,39}$/.test(word) ? word : null;
};
const SHORT = 200;
const shorten = (text: string) => (text.length > SHORT ? `${text.slice(0, SHORT - 1)}…` : text);

/**
 * The Spatial Engine's read-only window onto the Jenan Map, over PostGIS. It opens one read-only snapshot per call, sends only the fixed
 * statements of queries.ts, and never writes, locks or changes a setting for anyone else. It holds no policy: whether a layer is
 * registered, how a result is graded and what is said about it belong to the engine.
 */
export class PostgisMapReader implements SpatialMapPort {
  private readonly session: ReadOnlySession;

  constructor(config: ReadOnlySessionConfig, pool?: SessionPool) {
    this.session = openReadOnlySession(config, pool);
  }

  async capabilities(): Promise<SpatialBackendCapabilities> {
    return this.session.run(async (query) => {
      const present = parseRows(presenceRow, await query(QUERIES.postgisPresent))[0];
      if (!present?.present) throw new MapReadError("POSTGIS_MISSING");
      const versions = parseRows(versionRow, await query(QUERIES.postgisVersions))[0];
      const columns = parseRows(catalogRow, await query(QUERIES.catalog, [MAP_SCHEMA, MAP_CONTRACT_TABLES]));
      const role = parseRows(roleRow, await query(QUERIES.role, [MAP_SCHEMA, MAP_CONTRACT_TABLES]))[0];
      const contractProblems = findMapContractProblems(columns);
      return {
        backend: "POSTGIS",
        placement: this.session.config.placement,
        readOnly: true,
        postgis: cleanVersion(versions?.postgis ?? null),
        geos: cleanVersion(versions?.geos ?? null),
        proj: cleanVersion(versions?.proj ?? null),
        mapSchemaReachable: contractProblems.length === 0 && role !== undefined && role.schemaUsage && role.canSelectAll && role.tables === MAP_CONTRACT_TABLES.length,
        // A role that cannot be described is treated as able to write.
        roleCanWrite: role === undefined || role.superuser || role.writeAll || role.canWriteSome,
        contractProblems,
      };
    });
  }

  async describeMap(request: MapDescribeRequest): Promise<MapDescription> {
    const layerIds = [...new Set(request.layers)];
    return this.session.run(async (query): Promise<MapDescription> => {
      const runtime = parseRows(runtimeRow, await query(QUERIES.runtime))[0] ?? null;
      const releaseId = request.releaseId === undefined ? runtime?.publishedReleaseId ?? null : request.releaseId;
      const none: MapDescription = { runtime, release: null, boundary: null, layers: [] };
      if (releaseId === null) return none;
      const release = parseRows(releaseRow, await query(QUERIES.release, [releaseId]))[0] ?? null;
      if (release === null) return none;
      const boundaryRaw = parseRows(boundaryRow, await query(QUERIES.boundary, [release.id]))[0] ?? null;
      const boundary = boundaryRaw === null ? null : interpretMapBoundary({
        id: boundaryRaw.id, authority: boundaryRaw.authority, source: boundaryRaw.source, coverage: boundaryRaw.coverage,
        west: boundaryRaw.west, south: boundaryRaw.south, east: boundaryRaw.east, north: boundaryRaw.north,
      });
      const rows = layerIds.length === 0 ? [] : parseRows(layerRow, await query(QUERIES.layers, [release.id, layerIds]));
      const byLayer = new Map(rows.map((row) => [row.layerId, row]));
      const layers = layerIds.map((id): MapLayerFacts => {
        const row = byLayer.get(id);
        const reviewed = boundary !== null && Object.prototype.hasOwnProperty.call(boundary.layerProvenance, id) ? (boundary.layerProvenance[id] ?? null) : null;
        const binding = row !== undefined && row.bindingEnabled !== null && row.bindingStatus !== null && row.bindingVisibility !== null
          ? { enabled: row.bindingEnabled, status: row.bindingStatus, visibility: row.bindingVisibility } : null;
        return { id, provenance: reviewed, binding, hasFeatures: row?.hasFeatures ?? false };
      });
      return { runtime, release, boundary, layers };
    });
  }

  async checkGeometries(locations: readonly SpatialLocation[]): Promise<GeometryCheck[]> {
    if (locations.length === 0) return [];
    const texts = locations.map((location) => JSON.stringify(location));
    return this.session.run(async (query) => {
      const rows = parseRows(geometryCheckRow, await query(QUERIES.geometryChecks, [texts]));
      if (rows.length !== locations.length) throw new MapReadError("UNKNOWN");
      return rows.map((row): GeometryCheck => (row.valid ? { valid: true } : { valid: false, reason: shorten(row.reason ?? "Invalid geometry") }));
    });
  }

  async locate(request: MapLocateRequest): Promise<MapLocateResult> {
    const geojson = JSON.stringify(request.location);
    const levelIds = [...new Set(request.levels)];
    return this.session.run(async (query) => {
      const covered = parseRows(coverageRow, await query(QUERIES.locateCoverage, [request.releaseId, geojson]))[0];
      if (covered === undefined) throw new MapReadError("UNKNOWN");
      const rows = levelIds.length === 0 ? [] : parseRows(unitRow, await query(QUERIES.locateUnits, [request.releaseId, geojson, levelIds, MAX_ADMIN_UNITS_PER_LEVEL + 1]));

      const levels: MapLocateResult["levels"] = Object.fromEntries(levelIds.map((level) => [level, { units: [] as MapAdminUnit[], truncated: false }]));
      for (const row of rows) {
        const bucket = Object.prototype.hasOwnProperty.call(levels, row.level) ? levels[row.level] : undefined;
        if (bucket === undefined) continue;
        if (bucket.units.length >= MAX_ADMIN_UNITS_PER_LEVEL) { bucket.truncated = true; continue; }
        bucket.units.push({
          id: row.id, label: row.label, coversAnchor: row.coversAnchor, coversTarget: row.coversTarget,
          edgeDistanceMeters: row.edgeDistanceMeters === null ? null : roundTo(row.edgeDistanceMeters, 1),
        });
      }
      return { anchor: { longitude: roundTo(covered.anchorLongitude, 7), latitude: roundTo(covered.anchorLatitude, 7) }, coverage: coverageOf(covered), levels };
    });
  }

  async nearest(request: MapNearestRequest): Promise<MapNearestResult> {
    if (!isMapTileLayer(request.layerId)) throw new RangeError(`Layer ${request.layerId} does not encode kinds in sourceId`);
    const layerId = request.layerId;
    const recognized = sourceIdPattern(layerId);
    const wanted = request.kind === null ? recognized : sourceIdPattern(layerId, request.kind);
    const geojson = JSON.stringify(request.location);

    return this.session.run(async (query): Promise<MapNearestResult> => {
      let searched = 0;
      let matches: MapNearestFeature[] = [];
      for (const ring of request.rings) {
        searched = ring;
        const rows = parseRows(nearestRow, await query(QUERIES.nearest, [request.releaseId, layerId, geojson, ring, recognized, wanted, request.limit]));
        matches = [];
        const stray = { count: 0, nearest: null as number | null };
        const addStray = (distance: number | null, count: number) => {
          stray.count += count;
          if (distance !== null && (stray.nearest === null || distance < stray.nearest)) stray.nearest = distance;
        };
        for (const row of rows) {
          if (row.part === "unrecognized") { addStray(row.distance, row.count); continue; }
          // The database matched the pattern; the parser must agree, and agree on the kind, or the feature counts as unrecognized.
          const parsed = parseMapSourceId(layerId, row.sourceId);
          if (!parsed.ok || (request.kind !== null && parsed.kind !== request.kind)) { addStray(row.distance, 1); continue; }
          matches.push({ id: row.id, label: row.label, kind: parsed.kind, sourceId: row.sourceId, distanceMeters: roundTo(row.distance, 1) });
        }
        // Past the nearest unrecognized feature nothing can be trusted, so an unrecognized feature ends the search like a full ring does.
        if (stray.count > 0 || matches.length >= request.limit) {
          return { searchedMeters: ring, ringMeters: matches.length > 0 ? ring : null, matches, unrecognized: { count: stray.count, nearestMeters: stray.nearest === null ? null : roundTo(stray.nearest, 1) } };
        }
      }
      return { searchedMeters: searched, ringMeters: matches.length > 0 ? searched : null, matches, unrecognized: { count: 0, nearestMeters: null } };
    });
  }

  async countFeatures(request: MapCountRequest): Promise<MapCountResult> {
    if (!isMapTileLayer(request.layerId)) throw new RangeError(`Layer ${request.layerId} does not encode kinds in sourceId`);
    const recognized = sourceIdPattern(request.layerId);
    const wanted = request.kind === null ? recognized : sourceIdPattern(request.layerId, request.kind);
    const geojson = JSON.stringify(request.location);
    const rows = await this.session.run(async (query) => parseRows(countRow, await query(QUERIES.countFeatures, [
      request.releaseId, request.layerId, geojson, [...request.radiiMeters], recognized, wanted,
    ])));
    if (rows.length !== request.radiiMeters.length) throw new MapReadError("UNKNOWN");
    return { radii: rows.map((row) => ({ ...row, radiusMeters: roundTo(row.radiusMeters, 1) })) };
  }

  async measureDataset(request: DatasetMeasureRequest): Promise<DatasetMeasureResult> {
    const features = JSON.stringify(request.features);
    const location = JSON.stringify(request.location);
    return this.session.run(async (query) => {
      const row = parseRows(datasetMeasureRow, await query(QUERIES.measureDataset, [
        features, location, [...request.radiiMeters], request.maxSearchMeters, request.nearestCount, request.includePopulation,
      ]))[0];
      if (row === undefined || row.nearest.length > request.nearestCount || row.radii.length !== request.radiiMeters.length) throw new MapReadError("UNKNOWN");
      return {
        valid: row.valid,
        nearest: row.nearest.map((feature) => ({ ...feature, distanceMeters: roundTo(feature.distanceMeters, 1) })),
        radii: row.radii.map((entry) => ({
          ...entry, radiusMeters: roundTo(entry.radiusMeters, 1),
          populationEstimate: entry.populationEstimate === null ? null : roundTo(entry.populationEstimate, 1),
        })),
      };
    });
  }

  close(): Promise<void> {
    return this.session.close();
  }
}

function coverageOf(row: z.output<typeof coverageRow>): MapLocateResult["coverage"] {
  if (!row.hasBoundary) return null;
  if (row.covers) return { status: "FULL", fraction: 1 };
  if (!row.intersects) return { status: "NONE", fraction: 0 };
  if (row.fraction === null) return { status: "PARTIAL", fraction: null };
  if (row.fraction >= 1) return { status: "FULL", fraction: 1 };
  if (row.fraction <= 0) return { status: "NONE", fraction: 0 };
  return { status: "PARTIAL", fraction: roundTo(row.fraction, 6) };
}
