import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { build } from "../../scripts/jenan-map/build.mjs";
import { CLIP_TOLERANCE_DEGREES, importedFeature, OPEN_BOUNDARY_NOTICE } from "../../scripts/jenan-map/open-data.mjs";

// Real source import mechanics only: no OSM archive, glyph, production release or visual acceptance.
const enabled = process.env.RUN_JENAN_MAP_OPEN_DATA_TESTS === "1";
const root = path.resolve(`work/map-open-data-test-${randomUUID()}`);
const staging = path.join(root, "staging"), storage = path.join(root, "storage");
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let service: typeof import("@/services/jenan-map/service");
let database: typeof import("@/lib/db");
let adminId: string;
const savedEnvironment = new Map<string, string | undefined>();

describe.skipIf(!enabled)("actual pinned geoBoundaries Saudi import (private disposable database only)", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55439" || url.pathname !== "/jenan_map_test") {
      throw new Error("Only explicit disposable loopback jenan_map_test is permitted");
    }
    if (!path.isAbsolute(process.env.JENAN_MAP_TEST_SOURCE_ROOT ?? "")) throw new Error("Real pinned source root required; no fake fallback");
    await mkdir(staging, { recursive: true, mode: 0o700 });
    await mkdir(storage, { mode: 0o700 });
    database = await import("@/lib/db");
    service = await import("@/services/jenan-map/service");
    adminId = (await database.db.user.create({ data: { email: `map-open-${randomUUID()}@example.invalid`, status: "ACTIVE", systemRole: "ADMIN" } })).id;
    for (const [key, value] of Object.entries({ JENAN_MAP_BUILD_ACTOR: adminId, JENAN_MAP_STAGING_ROOT: staging, JENAN_MAP_STORAGE_ROOT: storage })) {
      savedEnvironment.set(key, process.env[key]); process.env[key] = value;
    }
  });
  afterAll(async () => {
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await database?.db.$disconnect();
    await pool?.end();
    await rm(root, { recursive: true, force: true });
  });
  it("blocks unclipped real intersections atomically, imports the clipped real layers and retains an explicitly bounded covered-source subset", async () => {
    const sourceRoot = process.env.JENAN_MAP_TEST_SOURCE_ROOT!;
    const countryBytes = await readFile(path.join(sourceRoot, "ADM0.geojson"));
    const regionBytes = await readFile(path.join(sourceRoot, "ADM1.geojson"));
    const governorateBytes = await readFile(path.join(sourceRoot, "ADM2.geojson"));
    expect(createHash("sha256").update(countryBytes).digest("hex")).toBe("7908e4f59ae61e5a8a39b1d0e4cea12d576b0a0b8fcee3daf6de80447a8a012d");
    expect(createHash("sha256").update(regionBytes).digest("hex")).toBe("cf50a59ddcda0fc4539c12799c320b9936fd75f47c1b5562ef548436d9169e13");
    expect(createHash("sha256").update(governorateBytes).digest("hex")).toBe("1a336a495dfcf3c369c5b5d05c205d7509610e0ab27ef1539140f8a8c763e335");
    const country = JSON.parse(countryBytes.toString()).features[0];
    const regions = JSON.parse(regionBytes.toString()).features;
    const governorates = JSON.parse(governorateBytes.toString()).features;
    let originallyCovered = 0;
    const coveredRegions = [];
    for (const region of regions) {
      const { rows } = await pool!.query("SELECT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),ST_SetSRID(ST_GeomFromGeoJSON($2),4326)) AS inside", [JSON.stringify(country.geometry), JSON.stringify(region.geometry)]);
      if (rows[0].inside) { originallyCovered++; coveredRegions.push(region); }
    }
    expect(originallyCovered).toBe(4);
    let governoratesCovered = 0;
    for (const governorate of governorates) {
      const { rows } = await pool!.query("SELECT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),ST_SetSRID(ST_GeomFromGeoJSON($2),4326)) AS inside", [JSON.stringify(country.geometry), JSON.stringify(governorate.geometry)]);
      if (rows[0].inside) governoratesCovered++;
    }
    expect(governoratesCovered).toBe(101);
    const features = [
      ...regions.map((region: unknown) => importedFeature(region, "geoBoundaries", "regions")!),
      ...governorates.map((governorate: unknown) => importedFeature(governorate, "geoBoundaries", "governorates")!),
    ];
    const feature = importedFeature(coveredRegions[0], "geoBoundaries", "regions")!;
    const config = JSON.parse(await readFile(path.join(sourceRoot, "boundary-sources.json"), "utf8"));
    const countrySource = config.boundaries.find((source: { level: string }) => source.level === "ADM0");
    const regionSource = config.boundaries.find((source: { level: string }) => source.level === "ADM1");
    const governorateSource = config.boundaries.find((source: { level: string }) => source.level === "ADM2");
    const originalRegionAttribution = regionSource.provenance.attribution;
    regionSource.provenance.attribution += "; modified by Jenan PRO: PostGIS ST_Intersection with reviewed unofficial ADM0; original source retained privately";
    governorateSource.provenance.attribution += "; modified by Jenan PRO: PostGIS ST_Intersection with reviewed unofficial ADM0; original source retained privately";
    const boundaryBytes = Buffer.from(JSON.stringify(country));
    const coverage = {
      countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0", coverageVerified: true,
      unofficial: true, notice: OPEN_BOUNDARY_NOTICE, boundaryAuthority: "geoBoundaries open data — not a Saudi government authority",
      boundarySource: countrySource.provenance.source, boundarySha256: createHash("sha256").update(boundaryBytes).digest("hex"),
      provenance: countrySource.provenance, layers: [
        { id: "regions", provenance: regionSource.provenance },
        { id: "governorates", provenance: governorateSource.provenance },
      ],
    };
    let release = await service.command({
      action: "create", version: `real-source-test-${randomUUID()}`, source: "Pinned geoBoundaries SAU real geometry test subset; not production basemap",
      sourceDate: countrySource.provenance.sourceDate, license: "ODbL-1.0; geoBoundaries product CC BY 4.0",
    }, adminId) as { id: string };
    const runtimeBefore = await service.runtime();
    await writeFile(path.join(staging, "boundary.geojson"), boundaryBytes);
    await writeFile(path.join(staging, "features.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
    await writeFile(path.join(staging, "original-ADM0.geojson"), countryBytes);
    await writeFile(path.join(staging, "original-ADM1.geojson"), regionBytes);
    await writeFile(path.join(staging, "original-ADM2.geojson"), governorateBytes);
    const fullImport = (clip: boolean) => JSON.stringify({
      ...coverage, featuresFile: "features.geojson", boundaryFile: "boundary.geojson",
      ...(clip ? { clipAdministrativeToBoundary: true } : {}), sourceFiles: config.boundaries
        .map((source: { level: string; sha256: string }) => ({ level: source.level, filename: `original-${source.level}.geojson`, sha256: source.sha256 })),
      confirmation: "BUILD OWNED SA DATA",
    });
    // The real, simplified ADM1 and ADM2 polygons do not nest exactly inside the simplified ADM0 (4 of 13 regions and 101 of 147 governorates are covered),
    // so taking them as they are is refused, atomically: the release fails, holds no feature and the production pointer does not move.
    await writeFile(path.join(staging, "unclipped-import.json"), fullImport(false));
    await expect(build(["--release", release.id, "--manifest", "unclipped-import.json"])).rejects.toThrow("Feature invalid or outside reviewed Saudi boundary");
    const failed = await pool!.query(`SELECT status,(SELECT count(*)::integer FROM jenan_map.feature WHERE "releaseId"=$1) AS features FROM jenan_map.release WHERE id=$1`, [release.id]);
    expect(failed.rows).toEqual([{ status: "Failed", features: 0 }]);
    expect(await service.runtime()).toEqual(runtimeBefore);
    // The reviewed path cuts them to the boundary (PostGIS ST_Intersection, within the documented tolerance, originals retained privately) and the whole
    // real layers are imported. This used to be refused too, until the clipping tolerance of 2026-10-18.
    release = await service.command({
      action: "create", version: `clipped-real-source-${randomUUID()}`, source: "Pinned geoBoundaries SAU real geometry, clipped to the reviewed ADM0; not production basemap",
      sourceDate: countrySource.provenance.sourceDate, license: "ODbL-1.0; original ADM2 source retained under CC-BY-SA-2.0; geoBoundaries product CC BY 4.0",
    }, adminId) as { id: string };
    await writeFile(path.join(staging, "import.json"), fullImport(true));
    await build(["--release", release.id, "--manifest", "import.json"]);
    const clipped = await pool!.query(`SELECT r.status, count(*) FILTER (WHERE f."layerId"='regions')::int AS regions, count(*) FILTER (WHERE f."layerId"='governorates')::int AS governorates,
      count(*) FILTER (WHERE ST_Covers(ST_Buffer(b.geometry, $2::float8), f.geometry))::int AS within_tolerance, count(*)::int AS total
      FROM jenan_map.feature f JOIN jenan_map.boundary b ON b."releaseId"=f."releaseId" JOIN jenan_map.release r ON r.id=f."releaseId" WHERE f."releaseId"=$1 GROUP BY r.status`, [release.id, CLIP_TOLERANCE_DEGREES]);
    expect(clipped.rows).toEqual([{ status: "Ready", regions: regions.length, governorates: governorates.length, within_tolerance: regions.length + governorates.length, total: regions.length + governorates.length }]);
    expect(await service.runtime()).toEqual(runtimeBefore);
    // This subset tests import mechanics only; it is not a complete administrative layer or basemap.
    release = await service.command({
      action: "create", version: `covered-source-subset-${randomUUID()}`, source: "Explicit 4/13 covered Saudi region test subset; not production administrative coverage",
      sourceDate: countrySource.provenance.sourceDate, license: "ODbL-1.0; original ADM2 source retained under CC-BY-SA-2.0; geoBoundaries product CC BY 4.0",
    }, adminId) as { id: string };
    await writeFile(path.join(staging, "subset-features.geojson"), JSON.stringify({
      type: "FeatureCollection", features: coveredRegions.map((region: unknown) => importedFeature(region, "geoBoundaries", "regions")),
    }));
    await writeFile(path.join(staging, "subset-import.json"), JSON.stringify({
      ...coverage, layers: [{ id: "regions", provenance: { ...regionSource.provenance,
        attribution: `${originalRegionAttribution}; test-only subset of 4 originally covered regions, not complete coverage` } }],
      featuresFile: "subset-features.geojson", boundaryFile: "boundary.geojson",
      sourceFiles: config.boundaries.map((source: { level: string; sha256: string }) => ({
        level: source.level, filename: `original-${source.level}.geojson`, sha256: source.sha256,
      })), confirmation: "BUILD OWNED SA DATA",
    }));
    await build(["--release", release.id, "--manifest", "subset-import.json"]);
    const { rows } = await pool!.query(`SELECT f.label,f."sourceId",f."layerId",f.aliases,
      f.search @@ plainto_tsquery('simple',$2) AS searchable,b.coverage,r.status,
      ST_Covers(b.geometry,f.geometry) AS covered
      FROM jenan_map.feature f JOIN jenan_map.boundary b ON b."releaseId"=f."releaseId"
      JOIN jenan_map.release r ON r.id=f."releaseId" WHERE f."releaseId"=$1`, [release.id, feature.properties.label]);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.covered)).toBe(true);
    const imported = rows.find((row) => row.sourceId === feature.properties.sourceId);
    expect(imported).toMatchObject({ label: feature.properties.label, sourceId: feature.properties.sourceId, layerId: "regions", searchable: true, status: "Ready",
      coverage: { authoritative: false, unofficial: true, provenance: { license: "ODbL-1.0" } } });
    expect(imported.aliases).toContain(feature.properties.label);
    const originals = await pool!.query(`SELECT sha256,"publicSafe" FROM jenan_map.artifact WHERE "releaseId"=$1 AND filename='original-ADM1.bin'`, [release.id]);
    expect(originals.rows).toEqual([{ sha256: "cf50a59ddcda0fc4539c12799c320b9936fd75f47c1b5562ef548436d9169e13", publicSafe: false }]);
    await expect(pool!.query(`UPDATE jenan_map.boundary SET coverage='{}' WHERE "releaseId"=$1`, [release.id])).rejects.toThrow("immutable");
    await expect(service.command({ action: "approve", releaseId: release.id, confirmation: "APPROVE", reason: "Incomplete real source fixture must remain blocked" }, adminId)).rejects.toThrow("RELEASE_NOT_READY");
    expect(await service.runtime()).toEqual(runtimeBefore);
      }, 300_000);
});
