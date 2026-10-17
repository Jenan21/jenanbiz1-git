import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

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
  const version = `synthetic-${randomUUID()}`;
  const created = await services.command({
    action: "create", version, source: "SYNTHETIC integration fixture, not official Saudi data",
    sourceDate: "2026-10-01T00:00:00Z", license: "Synthetic test-only fixture",
  }, adminId) as { id: string };
  await pool!.query(`UPDATE jenan_map.release SET status='Processing' WHERE id=$1`, [created.id]);
  await pool!.query(`INSERT INTO jenan_map.boundary (id,"releaseId",authority,source,geometry)
    SELECT $1,$2,authority,source,geometry FROM jenan_map.boundary WHERE "releaseId"=$3`, [randomUUID(), created.id, importedId]);
  await pool!.query(`INSERT INTO jenan_map.feature (id,"releaseId",label,category,geometry,search)
    SELECT gen_random_uuid(),$1,label,category,geometry,search FROM jenan_map.feature WHERE "releaseId"=$2`, [created.id, importedId]);
  await pool!.query(`INSERT INTO jenan_map.release_layer
    ("releaseId","layerId",status,visibility,source,version,"sourceDate",license,"styleLayerIds")
    VALUES ($1,'base','ready','public','Synthetic test only',$2,'2026-10-01T00:00:00Z','Test only','["test-background"]')`,
  [created.id, version]);
  await mkdir(path.join(storage, created.id), { mode: 0o700 });
  for (const kind of ["geojson", "pmtiles", "style", "glyphs", "schema", "coverage"]) {
    // Bytes test immutable storage/publication mechanics only, not format/render validity.
    const bytes = Buffer.from(JSON.stringify({ syntheticTestOnly: true, kind }));
    const sha = createHash("sha256").update(bytes).digest("hex");
    const extension = kind === "geojson" ? "geojson" : kind === "pmtiles" ? "pmtiles" : "json";
    const key = `${created.id}/${sha}.${extension}`;
    await writeFile(path.join(storage, key), bytes, { mode: 0o400 });
    await pool!.query(`INSERT INTO jenan_map.artifact
      (id,"releaseId",kind,"storageKey",filename,mime,sha256,"byteSize","publicSafe")
      VALUES ($1,$2,$3,$4,$5,'application/json',$6,$7,$8)`,
    [randomUUID(), created.id, kind, key, `synthetic-${kind}.${extension}`, sha, bytes.length, !["schema", "coverage"].includes(kind)]);
  }
  await pool!.query(`UPDATE jenan_map.release SET status='Ready' WHERE id=$1`, [created.id]);
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
    const pmtiles = Buffer.alloc(128);
    pmtiles.write("PMTiles", 0, "ascii");
    pmtiles[7] = 3;
    pmtiles.writeBigUInt64LE(BigInt(127), 8);
    pmtiles.writeBigUInt64LE(BigInt(1), 16);
    pmtiles.writeBigUInt64LE(BigInt(128), 24);
    pmtiles.writeBigUInt64LE(BigInt(128), 40);
    pmtiles.writeBigUInt64LE(BigInt(128), 56);
    pmtiles.writeBigUInt64LE(BigInt(1), 72);
    pmtiles.writeInt32LE(340_000_000, 102);
    pmtiles.writeInt32LE(560_000_000, 106);
    pmtiles.writeInt32LE(160_000_000, 110);
    pmtiles.writeInt32LE(330_000_000, 114);
    await writeFile(path.join(staging, "saudi.pmtiles"), pmtiles);
    await writeFile(path.join(staging, "style.json"), JSON.stringify({
      version: 8,
      glyphs: "jenan-map-glyphs://{fontstack}/{range}.pbf",
      sources: { saudi: { type: "vector", url: "pmtiles://saudi.pmtiles" } },
      layers: [{ id: "synthetic-points", type: "circle", source: "saudi" }],
    }));
    await writeFile(path.join(staging, "arabic-0-255.pbf"), Buffer.from([0, 1, 2, 3]));
    await writeFile(path.join(staging, "schema.json"), JSON.stringify({ schemaVersion: "test-schema" }));
    await writeFile(path.join(staging, "coverage.json"), JSON.stringify({ countryCode: "SA", syntheticTestOnly: true }));
    await writeFile(path.join(staging, "import.json"), JSON.stringify({
      countryCode: "SA", authoritative: true, boundaryAuthority: "SYNTHETIC TEST AUTHORITY — NOT REAL SA BOUNDARY",
      boundarySource: "Synthetic polygon with hole to test exact PostGIS semantics",
      confirmation: "BUILD OWNED SA DATA", featuresFile: "features.geojson", boundaryFile: "boundary.geojson",
      styleFile: "style.json", layerBindings: { pois: ["synthetic-points"] },
      assets: [
        { kind: "pmtiles", file: "saudi.pmtiles", filename: "saudi.pmtiles", publicSafe: true },
        { kind: "glyphs", file: "arabic-0-255.pbf", filename: "Noto Sans Arabic Regular/0-255.pbf", publicSafe: true },
        { kind: "schema", file: "schema.json", filename: "tile-schema.json", publicSafe: false },
        { kind: "coverage", file: "coverage.json", filename: "coverage.json", publicSafe: false },
      ],
    }));
    const script = "../../scripts/jenan-map/build.mjs";
    await (await import(script)).build(["--release", importedId, "--manifest", "import.json"]);
    const [row] = (await pool!.query(`SELECT status FROM jenan_map.release WHERE id=$1`, [importedId])).rows;
    expect(row.status).toBe("Ready");
    expect((await pool!.query(`SELECT count(*)::int AS count FROM jenan_map.feature WHERE "releaseId"=$1`, [importedId])).rows[0].count).toBe(2);
    const portable = await services.exportManifest(importedId);
    expect(portable.portableGeojsonAvailable).toBe(true);
    const importedArtifacts = await services.artifacts(importedId);
    expect(importedArtifacts.map((file) => file.kind)).toEqual(expect.arrayContaining(["pmtiles", "style", "glyphs", "schema", "coverage", "geojson"]));
    const geojson = importedArtifacts.find((file) => file.kind === "geojson")!;
    const { openArtifact } = await import("@/services/jenan-map/storage");
    const handle = await openArtifact(geojson);
    try {
      const content = await handle.readFile({ encoding: "utf8" });
      expect(JSON.parse(content).features).toHaveLength(2);
      expect(content).not.toContain("privateContact");
    } finally { await handle.close(); }
    await expect(services.command({ action: "approve", releaseId: importedId, confirmation: "APPROVE", reason: "Must remain blocked without owned basemap artifacts" }, adminId)).rejects.toMatchObject({ code: "RELEASE_NOT_READY" });
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
