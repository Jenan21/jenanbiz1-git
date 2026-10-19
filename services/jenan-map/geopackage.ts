import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { MapError } from "./contracts";
import { scratchDirectory } from "./storage";

/**
 * GeoPackage 1.3 (OGC 12-128r18) export of one layer: a single SQLite file that opens in QGIS, ArcGIS and GDAL/OGR. It carries the
 * features, their WGS 84 geometry and the layer's provenance (licence, attribution, source) so the data never travels without them.
 */
export const GEOPACKAGE_CONTENT_TYPE = "application/geopackage+sqlite3";
const APPLICATION_ID = 0x47504b47; // "GPKG"
const USER_VERSION = 10300; // GeoPackage 1.3.0
export const WGS84_SRS_ID = 4326;
const WGS84_DEFINITION = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.01745329251994328,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';
const METADATA_EXTENSION_URI = "https://www.geopackage.org/spec121/#extension_metadata";

export type GeoPackageFeature = {
  id: string; label: string; category: string; layerId: string | null; sourceId: string | null; aliases: string[];
  wkb: Uint8Array; minX: number; minY: number; maxX: number; maxY: number;
};

export type GeoPackageMeta = {
  releaseId: string; layerId: string; license: string; ownership: string;
  attribution: string | null; source: string | null; generatedAt: string;
};

/** GeoPackageBinary: "GP", version 0, flags (little endian, XY envelope), SRS id, envelope, then the standard WKB. */
export function geoPackageGeometry(feature: Pick<GeoPackageFeature, "wkb" | "minX" | "minY" | "maxX" | "maxY">, srsId = WGS84_SRS_ID) {
  const header = Buffer.alloc(40);
  header.write("GP", 0, "ascii");
  header[2] = 0;
  header[3] = 0b0000_0011;
  header.writeInt32LE(srsId, 4);
  header.writeDoubleLE(feature.minX, 8);
  header.writeDoubleLE(feature.maxX, 16);
  header.writeDoubleLE(feature.minY, 24);
  header.writeDoubleLE(feature.maxY, 32);
  return Buffer.concat([header, feature.wkb]);
}

const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** A layer id such as `real-estate` becomes a plain SQL identifier; anything that cannot is refused rather than quoted around. */
export function geoPackageTableName(layerId: string) {
  const name = layerId.replaceAll("-", "_");
  if (!TABLE_NAME.test(name) || name.startsWith("gpkg_") || name.startsWith("sqlite_")) throw new MapError("INVALID_EXPORT_LAYER", 400);
  return name;
}

type Database = import("node:sqlite").DatabaseSync;

const SCHEMA = `
  CREATE TABLE gpkg_spatial_ref_sys (
    srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL,
    organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT
  );
  CREATE TABLE gpkg_contents (
    table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
    last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
    CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
  );
  CREATE TABLE gpkg_geometry_columns (
    table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL,
    CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name),
    CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
    CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id)
  );
  CREATE TABLE gpkg_extensions (
    table_name TEXT, column_name TEXT, extension_name TEXT NOT NULL, definition TEXT NOT NULL, scope TEXT NOT NULL,
    CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name)
  );
  CREATE TABLE gpkg_metadata (
    id INTEGER CONSTRAINT m_pk PRIMARY KEY ASC NOT NULL, md_scope TEXT NOT NULL DEFAULT 'dataset',
    md_standard_uri TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'text/xml', metadata TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE gpkg_metadata_reference (
    reference_scope TEXT NOT NULL, table_name TEXT, column_name TEXT, row_id_value INTEGER,
    timestamp DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), md_file_id INTEGER NOT NULL, md_parent_id INTEGER,
    CONSTRAINT crmr_mfi_fk FOREIGN KEY (md_file_id) REFERENCES gpkg_metadata(id),
    CONSTRAINT crmr_mpi_fk FOREIGN KEY (md_parent_id) REFERENCES gpkg_metadata(id)
  );`;

function writeGeoPackage(db: Database, features: GeoPackageFeature[], meta: GeoPackageMeta) {
  const table = geoPackageTableName(meta.layerId);
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = ${USER_VERSION}; PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;`);
  db.exec(SCHEMA);
  const insertSrs = db.prepare("INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)");
  insertSrs.run("Undefined Cartesian SRS", -1, "NONE", -1, "undefined", "undefined Cartesian coordinate reference system");
  insertSrs.run("Undefined geographic SRS", 0, "NONE", 0, "undefined", "undefined geographic coordinate reference system");
  insertSrs.run("WGS 84 geodetic", WGS84_SRS_ID, "EPSG", WGS84_SRS_ID, WGS84_DEFINITION, "longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid");

  db.exec(`CREATE TABLE ${table} (
    fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom GEOMETRY, id TEXT NOT NULL, label TEXT, category TEXT, layer TEXT, source_id TEXT, aliases TEXT
  )`);
  const insert = db.prepare(`INSERT INTO ${table} (geom, id, label, category, layer, source_id, aliases) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  db.exec("BEGIN");
  try {
    for (const feature of features) {
      insert.run(geoPackageGeometry(feature), feature.id, feature.label, feature.category, feature.layerId, feature.sourceId, feature.aliases.join("; "));
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  let extent: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  // A loop, not Math.min(...all): a layer may hold 100,000 features, more arguments than a call can take.
  for (const f of features) {
    extent = extent
      ? { minX: Math.min(extent.minX, f.minX), minY: Math.min(extent.minY, f.minY), maxX: Math.max(extent.maxX, f.maxX), maxY: Math.max(extent.maxY, f.maxY) }
      : { minX: f.minX, minY: f.minY, maxX: f.maxX, maxY: f.maxY };
  }
  const description = [`License: ${meta.license}`, `Ownership: ${meta.ownership}`, meta.attribution && `Attribution: ${meta.attribution}`, meta.source && `Source: ${meta.source}`]
    .filter(Boolean).join(" | ");
  db.prepare("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) VALUES (?, 'features', ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(table, meta.layerId, description, meta.generatedAt, extent?.minX ?? null, extent?.minY ?? null, extent?.maxX ?? null, extent?.maxY ?? null, WGS84_SRS_ID);
  db.prepare("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'GEOMETRY', ?, 0, 0)").run(table, WGS84_SRS_ID);

  db.prepare("INSERT INTO gpkg_extensions VALUES ('gpkg_metadata', NULL, 'gpkg_metadata', ?, 'read-write')").run(METADATA_EXTENSION_URI);
  db.prepare("INSERT INTO gpkg_extensions VALUES ('gpkg_metadata_reference', NULL, 'gpkg_metadata', ?, 'read-write')").run(METADATA_EXTENSION_URI);
  const provenance = JSON.stringify({ producer: "Jenan PRO Map", ...meta, features: features.length });
  db.prepare("INSERT INTO gpkg_metadata (id, md_scope, md_standard_uri, mime_type, metadata) VALUES (1, 'dataset', ?, 'application/json', ?)")
    .run("https://jenan.pro/map/provenance", provenance);
  db.prepare("INSERT INTO gpkg_metadata_reference (reference_scope, md_file_id, timestamp) VALUES ('geopackage', 1, ?)").run(meta.generatedAt);
}

/** Builds the GeoPackage in private scratch space (SQLite needs a file) and returns its bytes; the file never outlives the call. */
export async function buildGeoPackage(features: GeoPackageFeature[], meta: GeoPackageMeta): Promise<Buffer> {
  // `node:sqlite` is a runtime built-in of the Node version this application requires. Taking it from the process (not an import) keeps
  // it out of the bundler, which would otherwise have to know about a built-in that only exists under the `node:` scheme.
  const sqlite = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqlite) throw new MapError("GEOPACKAGE_EXPORT_UNAVAILABLE", 503);
  const directory = await mkdtemp(path.join(await scratchDirectory(), "gpkg-"));
  try {
    const file = path.join(directory, "layer.gpkg");
    const db = new sqlite.DatabaseSync(file);
    try { writeGeoPackage(db, features, meta); } finally { db.close(); }
    return await readFile(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
