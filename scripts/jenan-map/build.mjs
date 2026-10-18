#!/usr/bin/env node
// Run in an operator-controlled background job:
// node --env-file=.env scripts/jenan-map/build.mjs --release UUID --manifest import.json
// No migrations, remote fetches, shell execution, or third-party fallbacks.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { validateCoverage } from "./open-data.mjs";

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FEATURES = 100_000;

export function parseArguments(args) {
  if (args.length !== 4 || args[0] !== "--release" || args[2] !== "--manifest" ||
    !/^[a-f0-9-]{36}$/.test(args[1]) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.json$/.test(args[3])) {
    throw new Error("Usage: --release UUID --manifest local-manifest.json");
  }
  return { releaseId: args[1], manifest: args[3] };
}

async function readStaged(root, filename) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}\.(json|geojson)$/.test(filename)) throw new Error("Invalid staged filename");
  const handle = await open(path.join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > MAX_BYTES) throw new Error("Staged file size outside limits");
    const bytes = await handle.readFile();
    if (bytes.length > MAX_BYTES) throw new Error("Staged file grew beyond limit");
    return bytes;
  } finally { await handle.close(); }
}

function validCoordinates(value, depth = 0) {
  if (!Array.isArray(value) || value.length === 0 || depth > 4) return false;
  if (typeof value[0] === "number") return value.length >= 2 && value.length <= 3 &&
    value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
  return value.every((item) => validCoordinates(item, depth + 1));
}

export function normalizeFeatures(value) {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features) || value.features.length < 1 || value.features.length > MAX_FEATURES) throw new Error("Expected bounded nonempty FeatureCollection");
  const supported = new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"]);
  return { type: "FeatureCollection", features: value.features.map((feature) => {
    if (feature?.properties?.visibility === "internal" || feature?.properties?.internal === true ||
        feature?.properties?.publicSafe === false) {
      throw new Error("Internal features cannot enter a public map artifact");
    }
    const label = feature?.properties?.label;
    const category = feature?.properties?.category ?? "place";
    if (feature.type !== "Feature" || typeof label !== "string" || !label.trim() || label.length > 240 ||
      typeof category !== "string" || category.length > 100 || !supported.has(feature.geometry?.type) ||
      !validCoordinates(feature.geometry.coordinates)) throw new Error("Invalid feature geometry or public label");
    const properties = { label: label.trim(), category };
    if (feature.properties.aliases !== undefined) {
      const aliases = feature.properties.aliases;
      if (!Array.isArray(aliases) || aliases.length > 20 || aliases.some((alias) => typeof alias !== "string" || !alias.trim() || alias.length > 240)) throw new Error("Invalid imported search aliases");
      properties.aliases = [...new Set(aliases.map((alias) => alias.trim()))];
    }
    if (feature.properties.layerId !== undefined) {
      if (!["roads", "places", "regions", "governorates"].includes(feature.properties.layerId) ||
          category !== feature.properties.layerId || typeof feature.properties.sourceId !== "string" ||
          !feature.properties.sourceId || feature.properties.sourceId.length > 240 ||
          !["geoBoundaries", "OpenStreetMap"].includes(feature.properties.source)) throw new Error("Invalid imported layer/source identity");
      properties.layerId = feature.properties.layerId;
      properties.sourceId = feature.properties.sourceId;
      properties.source = feature.properties.source;
      for (const key of ["name_ar", "name_en"]) {
        if (feature.properties[key] !== undefined) {
          if (typeof feature.properties[key] !== "string" || feature.properties[key].length > 240) throw new Error("Invalid bilingual name");
          properties[key] = feature.properties[key];
        }
      }
    }
    return { type: "Feature", properties, geometry: { type: feature.geometry.type, coordinates: feature.geometry.coordinates } };
  }) };
}

async function persistArtifact(client, root, releaseId, bytes, kind, publicSafe, filename) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const extension = kind === "geojson" ? "geojson" : "bin";
  const storageKey = `${releaseId}/${sha256}.${extension}`;
  const folder = path.join(root, releaseId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const actual = await realpath(folder);
  if (actual !== folder) throw new Error("Storage directory symlink refused");
  const target = path.join(folder, `${sha256}.${extension}`);
  const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally { await handle.close(); }
  await chmod(target, 0o400);
  await client.query(`INSERT INTO jenan_map.artifact (id,"releaseId",kind,"storageKey",filename,mime,sha256,"byteSize","publicSafe")
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [randomUUID(), releaseId, kind, storageKey, filename, kind === "geojson" ? "application/geo+json" : "application/octet-stream", sha256, bytes.length, publicSafe]);
}

async function log(client, actor, releaseId, action, metadata) {
  await client.query(`INSERT INTO jenan_map.audit (id,"actorId","releaseId",action,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [randomUUID(), actor, releaseId, action, JSON.stringify(metadata)]);
  await client.query(`INSERT INTO "AuditLog" (id,"actorId",action,"entityType","entityId",metadata)
    VALUES ($1,$2,$3,'JenanMapRelease',$4,$5::jsonb)`,
  [randomUUID(), actor, `jenan_map.${action}`, releaseId, JSON.stringify({ ...metadata, result: action === "build.failed" ? "failure" : "success" })]);
}

export async function build(args) {
  const { releaseId, manifest } = parseArguments(args);
  const actor = process.env.JENAN_MAP_BUILD_ACTOR?.trim();
  const stagingConfigured = process.env.JENAN_MAP_STAGING_ROOT;
  const storageConfigured = process.env.JENAN_MAP_STORAGE_ROOT;
  if (!actor || !process.env.DATABASE_URL || !stagingConfigured || !storageConfigured ||
    !path.isAbsolute(stagingConfigured) || !path.isAbsolute(storageConfigured)) throw new Error("Database, operator identity, private staging and storage roots required");
  const stagingRoot = await realpath(stagingConfigured);
  const storageRoot = await realpath(storageConfigured);
  const publicRoot = await realpath(path.resolve("public")).catch(() => path.resolve("public"));
  for (const root of [stagingRoot, storageRoot]) {
    if (root === publicRoot || root.startsWith(publicRoot + path.sep)) throw new Error("Public directory cannot hold private data");
    const info = await stat(root);
    if (!info.isDirectory() || (info.mode & 0o077) !== 0) throw new Error("Private roots must have permissions 0700");
  }
  if (stagingRoot === storageRoot || stagingRoot.startsWith(storageRoot + path.sep) || storageRoot.startsWith(stagingRoot + path.sep)) throw new Error("Separate staging and immutable storage roots required");
  const input = JSON.parse((await readStaged(stagingRoot, manifest)).toString("utf8"));
  validateCoverage(input);
  if (input.countryCode !== "SA" || typeof input.boundaryAuthority !== "string" ||
    input.boundaryAuthority.trim().length < 3 || input.boundaryAuthority.length > 1000 ||
    typeof input.boundarySource !== "string" || input.boundarySource.trim().length < 3 || input.boundarySource.length > 2000 ||
    input.confirmation !== "BUILD OWNED SA DATA") throw new Error("Explicit reviewed Saudi boundary provenance and build confirmation required");
  const featureBytes = await readStaged(stagingRoot, input.featuresFile);
  const boundaryBytes = await readStaged(stagingRoot, input.boundaryFile);
  const sourceFiles = [];
  if (input.sourceFiles !== undefined) {
    if (input.authoritative !== false || !Array.isArray(input.sourceFiles) || input.sourceFiles.length > 3 ||
        new Set(input.sourceFiles.map((source) => source.level)).size !== input.sourceFiles.length) throw new Error("Bounded original administrative sources required");
    for (const source of input.sourceFiles) {
      if (!["ADM0", "ADM1", "ADM2"].includes(source.level) || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) throw new Error("Invalid original source evidence");
      const bytes = await readStaged(stagingRoot, source.filename);
      if (createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new Error("Original source checksum mismatch");
      sourceFiles.push({ ...source, bytes });
    }
  }
  if (input.clipAdministrativeToBoundary === true &&
      (input.authoritative !== false || !sourceFiles.some((source) => source.level === "ADM1" || source.level === "ADM2"))) throw new Error("Clipping requires retained original administrative sources");
  if (input.authoritative === false && createHash("sha256").update(boundaryBytes).digest("hex") !== input.boundarySha256) throw new Error("Reviewed boundary checksum mismatch");
  const features = normalizeFeatures(JSON.parse(featureBytes.toString("utf8")));
  if (input.clipAdministrativeToBoundary === true && features.features.some((feature) => {
    const level = { regions: "ADM1", governorates: "ADM2" }[feature.properties.layerId];
    return level && !sourceFiles.some((source) => source.level === level);
  })) throw new Error("Every clipped administrative layer requires its original source");
  const rawBoundary = JSON.parse(boundaryBytes.toString("utf8"));
  const boundary = rawBoundary.type === "Feature" ? rawBoundary.geometry : rawBoundary;
  if (!["Polygon", "MultiPolygon"].includes(boundary?.type) || !validCoordinates(boundary.coordinates)) throw new Error("Reviewed Polygon/MultiPolygon boundary required");
  if (input.authoritative === false) {
    const points = boundary.coordinates.flat(boundary.type === "MultiPolygon" ? 2 : 1);
    const extent = points.reduce((extent, point) => [Math.min(extent[0], point[0]), Math.min(extent[1], point[1]), Math.max(extent[2], point[0]), Math.max(extent[3], point[1])], [180, 90, -180, -90]);
    if (extent[0] > 35 || extent[1] > 16.5 || extent[2] < 55 || extent[3] < 32 ||
        extent[0] < 34 || extent[1] < 15 || extent[2] > 56 || extent[3] > 33) throw new Error("Open boundary lacks Saudi country extent; extent alone is not coverage verification");
    if (features.features.some((feature) => !input.layers.some((layer) => layer.id === feature.properties.layerId))) throw new Error("Imported feature missing reviewed layer provenance");
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  let processing = false;
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const operator = await client.query(`SELECT id FROM "User" WHERE id=$1 AND status='ACTIVE' AND "systemRole" IN ('ADMIN','SUPER_ADMIN')`, [actor]);
    if (operator.rowCount !== 1) throw new Error("Build operator must be an active platform administrator");
    const claimed = await client.query(`UPDATE jenan_map.release SET status='Processing' WHERE id=$1 AND status='Draft' RETURNING id`, [releaseId]);
    if (claimed.rowCount !== 1) throw new Error("Only a Draft release can be built; create a new release after failure");
    await log(client, actor, releaseId, "build.started", { operator: actor, manifest });
    await client.query("COMMIT");
    processing = true;
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await client.query(`SELECT id FROM jenan_map.release WHERE id=$1 AND status='Processing' FOR UPDATE`, [releaseId]);
    await client.query(`INSERT INTO jenan_map.boundary (id,"releaseId",authority,source,geometry,coverage)
      VALUES ($1,$2,$3,$4,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5),4326)),$6::jsonb)`,
    [randomUUID(), releaseId, input.boundaryAuthority, input.boundarySource, JSON.stringify(boundary), input.authoritative === false ? JSON.stringify({
      countryCode: input.countryCode, authoritative: false, coverageBasis: input.coverageBasis,
      coverageVerified: input.coverageVerified, unofficial: input.unofficial, notice: input.notice,
      boundaryAuthority: input.boundaryAuthority, boundarySource: input.boundarySource,
      boundarySha256: input.boundarySha256, provenance: input.provenance, layers: input.layers,
    }) : null]);
    for (const feature of features.features) {
      const inserted = await client.query(`INSERT INTO jenan_map.feature (id,"releaseId",label,category,geometry,search,"sourceId","layerId",aliases)
        SELECT $1,$2,$3,$4,clipped.geometry,to_tsvector('simple',$6),$7,$8,$9::text[]
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($5),4326) AS geometry) g
        JOIN jenan_map.boundary b ON b."releaseId"=$2
        CROSS JOIN LATERAL (SELECT CASE WHEN $10::boolean AND $8 IN ('regions','governorates')
          AND ST_GeometryType(g.geometry) IN ('ST_Polygon','ST_MultiPolygon')
          THEN ST_Multi(ST_CollectionExtract(ST_Intersection(g.geometry,b.geometry),3))
          ELSE g.geometry END AS geometry) clipped
        WHERE ST_IsValid(g.geometry) AND NOT ST_IsEmpty(g.geometry)
          AND ST_IsValid(clipped.geometry) AND NOT ST_IsEmpty(clipped.geometry)
          AND ST_Covers(b.geometry,clipped.geometry)
        RETURNING ST_AsGeoJSON(geometry,15) AS geometry`,
      [randomUUID(), releaseId, feature.properties.label, feature.properties.category, JSON.stringify(feature.geometry),
        [feature.properties.label, ...(feature.properties.aliases ?? [])].join(" "),
        feature.properties.sourceId ?? null, feature.properties.layerId ?? null, feature.properties.aliases ?? [],
        input.clipAdministrativeToBoundary === true]);
      if (inserted.rowCount !== 1) throw new Error("Feature invalid or outside reviewed Saudi boundary");
      // Public geometry and owned search must reflect the same final PostGIS intersection.
      feature.geometry = JSON.parse(inserted.rows[0].geometry);
    }
    await persistArtifact(client, storageRoot, releaseId, featureBytes, "source", false, "features-source.bin");
    await persistArtifact(client, storageRoot, releaseId, boundaryBytes, "source", false, "boundary-source.bin");
    for (const source of sourceFiles) {
      await persistArtifact(client, storageRoot, releaseId, source.bytes, "source", false, `original-${source.level}.bin`);
    }
    await persistArtifact(client, storageRoot, releaseId, Buffer.from(JSON.stringify(features)), "geojson", true, "places.geojson");
    await client.query(`UPDATE jenan_map.release SET status='Ready' WHERE id=$1 AND status='Processing'`, [releaseId]);
    await log(client, actor, releaseId, "build.ready", {
      featureCount: features.features.length, boundaryAuthority: input.boundaryAuthority,
      administrativeClipping: input.clipAdministrativeToBoundary === true ? "PostGIS ST_Intersection with reviewed ADM0; original sources retained privately" : null,
      originalSources: sourceFiles.map(({ level, sha256 }) => ({ level, sha256 })),
    });
    await client.query("COMMIT");
    processing = false;
    console.log(JSON.stringify({ releaseId, status: "Ready", featureCount: features.features.length, reviewRequired: true }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (processing) {
      await client.query("BEGIN");
      await client.query(`UPDATE jenan_map.release SET status='Failed',failure='BUILD_FAILED_OPERATOR_REVIEW_REQUIRED' WHERE id=$1 AND status='Processing'`, [releaseId]);
      await log(client, actor, releaseId, "build.failed", { reason: "BUILD_FAILED_OPERATOR_REVIEW_REQUIRED", retainedFiles: true });
      await client.query("COMMIT");
    }
    throw error;
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  build(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "Build failed");
    process.exitCode = 1;
  });
}
