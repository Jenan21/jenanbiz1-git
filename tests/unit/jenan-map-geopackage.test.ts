import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGeoPackage, geoPackageGeometry, geoPackageTableName, GEOPACKAGE_CONTENT_TYPE, type GeoPackageFeature } from "@/services/jenan-map/geopackage";

const point = (x: number, y: number) => {
  const wkb = Buffer.alloc(21);
  wkb.writeUInt8(1, 0); wkb.writeUInt32LE(1, 1); wkb.writeDoubleLE(x, 5); wkb.writeDoubleLE(y, 13);
  return wkb;
};
const line = (coordinates: Array<[number, number]>) => {
  const wkb = Buffer.alloc(9 + coordinates.length * 16);
  wkb.writeUInt8(1, 0); wkb.writeUInt32LE(2, 1); wkb.writeUInt32LE(coordinates.length, 5);
  coordinates.forEach(([x, y], i) => { wkb.writeDoubleLE(x, 9 + i * 16); wkb.writeDoubleLE(y, 17 + i * 16); });
  return wkb;
};

const features: GeoPackageFeature[] = [
  { id: "f1", label: "حي النرجس", category: "neighbourhood", layerId: "places", sourceId: "node/1", aliases: ["Narjis", "النرجس"], wkb: point(46.6633, 24.8216), minX: 46.6633, minY: 24.8216, maxX: 46.6633, maxY: 24.8216 },
  { id: "f2", label: "طريق الملك فهد", category: "primary", layerId: "places", sourceId: null, aliases: [], wkb: line([[46.67, 24.7], [46.68, 24.75]]), minX: 46.67, minY: 24.7, maxX: 46.68, maxY: 24.75 },
];
const meta = {
  releaseId: "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1", layerId: "real-estate", license: "ODbL-1.0", ownership: "OPEN_LICENSE",
  attribution: "© OpenStreetMap contributors", source: "OpenStreetMap", generatedAt: "2026-10-18T10:00:00.000Z",
};

type Row = Record<string, unknown>;
async function inspect<T>(bytes: Buffer, read: (query: (sql: string) => Row[]) => T): Promise<T> {
  const { DatabaseSync } = await import("node:sqlite");
  const directory = await mkdtemp(path.join(os.tmpdir(), "gpkg-test-"));
  const file = path.join(directory, "read.gpkg");
  try {
    await writeFile(file, bytes);
    const db = new DatabaseSync(file, { readOnly: true });
    try { return read((sql) => db.prepare(sql).all() as Row[]); } finally { db.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}

describe("GeoPackage export", () => {
  it("is declared with the registered GeoPackage media type", () => {
    expect(GEOPACKAGE_CONTENT_TYPE).toBe("application/geopackage+sqlite3");
  });

  it("wraps standard WKB in a GeoPackageBinary header with an XY envelope", () => {
    const blob = geoPackageGeometry(features[1]);
    expect(blob.subarray(0, 2).toString("ascii")).toBe("GP");
    expect(blob[2]).toBe(0);
    expect(blob[3]).toBe(0b11);
    expect(blob.readInt32LE(4)).toBe(4326);
    expect([8, 16, 24, 32].map((offset) => blob.readDoubleLE(offset))).toEqual([46.67, 46.68, 24.7, 24.75]);
    expect(blob.subarray(40).equals(features[1].wkb as Buffer)).toBe(true);
  });

  it("turns a layer id into a plain SQL identifier and refuses anything else", () => {
    expect(geoPackageTableName("real-estate")).toBe("real_estate");
    expect(geoPackageTableName("places")).toBe("places");
    for (const bad of ["1places", "Places", 'places"; DROP TABLE x', "gpkg_contents", "sqlite_master", "", "a".repeat(64)]) {
      expect(() => geoPackageTableName(bad), bad).toThrow(expect.objectContaining({ code: "INVALID_EXPORT_LAYER", status: 400 }));
    }
  });

  it("writes a structurally valid GeoPackage 1.3 with the features, their geometry and the provenance", async () => {
    const bytes = await buildGeoPackage(features, meta);
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
    await inspect(bytes, (query) => {
      expect(query("PRAGMA application_id")).toEqual([{ application_id: 0x47504b47 }]);
      expect(query("PRAGMA user_version")).toEqual([{ user_version: 10300 }]);
      expect(query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(query("PRAGMA foreign_key_check")).toEqual([]);
      expect(query("SELECT srs_id, organization FROM gpkg_spatial_ref_sys ORDER BY srs_id")).toEqual([
        { srs_id: -1, organization: "NONE" }, { srs_id: 0, organization: "NONE" }, { srs_id: 4326, organization: "EPSG" },
      ]);
      const [contents] = query("SELECT * FROM gpkg_contents");
      expect(contents).toMatchObject({ table_name: "real_estate", data_type: "features", identifier: "real-estate", srs_id: 4326, last_change: meta.generatedAt, min_x: 46.6633, min_y: 24.7, max_x: 46.68, max_y: 24.8216 });
      expect(contents.description).toBe("License: ODbL-1.0 | Ownership: OPEN_LICENSE | Attribution: © OpenStreetMap contributors | Source: OpenStreetMap");
      expect(query("SELECT * FROM gpkg_geometry_columns")).toEqual([{ table_name: "real_estate", column_name: "geom", geometry_type_name: "GEOMETRY", srs_id: 4326, z: 0, m: 0 }]);
      const rows = query("SELECT fid, geom, id, label, category, layer, source_id, aliases FROM real_estate ORDER BY fid");
      expect(rows.map((row) => [row.fid, row.id, row.label, row.category, row.layer, row.source_id, row.aliases])).toEqual([
        [1, "f1", "حي النرجس", "neighbourhood", "places", "node/1", "Narjis; النرجس"],
        [2, "f2", "طريق الملك فهد", "primary", "places", null, ""],
      ]);
      expect(Buffer.from(rows[0].geom as Uint8Array).equals(geoPackageGeometry(features[0]))).toBe(true);
      const [metadata] = query("SELECT md_scope, mime_type, metadata FROM gpkg_metadata");
      expect(metadata).toMatchObject({ md_scope: "dataset", mime_type: "application/json" });
      expect(JSON.parse(String(metadata.metadata))).toMatchObject({ producer: "Jenan PRO Map", layerId: "real-estate", license: "ODbL-1.0", ownership: "OPEN_LICENSE", features: 2 });
      expect(query("SELECT table_name, extension_name FROM gpkg_extensions ORDER BY table_name")).toEqual([
        { table_name: "gpkg_metadata", extension_name: "gpkg_metadata" }, { table_name: "gpkg_metadata_reference", extension_name: "gpkg_metadata" },
      ]);
    });
  });

  it("writes a valid empty layer with no extent instead of inventing one", async () => {
    const bytes = await buildGeoPackage([], meta);
    await inspect(bytes, (query) => {
      expect(query("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
      expect(query("SELECT min_x, min_y, max_x, max_y FROM gpkg_contents")).toEqual([{ min_x: null, min_y: null, max_x: null, max_y: null }]);
      expect(query("SELECT count(*) AS n FROM real_estate")).toEqual([{ n: 0 }]);
    });
  });

  it("refuses an unsafe layer id before touching any file", async () => {
    await expect(buildGeoPackage(features, { ...meta, layerId: 'x"; DROP TABLE gpkg_contents; --' })).rejects.toMatchObject({ code: "INVALID_EXPORT_LAYER" });
  });

  it("handles a layer at the export limit without overflowing the call stack", async () => {
    const many = Array.from({ length: 100_000 }, (_, i): GeoPackageFeature => ({
      id: `f${i}`, label: `n${i}`, category: "c", layerId: "places", sourceId: null, aliases: [], wkb: point(40 + (i % 1000) / 100, 20 + Math.floor(i / 1000) / 10),
      minX: 40 + (i % 1000) / 100, minY: 20 + Math.floor(i / 1000) / 10, maxX: 40 + (i % 1000) / 100, maxY: 20 + Math.floor(i / 1000) / 10,
    }));
    const bytes = await buildGeoPackage(many, { ...meta, layerId: "places" });
    await inspect(bytes, (query) => {
      expect(query("SELECT count(*) AS n FROM places")).toEqual([{ n: 100_000 }]);
      expect(query("SELECT min_x, max_x FROM gpkg_contents")).toEqual([{ min_x: 40, max_x: 49.99 }]);
    });
  }, 60_000);
});
