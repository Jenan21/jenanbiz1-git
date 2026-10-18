import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/services/jenan-map/service", () => ({ audit: vi.fn(), artifacts: vi.fn(), releaseById: vi.fn(), runtime: vi.fn() }));

import { csvCell, exportFeatures, featuresToCsv, featuresToGeoJson, type ExportFeature } from "@/services/jenan-map/export-features";
import { backupFolderName, backupRoot } from "@/services/jenan-map/backup-service";

const feature = (over: Partial<ExportFeature> = {}): ExportFeature => ({
  id: "f1", label: "حي النرجس", category: "neighbourhood", layerId: "places", sourceId: "node/1", aliases: ["Narjis", "النرجس"],
  latitude: 24.8216, longitude: 46.6633, geometry: { type: "Point", coordinates: [46.6633, 24.8216] }, ...over,
});

describe("feature export formats", () => {
  it("writes CSV that opens correctly with Arabic text and cannot run as a spreadsheet formula", () => {
    const csv = featuresToCsv([feature(), feature({ id: "f2", label: '=HYPERLINK("http://evil")', aliases: [] }), feature({ id: "f3", label: 'a,"b"\nc' })]);
    expect(csv.startsWith("\uFEFFid,label,category,layer,source_id,aliases,latitude,longitude\r\n")).toBe(true);
    expect(csv).toContain("حي النرجس");
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"a,""b""\nc"');
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell(null)).toBe("");
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
  it("never returns a partial file when the layer exceeds the limit", async () => {
    mocks.query.mockResolvedValueOnce([{ provenance: { license: "ODbL-1.0" }, status: "ready" }]);
    mocks.query.mockResolvedValueOnce(Array.from({ length: 100_001 }, (_, i) => feature({ id: `f${i}` })));
    await expect(exportFeatures({ releaseId: release, layerId: "places", format: "csv" })).rejects.toMatchObject({ code: "EXPORT_TOO_LARGE", status: 413 });
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
});
function release() { return "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1"; }
