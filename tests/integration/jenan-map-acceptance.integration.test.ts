import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { build } from "../../scripts/jenan-map/build.mjs";
import { FONT_STACKS } from "../../scripts/jenan-map/glyphs.mjs";
import { buildStyle } from "../../scripts/jenan-map/styles.mjs";

// ACCEPTANCE on REAL data (no fixtures): the real Saudi PMTiles, real OSM-derived places/streets/POIs, real geoBoundaries, real glyphs and
// the real Jenan style. Opt-in: needs the files from `npm run jenan-map:saudi-pmtiles|glyphs` and prepare-saudi-import, and a disposable PostGIS.
//   RUN_JENAN_MAP_ACCEPTANCE=1 JENAN_MAP_ACCEPTANCE_STAGE=.jenan-map-data/stage DATABASE_URL=postgresql://.../jenan_map_test
const enabled = process.env.RUN_JENAN_MAP_ACCEPTANCE === "1";
const data = path.resolve(".jenan-map-data");
const root = path.resolve(`work/map-acceptance-${randomUUID()}`);
const staging = path.join(root, "staging"), storage = path.join(root, "storage");
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let service: typeof import("@/services/jenan-map/service");
let backupService: typeof import("@/services/jenan-map/backup-service");
let restore: typeof import("@/services/jenan-map/restore");
let ingestion: typeof import("@/services/jenan-map/ingestion");
let layerIngestion: typeof import("@/services/jenan-map/layer-ingestion");
let database: typeof import("@/lib/db");
let validation: typeof import("@/services/jenan-map/validation");
let adminId: string, userId: string;
const saved = new Map<string, string | undefined>();
const releases: { a?: string; b?: string } = {};

const sha = async (file: string) => { const h = createHash("sha256"); h.update(await readFile(file)); return h.digest("hex"); };

type TilesManifest = { source: { name: string; build: string; osmReplicationTime: string; schema: string | number } };

async function newRelease(label: string, tilesFile: string, tilesManifest: TilesManifest) {
  const stage = path.resolve(process.env.JENAN_MAP_ACCEPTANCE_STAGE ?? ".jenan-map-data/stage");
  const created = await service.command({
    action: "create", version: `${label}-${randomUUID().slice(0, 8)}`, source: `${tilesManifest.source.name} build ${tilesManifest.source.build}`,
    sourceDate: tilesManifest.source.osmReplicationTime, license: "ODbL-1.0",
  }, adminId) as { id: string };
  // The offline importer reads the prepared real staging folder (features, boundary, original sources, coverage).
  const work = path.join(staging, label);
  await mkdir(work, { mode: 0o700 });
  for (const name of await readdir(stage)) await copyFile(path.join(stage, name), path.join(staging, `${label}-${name}`));
  const importJson = JSON.parse(await readFile(path.join(stage, "import.json"), "utf8"));
  const prefixed = { ...importJson, featuresFile: `${label}-features.geojson`, boundaryFile: `${label}-boundary.geojson`,
    sourceFiles: importJson.sourceFiles.map((s: { filename: string }) => ({ ...s, filename: `${label}-${s.filename}` })) };
  await writeFile(path.join(staging, `${label}-import.json`), JSON.stringify(prefixed));
  await build(["--release", created.id, "--manifest", `${label}-import.json`]);

  const importArtifact = async (kind: string, filename: string, file: string, publicSafe: boolean, license: string) => {
    const bytes = await readFile(file);
    // The logical name is unique per asset (the three font stacks all contain 0-255.pbf); a file's basename is not.
    const staged = `${label}-${filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (!existsSync(path.join(staging, staged))) await copyFile(file, path.join(staging, staged));
    const metadata = ingestion.importSchema.parse({ kind, filename, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length, publicSafe,
      exportAllowed: publicSafe, ...(publicSafe ? { exportLicense: license } : {}), confirmation: "IMPORT OWNED MAP ARTIFACT" });
    return ingestion.ingestArtifact(created.id, metadata, await ingestion.localImportStream(staged), adminId);
  };

  const tilesName = path.basename(tilesFile);
  const base = validation.releaseAssetBase(created.id);
  const style = buildStyle({ theme: "light", language: "ar", releaseBase: base, tileFilename: tilesName });
  const styleFile = path.join(staging, `${label}-style.json`);
  await writeFile(styleFile, JSON.stringify(style));
  const darkFile = path.join(staging, `${label}-style-dark.json`);
  await writeFile(darkFile, JSON.stringify(buildStyle({ theme: "dark", language: "ar", releaseBase: base, tileFilename: tilesName })));
  const schemaFile = path.join(staging, `${label}-schema.json`);
  const { PMTiles } = await import("pmtiles");
  const { open } = await import("node:fs/promises");
  const handle = await open(tilesFile, "r");
  let vectorLayers: unknown[] = [];
  try {
    const pm = new PMTiles({ getKey: () => tilesFile, getBytes: async (o: number, l: number) => { const b = Buffer.alloc(l); const r = await handle.read(b, 0, l, o); return { data: Uint8Array.from(b.subarray(0, r.bytesRead)).buffer }; } });
    vectorLayers = ((await pm.getMetadata()) as { vector_layers: unknown[] }).vector_layers;
  } finally { await handle.close(); }
  await writeFile(schemaFile, JSON.stringify({ version: String(tilesManifest.source.schema), vector_layers: vectorLayers.map((v) => ({ id: (v as { id: string }).id })) }));
  const { layers, confirmation, ...coverage } = importJson;
  void layers; void confirmation;
  const coverageFile = path.join(staging, `${label}-coverage.json`);
  const { featuresFile, boundaryFile, sourceFiles, clipAdministrativeToBoundary, ...coverageOnly } = coverage as Record<string, unknown>;
  void featuresFile; void boundaryFile; void sourceFiles; void clipAdministrativeToBoundary;
  await writeFile(coverageFile, JSON.stringify({ ...coverageOnly, layers: importJson.layers }));

  await importArtifact("pmtiles", tilesName, tilesFile, true, "ODbL-1.0");
  await importArtifact("style", "style.json", styleFile, true, "Jenan PRO Map style");
  await importArtifact("schema", "schema.json", schemaFile, false, "");
  await importArtifact("coverage", "coverage.json", coverageFile, false, "");
  const glyphRoot = path.join(data, "glyphs");
  const glyphManifest = JSON.parse(await readFile(path.join(glyphRoot, "manifest.json"), "utf8"));
  for (const entry of (glyphManifest.files as Array<{ filename: string }>).filter((item) => FONT_STACKS.includes(item.filename.split("/")[0]))) {
    await importArtifact("glyphs", entry.filename, path.join(glyphRoot, entry.filename), true, "OFL-1.1");
  }

  // The prepared bindings come from the real style (every style layer claimed once), so nothing is adjusted here.
  const bindings = JSON.parse(await readFile(path.join(stage, "bindings.json"), "utf8"));
  const bound = layerIngestion.bindLayersSchema.parse(bindings);
  expect(new Set(bound.layers.flatMap((layer) => layer.styleLayerIds))).toEqual(new Set(style.layers.map((layer: { id: string }) => layer.id)));
  await layerIngestion.ingestLayerBindings(created.id, bound, adminId);
  void darkFile; void sha;
  return created.id;
}

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
    ingestion = await import("@/services/jenan-map/ingestion");
    layerIngestion = await import("@/services/jenan-map/layer-ingestion");
    validation = await import("@/services/jenan-map/validation");
    adminId = (await database.db.user.create({ data: { email: `acc-admin-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "ADMIN" } })).id;
    userId = (await database.db.user.create({ data: { email: `acc-user-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "USER" } })).id;
    for (const [key, value] of Object.entries({ JENAN_MAP_BUILD_ACTOR: adminId, JENAN_MAP_STAGING_ROOT: staging, JENAN_MAP_STORAGE_ROOT: storage })) {
      saved.set(key, process.env[key]); process.env[key] = value;
    }
  });
  afterAll(async () => {
    for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await database?.db.$disconnect();
    await pool?.end();
    await rm(root, { recursive: true, force: true });
  });

  const tiles = (dir: string) => { const folder = path.join(data, dir); const file = path.join(folder, (existsSync(folder) ? [] : [""]).concat([]).join("") || ""); void file; return folder; };
  const archive = async (dir: string) => {
    const folder = tiles(dir);
    const name = (await readdir(folder)).find((n) => n.endsWith(".pmtiles"))!;
    return { file: path.join(folder, name), manifest: JSON.parse(await readFile(path.join(folder, `${name}.manifest.json`), "utf8")) };
  };

  it("imports version A (z12) from real data, validates it, approves and publishes it", async () => {
    const a = await archive("saudi-z12");
    releases.a = await newRelease("versionA", a.file, a.manifest);
    expect((await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [releases.a])).rows[0].status).toBe("Ready");
    const counts = (await pool!.query(`SELECT "layerId", count(*)::int AS n FROM jenan_map.feature WHERE "releaseId"=$1 GROUP BY 1 ORDER BY 1`, [releases.a])).rows;
    expect(Object.fromEntries(counts.map((r) => [r.layerId, r.n]))).toMatchObject({ governorates: expect.any(Number), pois: expect.any(Number), places: expect.any(Number), regions: expect.any(Number), roads: expect.any(Number) });
    await service.command({ action: "approve", releaseId: releases.a, confirmation: "APPROVE", reason: "Acceptance: real Saudi data version A reviewed" }, adminId);
    const state = await service.runtime();
    await service.command({ action: "publish", releaseId: releases.a, expectedRevision: state.revision, expectedPublishedReleaseId: state.publishedReleaseId, confirmation: "PUBLISH", reason: "Acceptance publish A" }, adminId);
    const published = await service.runtime();
    await service.command({ action: "runtime", status: "enabled", expectedRevision: published.revision, expectedPublishedReleaseId: releases.a, confirmation: "CHANGE RUNTIME", reason: "Acceptance enable" }, adminId);
    expect((await service.runtime())).toMatchObject({ status: "enabled", publishedReleaseId: releases.a });
  }, 900_000);

  it("finds real Saudi names in Arabic and English: city, district, street and POI", async () => {
    const find = async (q: string) => (await service.search({ q, radiusMeters: 10_000 })).results as Array<{ label: string; category: string; latitude: number; longitude: number }>;
    const riyadh = await find("الرياض");
    expect(riyadh.length).toBeGreaterThan(0);
    expect(riyadh.some((r) => r.category === "places" || r.category === "governorates" || r.category === "regions")).toBe(true);
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

  it("previews version B (z15) without touching customers, then publishes it atomically", async () => {
    const b = await archive("saudi");
    releases.b = await newRelease("versionB", b.file, b.manifest);
    const before = await service.runtime();
    const preview = await service.previewManifest(releases.b) as { release: { id: string } };
    expect(preview.release.id).toBe(releases.b);
    expect((await service.runtime()).publishedReleaseId).toBe(releases.a);
    expect((await service.manifest() as { release: { id: string } }).release.id).toBe(releases.a);
    await service.command({ action: "approve", releaseId: releases.b, confirmation: "APPROVE", reason: "Acceptance: real Saudi data version B reviewed" }, adminId);
    await service.command({ action: "publish", releaseId: releases.b, expectedRevision: before.revision, expectedPublishedReleaseId: releases.a!, confirmation: "PUBLISH", reason: "Acceptance publish B" }, adminId);
    expect((await service.runtime()).publishedReleaseId).toBe(releases.b);
    expect((await pool!.query(`SELECT id,status FROM jenan_map.release WHERE id = ANY($1) ORDER BY status`, [[releases.a, releases.b]])).rows.map((r) => r.status).sort()).toEqual(["Archived", "Published"]);
  }, 1_200_000);

  it("rolls back to version A after confirmation, keeping both versions and the audit trail", async () => {
    const state = await service.runtime();
    await service.command({ action: "rollback", releaseId: releases.a!, expectedRevision: state.revision, expectedPublishedReleaseId: releases.b!, confirmation: "ROLLBACK", reason: "Acceptance rollback to A" }, adminId);
    expect((await service.runtime()).publishedReleaseId).toBe(releases.a);
    const rows = (await pool!.query(`SELECT id,status FROM jenan_map.release WHERE id = ANY($1)`, [[releases.a, releases.b]])).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === releases.b)!.status).toBe("Archived");
    const audit = (await pool!.query(`SELECT action FROM jenan_map.audit WHERE "releaseId" = ANY($1) ORDER BY "createdAt"`, [[releases.a, releases.b]])).rows.map((r) => r.action);
    expect(audit).toEqual(expect.arrayContaining(["create", "approve", "publish", "rollback", "build.ready"]));
    // The saved location still opens after the rollback because it is stored independently of the release choice.
    expect((await service.savedLocation(userId))).toMatchObject({ latitude: 24.8216, longitude: 46.6633 });
  });

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

    // The style of the copy points at the copy, never at the release it came from.
    const styleKey = (await pool!.query(`SELECT "storageKey" FROM jenan_map.artifact WHERE "releaseId"=$1 AND kind='style'`, [restored.releaseId])).rows[0].storageKey as string;
    const style = await readFile(path.join(storage, styleKey), "utf8");
    expect(style).toContain(`/api/jenan-map/releases/${restored.releaseId}/`);
    expect(style).not.toContain(releases.a!);

    const preview = await service.previewManifest(restored.releaseId) as { release: { id: string } };
    expect(preview.release.id).toBe(restored.releaseId);
    const found = await service.search({ q: "الرياض", releaseId: restored.releaseId, radiusMeters: 10_000 }, true);
    expect((found.results as unknown[]).length).toBeGreaterThan(0);
    await service.command({ action: "approve", releaseId: restored.releaseId, confirmation: "APPROVE", reason: "Acceptance: restored candidate reviewed" }, adminId);
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
