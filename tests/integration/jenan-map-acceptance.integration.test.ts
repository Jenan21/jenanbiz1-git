import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import type { MapCommand } from "@/services/jenan-map/contracts";
import { createRealRelease, realArchive, type RealArchive } from "./support/real-saudi-release";
import { csvRecords } from "../unit/jenan-map-csv";

// ACCEPTANCE on REAL data (no fixtures): the real Saudi PMTiles, real OSM-derived places/streets/POIs, real geoBoundaries, real glyphs and
// the real Jenan style. Opt-in: needs the files from `npm run jenan-map:saudi-pmtiles|glyphs` and prepare-saudi-import, and a disposable PostGIS.
//   RUN_JENAN_MAP_ACCEPTANCE=1 JENAN_MAP_ACCEPTANCE_STAGE=.jenan-map-data/stage DATABASE_URL=postgresql://.../jenan_map_test
const enabled = process.env.RUN_JENAN_MAP_ACCEPTANCE === "1";
// Also runnable against a real S3-compatible store (JENAN_MAP_STORAGE_DRIVER=s3 and the JENAN_MAP_S3_* settings): then no artifact may touch local disk.
const sharedStorage = process.env.JENAN_MAP_STORAGE_DRIVER === "s3";
const root = path.resolve(`work/map-acceptance-${randomUUID()}`);
const staging = path.join(root, "staging"), storage = path.join(root, "storage");
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let service: typeof import("@/services/jenan-map/service");
let backupService: typeof import("@/services/jenan-map/backup-service");
let restore: typeof import("@/services/jenan-map/restore");
let database: typeof import("@/lib/db");
let adminId: string, userId: string;
const saved = new Map<string, string | undefined>();
const releases: { a?: string; b?: string } = {};

// The admin route verifies the stored archives before a command's transaction opens; the suite does the same, so a slow object store
// cannot make an approval outlive its transaction.
const execute = async (input: MapCommand) => service.command(input, adminId, await service.preverifyCommand(input));

const newRelease = (label: string, archive: RealArchive) => createRealRelease({ label, archive, actor: adminId, staging });

describe.skipIf(!enabled)("Jenan PRO Map acceptance on real Saudi data", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/jenan_map_test") throw new Error("Disposable loopback jenan_map_test only");
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await mkdir(storage, { mode: 0o700 });
    database = await import("@/lib/db");
    service = await import("@/services/jenan-map/service");
    backupService = await import("@/services/jenan-map/backup-service");
    restore = await import("@/services/jenan-map/restore");
    adminId = (await database.db.user.create({ data: { email: `acc-admin-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "ADMIN" } })).id;
    userId = (await database.db.user.create({ data: { email: `acc-user-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "USER" } })).id;
    for (const [key, value] of Object.entries({ JENAN_MAP_BUILD_ACTOR: adminId, JENAN_MAP_STAGING_ROOT: staging, JENAN_MAP_STORAGE_ROOT: storage })) {
      saved.set(key, process.env[key]); process.env[key] = value;
    }
    if (sharedStorage) {
      // Each run keeps its objects under its own prefix so repeated runs never meet each other's artifacts.
      saved.set("JENAN_MAP_S3_PREFIX", process.env.JENAN_MAP_S3_PREFIX);
      process.env.JENAN_MAP_S3_PREFIX = `acceptance-${randomUUID().slice(0, 8)}/`;
    }
  });
  afterAll(async () => {
    for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await database?.db.$disconnect();
    await pool?.end();
    await rm(root, { recursive: true, force: true });
  });

  it("imports version A (z12) from real data, validates it, approves and publishes it", async () => {
    releases.a = await newRelease("versionA", await realArchive("saudi-z12"));
    expect((await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [releases.a])).rows[0].status).toBe("Ready");
    const counts = (await pool!.query(`SELECT "layerId", count(*)::int AS n FROM jenan_map.feature WHERE "releaseId"=$1 GROUP BY 1 ORDER BY 1`, [releases.a])).rows;
    expect(Object.fromEntries(counts.map((r) => [r.layerId, r.n]))).toMatchObject({ governorates: expect.any(Number), pois: expect.any(Number), places: expect.any(Number), regions: expect.any(Number), roads: expect.any(Number) });
    await execute({ action: "approve", releaseId: releases.a, confirmation: "APPROVE", reason: "Acceptance: real Saudi data version A reviewed" });
    const state = await service.runtime();
    await execute({ action: "publish", releaseId: releases.a, expectedRevision: state.revision, expectedPublishedReleaseId: state.publishedReleaseId, confirmation: "PUBLISH", reason: "Acceptance publish A" });
    const published = await service.runtime();
    await execute({ action: "runtime", status: "enabled", expectedRevision: published.revision, expectedPublishedReleaseId: releases.a, confirmation: "CHANGE RUNTIME", reason: "Acceptance enable" });
    expect((await service.runtime())).toMatchObject({ status: "enabled", publishedReleaseId: releases.a });
  }, 900_000);

  it("finds real Saudi names in Arabic and English: city, district, street and POI", async () => {
    const find = async (q: string, layerIds?: string[]) => (await service.search({ q, radiusMeters: 10_000, ...(layerIds ? { layerIds } : {}) })).results as Array<{ label: string; category: string; latitude: number; longitude: number }>;
    const riyadh = await find("الرياض");
    expect(riyadh.length).toBeGreaterThan(0);
    // 154 features share this name's rank (125 roads, 23 POIs, 6 places) and equal ranks are ordered by their ids, which are drawn at random for every
    // build: an unrestricted search is not guaranteed to show a place among its 20 results (it did not in about 4 builds in 10). The city is asked of
    // the places layer, as the picker does for the layer it is switched to. The other names below have fewer than 20 matches or only one category.
    expect((await find("الرياض", ["places"])).some((r) => r.category === "places")).toBe(true);
    expect((await find("النرجس")).some((r) => r.category === "places")).toBe(true);
    expect((await find("طريق الملك فهد")).some((r) => r.category === "roads")).toBe(true);
    expect((await find("مستشفى")).some((r) => r.category === "pois")).toBe(true);
    expect((await find("Riyadh")).length).toBeGreaterThan(0);
    expect((await find("Jeddah")).length + (await find("جدة")).length).toBeGreaterThan(0);
    for (const hit of await find("الرياض")) {
      expect(hit.latitude).toBeGreaterThan(15);
      expect(hit.longitude).toBeGreaterThan(34);
    }
  });

  it("validates locations: inside Saudi Arabia passes, outside is refused", async () => {
    const releaseId = releases.a!;
    await expect(service.validateLocation(24.7136, 46.6753, releaseId)).resolves.toBeTruthy();
    await expect(service.validateLocation(30.0444, 31.2357, releaseId)).rejects.toMatchObject({ code: "OUTSIDE_SAUDI_ARABIA" });
    await expect(service.validateLocation(25.2048, 55.2708, releaseId)).rejects.toMatchObject({ code: "OUTSIDE_SAUDI_ARABIA" });
  });

  it("saves, closes and reopens the same location with real region, city, district and address", async () => {
    const releaseId = releases.a!;
    const saved1 = await service.saveLocation({ latitude: 24.8216, longitude: 46.6633, releaseId, source: "geolocation" }, userId);
    expect(saved1).toMatchObject({ country: "SA", source: "geolocation", releaseId });
    expect(saved1.region).toBeTruthy();
    expect(saved1.city).toBeTruthy();
    const reopened = await service.savedLocation(userId);
    expect(reopened).toMatchObject({ latitude: 24.8216, longitude: 46.6633, source: "geolocation", region: saved1.region, city: saved1.city, district: saved1.district, formattedAddress: saved1.formattedAddress });
    expect(new Date(reopened!.selectedAt).getTime()).toBeLessThanOrEqual(Date.now());
    await expect(service.saveLocation({ latitude: 30.0444, longitude: 31.2357, releaseId, source: "map" }, userId)).rejects.toMatchObject({ code: "OUTSIDE_SAUDI_ARABIA" });
    expect((await service.savedLocation(userId))!.latitude).toBe(24.8216);
  });

  it("returns more places as the analysis radius grows: 500 m, 1 km, 3 km, 5 km (PostGIS geography metres)", async () => {
    const around = async (radiusMeters: number) => ((await service.search({ q: "مستشفى", latitude: 24.7136, longitude: 46.6753, radiusMeters, layerIds: ["pois"] })).results as unknown[]).length;
    const counts = [await around(500), await around(1000), await around(3000), await around(5000)];
    expect(counts[0]).toBeLessThanOrEqual(counts[1]);
    expect(counts[1]).toBeLessThanOrEqual(counts[2]);
    expect(counts[2]).toBeLessThanOrEqual(counts[3]);
    expect(counts[3]).toBeGreaterThan(0);
    const exact = await pool!.query(`SELECT count(*)::int AS n FROM jenan_map.feature f WHERE f."releaseId"=$1 AND f."layerId"='pois' AND f.search @@ plainto_tsquery('simple','مستشفى')
      AND ST_DWithin(f.geometry::geography, ST_SetSRID(ST_MakePoint(46.6753,24.7136),4326)::geography, 5000)`, [releases.a]);
    expect(Math.min(counts[3], 20)).toBe(Math.min(exact.rows[0].n, 20));
  });

  it("exports a real layer as GeoJSON, CSV and GeoPackage: the same features, geometry and licence in each", async () => {
    const { exportFeatures } = await import("@/services/jenan-map/export-features");
    const releaseId = releases.a!;
    const inDatabase = Number((await pool!.query(`SELECT count(*) AS n FROM jenan_map.feature WHERE "releaseId"=$1 AND "layerId"='places'`, [releaseId])).rows[0].n);
    expect(inDatabase).toBeGreaterThan(10_000);
    const geojson = await exportFeatures({ releaseId, layerId: "places", format: "geojson" });
    const csv = await exportFeatures({ releaseId, layerId: "places", format: "csv" });
    const gpkg = await exportFeatures({ releaseId, layerId: "places", format: "gpkg" });
    expect(JSON.parse(geojson.body).features).toHaveLength(inDatabase);
    expect(csv.body.split("\r\n").filter(Boolean)).toHaveLength(inDatabase + 1);
    expect(gpkg).toMatchObject({ count: inDatabase, meta: { license: "ODbL-1.0", ownership: "OPEN_LICENSE" } });

    // The source, licence and attribution travel with the data in every format: in the CSV they are columns of every row.
    const rows = csvRecords(csv.body);
    expect(rows).toHaveLength(inDatabase);
    const provenance = (row: Record<string, string>) => [row.release_id, row.provenance_source, row.provenance_license, row.provenance_ownership, row.provenance_attribution].join("|");
    expect(new Set(rows.map(provenance)).size, "one provenance for the whole layer").toBe(1);
    expect(rows[0]).toMatchObject({ release_id: releaseId, provenance_license: "ODbL-1.0", provenance_ownership: "OPEN_LICENSE" });
    expect(rows[0].provenance_attribution).toContain("OpenStreetMap contributors");
    expect(rows[0].provenance_source).not.toBe("");
    const header = JSON.parse(geojson.body).properties;
    expect(header).toMatchObject({ license: rows[0].provenance_license, ownership: rows[0].provenance_ownership, attribution: rows[0].provenance_attribution, source: rows[0].provenance_source, releaseId });
    expect(gpkg.meta).toMatchObject({ license: rows[0].provenance_license, attribution: rows[0].provenance_attribution, source: rows[0].provenance_source });

    // Read the GeoPackage back with SQLite, and compare one feature's geometry with the bytes PostGIS itself produces.
    const { DatabaseSync } = await import("node:sqlite");
    const file = path.join(root, "places.gpkg");
    await writeFile(file, gpkg.body);
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      expect(db.prepare("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
      expect(db.prepare("SELECT count(*) AS n FROM places").get()).toEqual({ n: inDatabase });
      const contents = db.prepare("SELECT description, min_x, min_y, max_x, max_y FROM gpkg_contents").get() as Record<string, number | string>;
      expect(contents.description).toContain("ODbL-1.0");
      expect(contents).toMatchObject({ min_x: expect.any(Number) });
      expect(Number(contents.min_x)).toBeGreaterThan(34);
      expect(Number(contents.max_x)).toBeLessThan(56);
      expect(Number(contents.min_y)).toBeGreaterThan(15);
      expect(Number(contents.max_y)).toBeLessThan(33);
      expect((db.prepare("SELECT count(*) AS n FROM places WHERE label GLOB '*[ء-ي]*'").get() as { n: number }).n).toBeGreaterThan(inDatabase / 2);
      const [sample] = (await pool!.query(`SELECT id, encode(ST_AsBinary(geometry), 'hex') AS wkb FROM jenan_map.feature WHERE "releaseId"=$1 AND "layerId"='places' ORDER BY id LIMIT 1`, [releaseId])).rows;
      const stored = db.prepare("SELECT hex(substr(geom, 41)) AS wkb FROM places WHERE id = ?").get(sample.id) as { wkb: string };
      expect(stored.wkb.toLowerCase()).toBe(sample.wkb);
    } finally { db.close(); }
  }, 300_000);

  it("previews version B (z15) without touching customers, then publishes it atomically", async () => {
    releases.b = await newRelease("versionB", await realArchive("saudi"));
    const before = await service.runtime();
    const preview = await service.previewManifest(releases.b) as { release: { id: string } };
    expect(preview.release.id).toBe(releases.b);
    expect((await service.runtime()).publishedReleaseId).toBe(releases.a);
    expect((await service.manifest() as { release: { id: string } }).release.id).toBe(releases.a);
    await execute({ action: "approve", releaseId: releases.b, confirmation: "APPROVE", reason: "Acceptance: real Saudi data version B reviewed" });
    await execute({ action: "publish", releaseId: releases.b, expectedRevision: before.revision, expectedPublishedReleaseId: releases.a!, confirmation: "PUBLISH", reason: "Acceptance publish B" });
    expect((await service.runtime()).publishedReleaseId).toBe(releases.b);
    expect((await pool!.query(`SELECT id,status FROM jenan_map.release WHERE id = ANY($1) ORDER BY status`, [[releases.a, releases.b]])).rows.map((r) => r.status).sort()).toEqual(["Archived", "Published"]);
  }, 1_200_000);

  it("rolls back to version A after confirmation, keeping both versions and the audit trail", async () => {
    const state = await service.runtime();
    await execute({ action: "rollback", releaseId: releases.a!, expectedRevision: state.revision, expectedPublishedReleaseId: releases.b!, confirmation: "ROLLBACK", reason: "Acceptance rollback to A" });
    expect((await service.runtime()).publishedReleaseId).toBe(releases.a);
    const rows = (await pool!.query(`SELECT id,status FROM jenan_map.release WHERE id = ANY($1)`, [[releases.a, releases.b]])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === releases.b)!.status).toBe("Archived");
    const audit = (await pool!.query(`SELECT action FROM jenan_map.audit WHERE "releaseId" = ANY($1) ORDER BY "createdAt"`, [[releases.a, releases.b]])).rows.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["create", "approve", "publish", "rollback", "build.ready"]));
    // The saved location still opens after the rollback because it is stored independently of the release choice.
    expect((await service.savedLocation(userId))).toMatchObject({ latitude: 24.8216, longitude: 46.6633 });
    // Rolling back verifies the release's stored archives in full, which on shared storage takes far longer than a default test timeout.
  }, 600_000);

  it("backs up the published version, restores it as a NEW candidate and approves it without touching production", async () => {
    const backups = path.join(root, "backups");
    await mkdir(backups, { recursive: true, mode: 0o700 });
    saved.set("JENAN_MAP_BACKUP_ROOT", process.env.JENAN_MAP_BACKUP_ROOT);
    process.env.JENAN_MAP_BACKUP_ROOT = backups;
    const before = await service.runtime();
    const made = await backupService.createFullBackup(releases.a!, adminId);
    expect(made.artifacts).toBeGreaterThan(20);
    expect(await backupService.validateBackupFolder(made.folder, adminId)).toMatchObject({ ok: true, problems: [] });

    const restored = await restore.restoreBackupAsCandidate(made.folder, adminId);
    expect(restored).toMatchObject({ status: "Ready", reviewRequired: true });
    expect(restored.releaseId).not.toBe(releases.a);
    expect(await service.runtime()).toEqual(before);

    const perLayer = async (id: string) => Object.fromEntries((await pool!.query(`SELECT "layerId", count(*)::int AS n FROM jenan_map.feature WHERE "releaseId"=$1 GROUP BY 1`, [id])).rows.map((r) => [r.layerId, r.n]));
    expect(await perLayer(restored.releaseId)).toEqual(await perLayer(releases.a!));
    const bindings = async (id: string) => (await pool!.query(`SELECT "layerId","styleLayerIds","searchCategories",visibility FROM jenan_map.release_layer WHERE "releaseId"=$1 ORDER BY 1`, [id])).rows;
    expect(await bindings(restored.releaseId)).toEqual(await bindings(releases.a!));

    // The style of the copy points at the copy, never at the release it came from. It is read through the storage layer, whichever driver holds it.
    const { openArtifact } = await import("@/services/jenan-map/storage");
    const styleArtifact = (await service.artifacts(restored.releaseId)).find((file) => file.kind === "style")!;
    const styleHandle = await openArtifact(styleArtifact);
    const style = await styleHandle.readFile({ encoding: "utf8" }).finally(() => styleHandle.close());
    expect(style).toContain(`/api/jenan-map/releases/${restored.releaseId}/`);
    expect(style).not.toContain(releases.a!);
    if (sharedStorage) expect(await readdir(storage)).toEqual([]);

    const preview = await service.previewManifest(restored.releaseId) as { release: { id: string } };
    expect(preview.release.id).toBe(restored.releaseId);
    const found = await service.search({ q: "الرياض", releaseId: restored.releaseId, radiusMeters: 10_000 }, true);
    expect((found.results as unknown[]).length).toBeGreaterThan(0);
    await execute({ action: "approve", releaseId: restored.releaseId, confirmation: "APPROVE", reason: "Acceptance: restored candidate reviewed" });
    expect((await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [restored.releaseId])).rows[0].status).toBe("Approved");
    expect(await service.runtime()).toEqual(before);
    expect((await pool!.query(`SELECT action FROM jenan_map.audit WHERE "releaseId"=$1`, [restored.releaseId])).rows.map((r) => r.action)).toEqual(expect.arrayContaining(["create", "backup.restore_started", "backup.restore_rows", "backup.restored", "approve"]));
  }, 1_200_000);

  it("stopping the map is separate from the rest of the platform: maintenance and disabled are explicit states", async () => {
    let state = await service.runtime();
    await service.command({ action: "runtime", status: "maintenance", maintenanceMessage: "صيانة مجدولة", expectedRevision: state.revision, expectedPublishedReleaseId: releases.a!, confirmation: "CHANGE RUNTIME", reason: "Acceptance maintenance" }, adminId);
    await expect(service.search({ q: "الرياض", radiusMeters: 1000 })).rejects.toMatchObject({ code: "MAP_MAINTENANCE" });
    state = await service.runtime();
    await service.command({ action: "runtime", status: "disabled", expectedRevision: state.revision, expectedPublishedReleaseId: releases.a!, confirmation: "CHANGE RUNTIME", reason: "Acceptance disable" }, adminId);
    await expect(service.search({ q: "الرياض", radiusMeters: 1000 })).rejects.toMatchObject({ code: "MAP_DISABLED" });
    expect((await database.db.user.count()).valueOf()).toBeGreaterThan(0);
  });
});
