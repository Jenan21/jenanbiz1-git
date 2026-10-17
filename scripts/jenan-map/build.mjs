#!/usr/bin/env node
// Run in an operator-controlled background job:
// node --env-file=.env scripts/jenan-map/build.mjs --release UUID --manifest import.json
// No migrations, remote fetches, shell execution, or third-party fallbacks.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

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
    return { type: "Feature", properties: { label: label.trim(), category }, geometry: { type: feature.geometry.type, coordinates: feature.geometry.coordinates } };
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
  if (input.countryCode !== "SA" || input.authoritative !== true || typeof input.boundaryAuthority !== "string" ||
    input.boundaryAuthority.trim().length < 3 || input.boundaryAuthority.length > 1000 ||
    typeof input.boundarySource !== "string" || input.boundarySource.trim().length < 3 || input.boundarySource.length > 2000 ||
    input.confirmation !== "BUILD OWNED SA DATA") throw new Error("Explicit authoritative Saudi boundary provenance and build confirmation required");
  const featureBytes = await readStaged(stagingRoot, input.featuresFile);
  const boundaryBytes = await readStaged(stagingRoot, input.boundaryFile);
  const features = normalizeFeatures(JSON.parse(featureBytes.toString("utf8")));
  const rawBoundary = JSON.parse(boundaryBytes.toString("utf8"));
  const boundary = rawBoundary.type === "Feature" ? rawBoundary.geometry : rawBoundary;
  if (!["Polygon", "MultiPolygon"].includes(boundary?.type) || !validCoordinates(boundary.coordinates)) throw new Error("Authoritative Polygon/MultiPolygon boundary required");
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
    await client.query(`INSERT INTO jenan_map.boundary (id,"releaseId",authority,source,geometry)
      VALUES ($1,$2,$3,$4,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5),4326)))`,
    [randomUUID(), releaseId, input.boundaryAuthority, input.boundarySource, JSON.stringify(boundary)]);
    for (const feature of features.features) {
      const inserted = await client.query(`INSERT INTO jenan_map.feature (id,"releaseId",label,category,geometry,search)
        SELECT $1,$2,$3,$4,g.geometry,to_tsvector('simple',$3)
        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($5),4326) AS geometry) g
        JOIN jenan_map.boundary b ON b."releaseId"=$2
        WHERE ST_IsValid(g.geometry) AND NOT ST_IsEmpty(g.geometry) AND ST_Covers(b.geometry,g.geometry)`,
      [randomUUID(), releaseId, feature.properties.label, feature.properties.category, JSON.stringify(feature.geometry)]);
      if (inserted.rowCount !== 1) throw new Error("Feature invalid or outside authoritative Saudi boundary");
    }
    await persistArtifact(client, storageRoot, releaseId, featureBytes, "source", false, "features-source.bin");
    await persistArtifact(client, storageRoot, releaseId, boundaryBytes, "source", false, "boundary-source.bin");
    await persistArtifact(client, storageRoot, releaseId, Buffer.from(JSON.stringify(features)), "geojson", true, "places.geojson");
    await client.query(`UPDATE jenan_map.release SET status='Ready' WHERE id=$1 AND status='Processing'`, [releaseId]);
    await log(client, actor, releaseId, "build.ready", { featureCount: features.features.length, boundaryAuthority: input.boundaryAuthority });
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
