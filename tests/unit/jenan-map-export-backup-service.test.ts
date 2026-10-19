import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/services/jenan-map/service", () => ({ audit: vi.fn(), artifacts: vi.fn(), releaseById: vi.fn(), runtime: vi.fn() }));

import { csvCell, exportFeatures, featuresToCsv, featuresToGeoJson, type ExportFeature, type ExportMeta } from "@/services/jenan-map/export-features";
import { backupFolderName, backupRoot, listBackups } from "@/services/jenan-map/backup-service";
import { csvRecords, parseCsv } from "./jenan-map-csv";

const feature = (over: Partial<ExportFeature> = {}): ExportFeature => ({
  id: "f1", label: "حي النرجس", category: "neighbourhood", layerId: "places", sourceId: "node/1", aliases: ["Narjis", "النرجس"],
  latitude: 24.8216, longitude: 46.6633, geometry: { type: "Point", coordinates: [46.6633, 24.8216] }, ...over,
});
const meta: ExportMeta = {
  releaseId: "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1", layer: "places", license: "ODbL-1.0", ownership: "OPEN_LICENSE",
  attribution: "© OpenStreetMap contributors (ODbL 1.0; https://www.openstreetmap.org/copyright)",
  source: "Protomaps basemap build (OpenStreetMap + Natural Earth) build 20261017", generatedAt: "2026-10-19T14:00:00.000Z",
};
const CSV_HEADER = "id,label,category,layer,source_id,aliases,latitude,longitude,release_id,provenance_source,provenance_license,provenance_ownership,provenance_attribution,generated_at";

describe("feature export formats", () => {
  it("writes CSV that opens correctly with Arabic text and cannot run as a spreadsheet formula", () => {
    const csv = featuresToCsv([feature(), feature({ id: "f2", label: '=HYPERLINK("http://evil")', aliases: [] }), feature({ id: "f3", label: 'a,"b"\nc' })], meta);
    expect(csv.startsWith(`\uFEFF${CSV_HEADER}\r\n`)).toBe(true);
    expect(csv).toContain("حي النرجس");
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"a,""b""\nc"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(null)).toBe("");
  });
  it("carries the release, source, licence, ownership, attribution and export time on every row", () => {
    const records = csvRecords(featuresToCsv([feature(), feature({ id: "f2" }), feature({ id: "f3", label: 'a,"b"\nc' })], meta));
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record).toMatchObject({
        release_id: meta.releaseId, provenance_source: meta.source, provenance_license: "ODbL-1.0", provenance_ownership: "OPEN_LICENSE",
        provenance_attribution: meta.attribution, generated_at: meta.generatedAt, layer: "places",
      });
    }
    // Commas, quotes and line breaks in a feature never shift the provenance cells that follow it.
    expect(records[2].label).toBe('a,"b"\nc');
  });
  it("leaves a missing attribution or source empty, never the words null or undefined", () => {
    const [record] = csvRecords(featuresToCsv([feature()], { ...meta, attribution: null, source: null, license: "Commercial agreement 2026-04", ownership: "LICENSED" }));
    expect(record).toMatchObject({ provenance_attribution: "", provenance_source: "", provenance_license: "Commercial agreement 2026-04", provenance_ownership: "LICENSED" });
  });
  it("keeps spreadsheet formula protection on the provenance cells too", () => {
    const [record] = csvRecords(featuresToCsv([feature()], { ...meta, attribution: '=HYPERLINK("http://evil")', source: "@cmd" }));
    expect(record.provenance_attribution).toBe('\'=HYPERLINK("http://evil")');
    expect(record.provenance_source).toBe("'@cmd");
  });
  it("writes a header-only file for a layer without features", () => {
    expect(parseCsv(featuresToCsv([], meta))).toEqual([CSV_HEADER.split(",")]);
  });
  it("writes GeoJSON with geometry, provenance and no invented fields", () => {
    const collection = featuresToGeoJson([feature()], { license: "ODbL-1.0" });
    expect(collection).toMatchObject({ type: "FeatureCollection", properties: { license: "ODbL-1.0" }, features: [{ type: "Feature", id: "f1", geometry: { type: "Point" }, properties: { label: "حي النرجس", layer: "places" } }] });
  });
});

describe("feature export is gated by licence", () => {
  beforeEach(() => mocks.query.mockReset());
  const release = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";

  it("refuses a layer that is not bound to the release", async () => {
    mocks.query.mockResolvedValueOnce([]);
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "csv" })).rejects.toMatchObject({ code: "LAYER_NOT_BOUND_TO_RELEASE", status: 404 });
  });
  it("refuses a layer without a redistributable licence", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: null, status: "ready" }]);
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "csv" })).rejects.toMatchObject({ code: "EXPORT_LICENSE_PERMISSION_REQUIRED", status: 403 });
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "Commercial agreement" }, status: "ready" }]);
    mocks.query.mockResolvedValueOnce([feature()]);
    const licensed = await exportFeatures({ releaseId: release, layerId: "places", format: "json" });
    expect(licensed.meta.ownership).toBe("LICENSED");
  });
  it("exports an openly licensed layer with attribution and ownership class", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "ODbL-1.0", attribution: "© OpenStreetMap contributors", source: "OSM" }, status: "ready" }]);
    mocks.query.mockResolvedValueOnce([feature(), feature({ id: "f2" })]);
    const out = await exportFeatures({ releaseId: release, layerId: "places", format: "geojson" });
    expect(out.count).toBe(2);
    expect(out.meta).toMatchObject({ license: "ODbL-1.0", ownership: "OPEN_LICENSE", attribution: "© OpenStreetMap contributors" });
    expect(JSON.parse(out.body).features).toHaveLength(2);
    expect(out.contentType).toBe("application/geo+json");
  });
  it("exports CSV with the same provenance as the other formats, on every row", async () => {
    const provenance = { license: "ODbL-1.0", attribution: "© OpenStreetMap contributors (ODbL 1.0)", source: "Protomaps basemap build 20261017" };
    const exported = async (format: "csv" | "json" | "geojson") => {
      mocks.query.mockResolvedValueOnce([{ provenance, status: "ready" }]);
      mocks.query.mockResolvedValueOnce([feature(), feature({ id: "f2" })]);
      return exportFeatures({ releaseId: release, layerId: "places", format });
    };
    const csv = await exported("csv"), json = await exported("json"), geojson = await exported("geojson");
    // Every field of the export metadata has a CSV column of its own; a field added to the metadata has to be given one here and in the CSV.
    const columnOf: Record<keyof ExportMeta, string> = {
      releaseId: "release_id", layer: "layer", source: "provenance_source", license: "provenance_license",
      ownership: "provenance_ownership", attribution: "provenance_attribution", generatedAt: "generated_at",
    };
    expect(Object.keys(csv.meta).sort()).toEqual(Object.keys(columnOf).sort());
    const records = csvRecords(csv.body);
    expect(records).toHaveLength(2);
    for (const record of records) {
      for (const [field, column] of Object.entries(columnOf)) expect(record[column], column).toBe(String(csv.meta[field as keyof ExportMeta]));
    }
    // And they are the values the JSON and GeoJSON downloads carry.
    const shared = Object.fromEntries(Object.entries(csv.meta).filter(([field]) => field !== "generatedAt"));
    expect(JSON.parse(json.body)).toMatchObject(shared);
    expect(JSON.parse(geojson.body).properties).toMatchObject(shared);
    expect(shared).toMatchObject({ license: "ODbL-1.0", ownership: "OPEN_LICENSE", attribution: provenance.attribution, source: provenance.source, releaseId: release });
  });
  it("never returns a partial file when the layer exceeds the limit", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "ODbL-1.0" }, status: "ready" }]);
    mocks.query.mockResolvedValueOnce(Array.from({ length: 100_001 }, (_, i) => feature({ id: `f${i}` })));
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "csv" })).rejects.toMatchObject({ code: "EXPORT_TOO_LARGE", status: 413 });
  });
  it("exports a layer as a GeoPackage that carries the same provenance", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "ODbL-1.0", attribution: "© OpenStreetMap contributors", source: "OSM" }, status: "ready" }]);
    const wkb = Buffer.alloc(21);
    wkb.writeUInt8(1, 0); wkb.writeUInt32LE(1, 1); wkb.writeDoubleLE(46.6633, 5); wkb.writeDoubleLE(24.8216, 13);
    mocks.query.mockResolvedValueOnce([{ id: "f1", label: "حي النرجس", category: "neighbourhood", layerId: "places", sourceId: "node/1", aliases: ["Narjis"], wkb: new Uint8Array(wkb), minX: 46.6633, minY: 24.8216, maxX: 46.6633, maxY: 24.8216 }]);
    const out = await exportFeatures({ releaseId: release, layerId: "places", format: "gpkg" });
    expect(out).toMatchObject({ contentType: "application/geopackage+sqlite3", count: 1, meta: { license: "ODbL-1.0", ownership: "OPEN_LICENSE" } });
    expect(Buffer.isBuffer(out.body)).toBe(true);
    expect(out.body.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
    expect(out.body.includes(Buffer.from("© OpenStreetMap contributors"))).toBe(true);
    expect(out.body.includes(Buffer.from("حي النرجس"))).toBe(true);
  });
  it("refuses a GeoPackage of a layer without a redistributable licence before reading any feature", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: null, status: "ready" }]);
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "gpkg" })).rejects.toMatchObject({ code: "EXPORT_LICENSE_PERMISSION_REQUIRED", status: 403 });
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("never returns a partial GeoPackage when the layer exceeds the limit", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "ODbL-1.0" }, status: "ready" }]);
    mocks.query.mockResolvedValueOnce(Array.from({ length: 100_001 }, (_, i) => ({ id: `f${i}`, label: "x", category: "c", layerId: "places", sourceId: null, aliases: null, wkb: new Uint8Array(21), minX: 0, minY: 0, maxX: 0, maxY: 0 })));
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "gpkg" })).rejects.toMatchObject({ code: "EXPORT_TOO_LARGE", status: 413 });
  });
});

describe("backup location", () => {
  it("builds a safe folder name", () => {
    expect(backupFolderName("2026.10 17/../x", release(), new Date("2026-10-18T07:08:09Z"))).toBe("jenan-map-2026.10_17_.._x-1c1b5f07-20261018T070809");
  });
  it("requires an absolute private folder outside public and outside the map storage", () => {
    const saved = { ...process.env };
    try {
      delete process.env.JENAN_MAP_BACKUP_ROOT;
      expect(() => backupRoot()).toThrow("BACKUP_ROOT_NOT_CONFIGURED");
      process.env.JENAN_MAP_BACKUP_ROOT = "relative/backups";
      expect(() => backupRoot()).toThrow("BACKUP_ROOT_NOT_CONFIGURED");
      process.env.JENAN_MAP_BACKUP_ROOT = `${process.cwd()}/public/backups`;
      expect(() => backupRoot()).toThrow("PRIVATE_BACKUP_ROOT_REQUIRED");
      process.env.JENAN_MAP_STORAGE_ROOT = "/srv/map-storage";
      process.env.JENAN_MAP_BACKUP_ROOT = "/srv/map-storage/backups";
      expect(() => backupRoot()).toThrow("PRIVATE_BACKUP_ROOT_REQUIRED");
      process.env.JENAN_MAP_BACKUP_ROOT = "/srv/map-backups";
      expect(backupRoot()).toMatch(/map-backups$/);
    } finally { process.env = saved; }
  });
  it("reports an unconfigured backup folder as a state, not a server error, and lists real backups newest first", async () => {
    const saved = { ...process.env };
    const dir = await mkdtemp(path.join(os.tmpdir(), "jenan-backups-"));
    try {
      delete process.env.JENAN_MAP_BACKUP_ROOT;
      await expect(listBackups()).resolves.toEqual({ configured: false, backups: [] });
      process.env.JENAN_MAP_BACKUP_ROOT = dir;
      await mkdir(path.join(dir, "older")); await mkdir(path.join(dir, "newer")); await mkdir(path.join(dir, "half.partial"));
      // The staging folder of a backup in progress (or of one that was interrupted) is never offered as a backup.
      await mkdir(path.join(dir, "newer.0a1b2c3d4e5f.partial"));
      await writeFile(path.join(dir, "stray.txt"), "x");
      await utimes(path.join(dir, "older"), new Date("2026-10-01T00:00:00Z"), new Date("2026-10-01T00:00:00Z"));
      await utimes(path.join(dir, "newer"), new Date("2026-10-02T00:00:00Z"), new Date("2026-10-02T00:00:00Z"));
      const listed = await listBackups();
      expect(listed.configured).toBe(true);
      expect(listed.backups.map((item) => item.folder)).toEqual(["newer", "older"]);
      process.env.JENAN_MAP_BACKUP_ROOT = `${process.cwd()}/public/backups`;
      await expect(listBackups()).rejects.toMatchObject({ code: "PRIVATE_BACKUP_ROOT_REQUIRED", status: 503 });
    } finally { process.env = saved; await rm(dir, { recursive: true, force: true }); }
  });
});
function release() { return "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1"; }
