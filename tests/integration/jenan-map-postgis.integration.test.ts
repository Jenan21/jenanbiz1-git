import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { Readable } from "node:stream";
import { readyFixtureFiles } from "../unit/jenan-map-artifact-fixtures";

// Explicit opt-in, disposable loopback database only. Fixtures are synthetic;
// these tests do not constitute Saudi dataset, basemap, glyph or visual acceptance.
const enabled = process.env.RUN_JENAN_MAP_POSTGIS_TESTS === "1";
const connection = process.env.DATABASE_URL ?? "";
const run = randomUUID();
const root = path.resolve(`.jenan-map-postgis-${run}`);
const storage = path.join(root, "storage");
const staging = path.join(root, "staging");
const pool = enabled ? new pg.Pool({ connectionString: connection }) : null;
let services: typeof import("@/services/jenan-map/service");
let database: typeof import("@/lib/db");
let adminId: string;
let userId: string;
let importedId: string;
let firstPublished: string;
let secondCandidate: string;
const authority = "SYNTHETIC TEST AUTHORITY — NOT REAL SA BOUNDARY";
const boundarySource = "Synthetic polygon with hole to test exact PostGIS semantics";

const boundary = {
  type: "Polygon",
  coordinates: [
    [[45, 23], [48, 23], [48, 26], [45, 26], [45, 23]],
    [[46, 24], [46, 25], [47, 25], [47, 24], [46, 24]],
  ],
};
const features = {
  type: "FeatureCollection",
  features: [45.5, 45.51].map((longitude, index) => ({
    type: "Feature", properties: { label: `اختبار ${index}`, category: "synthetic", privateContact: "must-not-export" },
    geometry: { type: "Point", coordinates: [longitude, 23.5] },
  })),
};

async function fullSyntheticRelease() {
  const created = await services.command({
    action: "create", version: `synthetic-${randomUUID()}`, source: "SYNTHETIC integration fixture, not official Saudi data",
    sourceDate: "2026-10-01T00:00:00Z", license: "Synthetic test-only fixture",
  }, adminId) as { id: string };
  await pool!.query(`UPDATE jenan_map.release SET status='Processing' WHERE id=$1`, [created.id]);
  await pool!.query(`INSERT INTO jenan_map.boundary (id,"releaseId",authority,source,geometry)
    SELECT $1,$2,authority,source,geometry FROM jenan_map.boundary WHERE "releaseId"=$3`, [randomUUID(), created.id, importedId]);
  await pool!.query(`INSERT INTO jenan_map.feature (id,"releaseId",label,category,geometry,search)
    SELECT gen_random_uuid(),$1,label,category,geometry,search FROM jenan_map.feature WHERE "releaseId"=$2`, [created.id, importedId]);
  await mkdir(path.join(storage, created.id), { mode: 0o700 });
  const geometryBytes = Buffer.from(JSON.stringify({ ...features, features: features.features.map((feature) => ({
    ...feature, properties: { label: feature.properties.label, category: feature.properties.category },
  })) }));
  {
    const bytes = geometryBytes;
    const sha = createHash("sha256").update(bytes).digest("hex");
    const key = `${created.id}/${sha}.geojson`;
    await writeFile(path.join(storage, key), bytes, { mode: 0o400 });
    await pool!.query(`INSERT INTO jenan_map.artifact
      (id,"releaseId",kind,"storageKey",filename,mime,sha256,"byteSize","publicSafe","exportAllowed","exportLicense")
      VALUES ($1,$2,'geojson',$3,'places.geojson','application/geo+json',$4,$5,true,true,'Synthetic fixture export permitted')`,
    [randomUUID(), created.id, key, sha, bytes.length]);
  }
  await pool!.query(`UPDATE jenan_map.release SET status='Ready' WHERE id=$1`, [created.id]);
  const { ingestArtifact, importSchema } = await import("@/services/jenan-map/ingestion");
  for (const fixture of readyFixtureFiles(created.id, {
    countryCode: "SA", authoritative: true, boundaryAuthority: authority, boundarySource,
  }).filter((file) => file.artifact.kind !== "geojson")) {
    const metadata = importSchema.parse({
      kind: fixture.artifact.kind, filename: fixture.artifact.filename,
      sha256: fixture.artifact.sha256, byteSize: fixture.bytes.length, publicSafe: fixture.artifact.publicSafe,
      exportAllowed: true, exportLicense: "Synthetic test-only bytes; export permitted",
      confirmation: "IMPORT OWNED MAP ARTIFACT",
    });
    await ingestArtifact(created.id, metadata, Readable.from([fixture.bytes]), adminId);
  }
  const { ingestLayerBindings, bindLayersSchema } = await import("@/services/jenan-map/layer-ingestion");
  await ingestLayerBindings(created.id, bindLayersSchema.parse({
    layers: [{ id: "base", styleLayerIds: ["places"], searchCategories: ["synthetic"], visibility: "public" }],
    confirmation: "BIND MAP LAYERS",
  }), adminId);
  await services.command({ action: "approve", releaseId: created.id, confirmation: "APPROVE", reason: "Synthetic mechanics-only fixture review" }, adminId);
  return created.id;
}

describe.skipIf(!enabled)("Jenan Map disposable PostGIS mechanics (synthetic only)", () => {
  beforeAll(async () => {
    const url = new URL(connection);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55439" || url.pathname !== "/jenan_map_test") {
      throw new Error("Only explicitly authorized disposable loopback jenan_map_test is permitted");
    }
    await mkdir(storage, { recursive: true, mode: 0o700 });
    await mkdir(staging, { recursive: true, mode: 0o700 });
    process.env.JENAN_MAP_STORAGE_ROOT = storage;
    process.env.JENAN_MAP_STAGING_ROOT = staging;
    database = await import("@/lib/db");
    services = await import("@/services/jenan-map/service");
    adminId = (await database.db.user.create({ data: { email: `map-admin-${run}@example.invalid`, status: "ACTIVE", systemRole: "ADMIN" } })).id;
    userId = (await database.db.user.create({ data: { email: `map-user-${run}@example.invalid`, status: "ACTIVE", systemRole: "USER" } })).id;
    process.env.JENAN_MAP_BUILD_ACTOR = adminId;
    const state = await services.runtime();
    expect(state.status).toBe("disabled");
  });

  afterAll(async () => {
    if (services && adminId) {
      const state = await services.runtime();
      await services.command({ action: "runtime", status: "disabled", expectedRevision: state.revision, confirmation: "CHANGE RUNTIME", reason: "Disable isolated synthetic test release after validation" }, adminId);
    }
    await database?.db.$disconnect();
    await pool?.end();
    await rm(root, { recursive: true, force: true });
    delete process.env.JENAN_MAP_STORAGE_ROOT;
    delete process.env.JENAN_MAP_STAGING_ROOT;
    delete process.env.JENAN_MAP_BUILD_ACTOR;
  });

  it("executes the offline real-geometry importer and blocks incomplete basemap publication", async () => {
    importedId = (await services.command({ action: "create", version: `import-${run}`, source: "Synthetic local geometry only", sourceDate: "2026-10-01T00:00:00Z", license: "Test only" }, adminId) as { id: string }).id;
    await writeFile(path.join(staging, "features.geojson"), JSON.stringify(features));
    await writeFile(path.join(staging, "boundary.geojson"), JSON.stringify(boundary));
    await writeFile(path.join(staging, "import.json"), JSON.stringify({
      countryCode: "SA", authoritative: true, boundaryAuthority: authority,
      boundarySource,
      confirmation: "BUILD OWNED SA DATA", featuresFile: "features.geojson", boundaryFile: "boundary.geojson",
    }));
    const script = "../../scripts/jenan-map/build.mjs";
    await (await import(script)).build(["--release", importedId, "--manifest", "import.json"]);
    const [row] = (await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [importedId])).rows;
    expect(row.status).toBe("Ready");
    expect((await pool!.query(`SELECT count(*)::int AS count FROM jenan_map.feature WHERE "releaseId"=$1`, [importedId])).rows[0].count).toBe(2);
    await expect(services.exportManifest(importedId)).rejects.toMatchObject({ code: "NO_LICENSED_EXPORT_ARTIFACTS" });
    const geojson = (await services.artifacts(importedId)).find((file) => file.kind === "geojson")!;
    const { openArtifact } = await import("@/services/jenan-map/storage");
    const handle = await openArtifact(geojson);
    try {
      const content = await handle.readFile({ encoding: "utf8" });
      expect(JSON.parse(content).features).toHaveLength(2);
      expect(content).not.toContain("privateContact");
    } finally { await handle.close(); }
    await expect(services.command({ action: "approve", releaseId: importedId, confirmation: "APPROVE", reason: "Must remain blocked without owned basemap artifacts" }, adminId)).rejects.toMatchObject({ code: "RELEASE_NOT_READY" });
  });

  it("carries an explicit export licence from the import manifest into the immutable geometry artifact, never into private sources", async () => {
    const script = "../../scripts/jenan-map/build.mjs";
    const builder = await import(script);
    const manifest = (exportLicense?: unknown) => ({
      countryCode: "SA", authoritative: true, boundaryAuthority: authority, boundarySource, confirmation: "BUILD OWNED SA DATA",
      featuresFile: "features.geojson", boundaryFile: "boundary.geojson", ...(exportLicense === undefined ? {} : { exportLicense }),
    });
    const create = async (name: string) => (await services.command({
      action: "create", version: `export-${name}-${run}`, source: "Synthetic local geometry only", sourceDate: "2026-10-01T00:00:00Z", license: "Test only",
    }, adminId) as { id: string }).id;

    // A blank or non-text licence is refused before the release is touched.
    for (const [name, bad] of [["blank", "  "], ["number", 7]] as const) {
      const id = await create(name);
      await writeFile(path.join(staging, `import-${name}.json`), JSON.stringify(manifest(bad)));
      await expect(builder.build(["--release", id, "--manifest", `import-${name}.json`])).rejects.toThrow("Export licence must be an explicit reviewed licence statement");
      expect((await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [id])).rows[0].status).toBe("Draft");
    }

    const id = await create("licensed");
    await writeFile(path.join(staging, "import-licensed.json"), JSON.stringify(manifest("Synthetic fixture: redistribution reviewed")));
    await builder.build(["--release", id, "--manifest", "import-licensed.json"]);
    const rows = (await pool!.query(`SELECT kind, "exportAllowed", "exportLicense" FROM jenan_map.artifact WHERE "releaseId"=$1`, [id])).rows;
    expect(rows.filter((row) => row.kind === "geojson")).toEqual([{ kind: "geojson", exportAllowed: true, exportLicense: "Synthetic fixture: redistribution reviewed" }]);
    const sources = rows.filter((row) => row.kind === "source");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((row) => row.exportAllowed === false && row.exportLicense === null)).toBe(true);
    const exported = await services.exportManifest(id) as { portableGeojsonAvailable: boolean; artifacts: Array<{ kind: string; exportLicense: string }> };
    expect(exported.portableGeojsonAvailable).toBe(true);
    expect(exported.artifacts).toEqual([expect.objectContaining({ kind: "geojson", exportLicense: "Synthetic fixture: redistribution reviewed" })]);
  });

  it("serializes two actual competing publications, retaining exactly one production pointer", async () => {
    const a = await fullSyntheticRelease();
    const b = await fullSyntheticRelease();
    const state = await services.runtime();
    const results = await Promise.allSettled([a, b].map((id) => services.command({
      action: "publish", releaseId: id, expectedRevision: state.revision, expectedPublishedReleaseId: state.publishedReleaseId,
      reason: "Synthetic concurrent publication mechanics test", confirmation: "PUBLISH",
    }, adminId)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const conflict = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(conflict.reason).toMatchObject({ status: 409 });
    firstPublished = (await services.runtime()).publishedReleaseId!;
    secondCandidate = firstPublished === a ? b : a;
    expect((await pool!.query(`SELECT count(*)::int AS count FROM jenan_map.release WHERE status='Published'`)).rows[0].count).toBe(1);
    const current = await services.runtime();
    await services.command({ action: "runtime", status: "enabled", expectedRevision: current.revision, confirmation: "CHANGE RUNTIME", reason: "Synthetic mechanics only; never production acceptance" }, adminId);
  });

  it("uses exact polygon holes and geography-meter proximity against actual PostGIS", async () => {
    await expect(services.validateLocation(24.5, 46.5, firstPublished)).rejects.toMatchObject({ code: "OUTSIDE_SAUDI_ARABIA", status: 422 });
    expect(await services.validateLocation(23.5, 45.5, firstPublished)).toMatchObject({ valid: true });
    const narrow = await services.search({ q: "اختبار", releaseId: firstPublished, latitude: 23.5, longitude: 45.5, radiusMeters: 500 });
    const wider = await services.search({ q: "اختبار", releaseId: firstPublished, latitude: 23.5, longitude: 45.5, radiusMeters: 2000 });
    expect(narrow.results).toHaveLength(1);
    expect(wider.results).toHaveLength(2);
  });

  it("exports only licensed retained files and resolves real release-pinned asset/style metadata", async () => {
    const manifest = await services.manifest();
    expect(manifest.release?.layers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "base", available: true, styleLayerIds: ["places"] })]));
    const portable = await services.exportManifest(firstPublished, adminId);
    expect(portable.artifacts).toHaveLength(6);
    expect(portable.artifacts.every((file) => file.url.endsWith("?download=1") && file.exportLicense)).toBe(true);
    expect(portable.artifacts.find((file) => file.kind === "glyphs")?.logicalFilename).toBe("Noto/0-255.pbf");
    expect(portable.artifacts.some((file) => file.kind === "source")).toBe(false);
    const files = await services.artifacts(firstPublished);
    const style = await services.servedStyle(files.find((file) => file.kind === "style")!, true);
    expect(style.glyphs).toBe(`/api/admin/jenan-map/releases/${firstPublished}/glyphs/{fontstack}/{range}.pbf`);
    const sources = await services.artifacts(importedId);
    await expect(services.authorizedArtifact(sources.find((file) => file.kind === "source")!.id, true))
      .rejects.toMatchObject({ code: "RAW_SOURCE_DOWNLOAD_UNSUPPORTED", status: 403 });
  });

  it("uses the same enabled release-binding policy for actual search and delivered style visibility", async () => {
    await pool!.query(`UPDATE jenan_map.release_layer SET enabled=false,revision=revision+1 WHERE "releaseId"=$1 AND "layerId"='base'`, [firstPublished]);
    try {
      const results = await services.search({ q: "اختبار", releaseId: firstPublished, radiusMeters: 2000 });
      expect(results.results).toHaveLength(0);
      expect((await services.manifest()).release?.layers[0]).toMatchObject({ id: "base", available: false });
      const styleFile = (await services.artifacts(firstPublished)).find((file) => file.kind === "style")!;
      expect((await services.servedStyle(styleFile, false)).layers[0].layout.visibility).toBe("none");
    } finally {
      await pool!.query(`UPDATE jenan_map.release_layer SET enabled=true,revision=revision+1 WHERE "releaseId"=$1 AND "layerId"='base'`, [firstPublished]);
    }
  });

  it("persists user-owned selections across fresh reads with server timestamps and no invented addresses", async () => {
    expect(await services.savedLocation(userId)).toBeNull();
    const saved = await services.saveLocation({ latitude: 23.5, longitude: 45.5, releaseId: firstPublished, source: "coordinates" }, userId);
    const reopened = await services.savedLocation(userId);
    expect(reopened).toEqual(saved);
    expect(reopened).toMatchObject({ country: "SA", city: null, district: null, region: null, formattedAddress: null });
    expect(reopened!.selectedAt).toBeInstanceOf(Date);
    expect(await services.savedLocation(adminId)).toBeNull();
    await expect(services.saveLocation({ latitude: 24.5, longitude: 46.5, releaseId: firstPublished, source: "map" }, userId)).rejects.toMatchObject({ status: 422 });
    expect(await services.savedLocation(userId)).toEqual(saved);
    const deviceSelection = await services.saveLocation({ latitude: 23.5, longitude: 45.5, releaseId: firstPublished, source: "geolocation" }, userId);
    expect(deviceSelection.source).toBe("geolocation");
    expect(await services.savedLocation(userId)).toEqual(deviceSelection);
  });

  it("persists release-specific preferences with actual owner isolation and revision conflicts", async () => {
    const { mapPreferences, saveMapPreferences } = await import("@/services/jenan-map/preferences");
    const input = { releaseId: firstPublished, radius: 3000 as const, visibleLayers: [] as string[], viewport: null, expectedRevision: 0 };
    const saved = await saveMapPreferences(userId, input);
    expect(saved).toMatchObject({ releaseId: firstPublished, radius: 3000, visibleLayers: [], viewport: null, revision: 1 });
    expect(await mapPreferences(userId, firstPublished)).toEqual(saved);
    expect(await mapPreferences(adminId, firstPublished)).toBeNull();
    const updated = await saveMapPreferences(userId, { ...input, radius: 1000, visibleLayers: ["base"], expectedRevision: 1 });
    expect(updated).toMatchObject({ radius: 1000, visibleLayers: ["base"], revision: 2 });
    await expect(saveMapPreferences(userId, input)).rejects.toMatchObject({ code: "STALE_REVISION", status: 409 });
    expect(await mapPreferences(userId, firstPublished)).toEqual(updated);
  });

  it("rolls publication back atomically if the existing central audit cannot be written", async () => {
    const candidate = await fullSyntheticRelease();
    const before = await services.runtime();
    await expect(services.command({ action: "publish", releaseId: candidate, expectedRevision: before.revision, expectedPublishedReleaseId: before.publishedReleaseId, confirmation: "PUBLISH", reason: "Synthetic transaction rollback verification" }, "nonexistent-synthetic-user")).rejects.toThrow();
    expect(await services.runtime()).toEqual(before);
    expect((await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [candidate])).rows[0].status).toBe("Approved");
  });

  it("rolls back explicitly, retaining releases, immutable artifacts and audit evidence", async () => {
    let state = await services.runtime();
    await services.command({ action: "publish", releaseId: secondCandidate, expectedRevision: state.revision, expectedPublishedReleaseId: state.publishedReleaseId, confirmation: "PUBLISH", reason: "Synthetic successor publication for rollback" }, adminId);
    state = await services.runtime();
    await services.command({ action: "rollback", releaseId: firstPublished, expectedRevision: state.revision, expectedPublishedReleaseId: secondCandidate, confirmation: "ROLLBACK", reason: "Synthetic explicit rollback mechanics test" }, adminId);
    expect((await services.runtime()).publishedReleaseId).toBe(firstPublished);
    await expect(pool!.query(`DELETE FROM jenan_map.release WHERE id=$1`, [firstPublished])).rejects.toThrow("retained");
    await expect(pool!.query(`UPDATE jenan_map.artifact SET filename='changed' WHERE "releaseId"=$1`, [firstPublished])).rejects.toThrow("retained");
    await expect(pool!.query(`UPDATE jenan_map.feature SET label='changed' WHERE "releaseId"=$1`, [firstPublished])).rejects.toThrow("immutable");
    expect((await pool!.query(`SELECT count(*)::int AS count FROM "AuditLog" WHERE "actorId"=$1 AND action='jenan_map.rollback'`, [adminId])).rows[0].count).toBe(1);
    expect((await pool!.query(`SELECT count(*)::int AS count FROM jenan_map.release WHERE status='Published'`)).rows[0].count).toBe(1);
  });
});
