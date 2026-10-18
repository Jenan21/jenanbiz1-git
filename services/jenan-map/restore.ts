import { createHash, randomUUID } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CLIP_TOLERANCE_DEGREES } from "../../scripts/jenan-map/open-data.mjs";
import { validateBackupDirectory } from "./backup-files";
import { asBackupError, backupRoot } from "./backup-service";
import { MapError } from "./contracts";
import { importSchema, ingestArtifact } from "./ingestion";
import { bindLayersSchema, ingestLayerBindings } from "./layer-ingestion";
import { audit, command } from "./service";
import { assertPrivateDirectory, openNoFollow, storageRoot } from "./storage";
import { releaseAssetBase } from "./validation";

const sql = Prisma.sql;
const MAX_FEATURES = 100_000;
const MAX_STAGED_BYTES = 128 * 1024 * 1024;
const BACKUP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
export const RESTORE_CONFIRMATION = "RESTORE AS NEW CANDIDATE";
export const restoreSchema = z.object({ action: z.literal("restore"), folder: z.string().min(1).max(220), confirmation: z.literal(RESTORE_CONFIRMATION) }).strict();

/** A restored release gets its own version name, so restoring never collides with (or overwrites) the release it came from. */
export function restoredVersion(version: string, releaseId: string, now = new Date()) {
  const suffix = `-restored-${now.toISOString().replaceAll(/\D/g, "").slice(0, 14)}-${releaseId.slice(0, 4)}`;
  const base = version.replaceAll(/[^A-Za-z0-9._-]/g, "_").replace(/^[^A-Za-z0-9]+/, "") || "map";
  return `${base.slice(0, 80 - suffix.length)}${suffix}`;
}

/** A style names its own release in every asset URL; a restored copy must point at the new release, never at the original. */
export function rewriteReleaseBase(text: string, fromReleaseId: string, toReleaseId: string) {
  const rewritten = text.replaceAll(releaseAssetBase(fromReleaseId), releaseAssetBase(toReleaseId));
  if (rewritten.includes(fromReleaseId)) throw new MapError("STYLE_REFERENCES_OTHER_RELEASE", 422);
  return rewritten;
}

type Entry = {
  id: string; kind: string; filename: string; mime: string; sha256: string; byteSize: number;
  publicSafe: boolean; exportAllowed: boolean; exportLicense: string | null; file: string;
};
type Feature = { type?: string; properties?: { label?: unknown }; geometry?: unknown };

function parseJson(bytes: Buffer, code: string) {
  try { return JSON.parse(bytes.toString("utf8")); } catch { throw new MapError(code, 422); }
}

/** One open descriptor for both the size check and the read, so the file cannot change between them; a symbolic link is refused. */
async function readStaged(file: string) {
  const handle = await openNoFollow(file, constants.O_RDONLY);
  try {
    if ((await handle.stat()).size > MAX_STAGED_BYTES) throw new MapError("BACKUP_FILE_TOO_LARGE", 422);
    return await handle.readFile();
  } finally { await handle.close(); }
}

/** Writes bytes the build job produced (features, boundary and original sources) into the release's immutable storage, then records them. */
async function persistTrusted(tx: Prisma.TransactionClient, releaseId: string, entry: Entry, bytes: Buffer) {
  const root = await realpath(storageRoot());
  await assertPrivateDirectory(root, "PRIVATE_STORAGE_REQUIRED");
  const folder = path.join(root, releaseId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  if (await realpath(folder) !== folder) throw new MapError("INVALID_STORAGE_KEY", 503);
  const storageKey = `${releaseId}/${entry.sha256}.${entry.kind === "geojson" ? "geojson" : "bin"}`;
  const target = path.join(root, storageKey);
  const handle = await openNoFollow(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await chmod(target, 0o400);
  await tx.$executeRaw(sql`INSERT INTO jenan_map.artifact (id,"releaseId",kind,"storageKey",filename,mime,sha256,"byteSize","publicSafe","exportAllowed","exportLicense")
    VALUES (${randomUUID()}::uuid,${releaseId}::uuid,${entry.kind},${storageKey},${entry.filename},${entry.mime},${entry.sha256},${bytes.length},${entry.publicSafe},${entry.exportAllowed},${entry.exportAllowed ? entry.exportLicense : null})`);
}

function verified(bytes: Buffer, entry: Entry) {
  if (bytes.length !== entry.byteSize || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new MapError("BACKUP_ARTIFACT_CHANGED", 422);
  return bytes;
}

async function markFailed(releaseId: string, actor: string, error: unknown) {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(sql`UPDATE jenan_map.release SET status='Failed', failure='RESTORE_FAILED_OPERATOR_REVIEW_REQUIRED'
      WHERE id=${releaseId}::uuid AND status IN ('Processing','Ready')`);
    await audit(tx, actor, "backup.restore_failed", releaseId, { reason: error instanceof MapError ? error.code : "RESTORE_FAILED" });
  }).catch(() => undefined);
}

/**
 * Restore: turns a validated backup folder into a NEW unreviewed candidate release (Ready, never Approved or Published).
 * Nothing here touches the published release or the runtime pointer; the candidate then goes through the normal
 * Preview → Approve → Publish path, each step needing an explicit administrator confirmation.
 */
export async function restoreBackupAsCandidate(folder: string, actor: string) {
  if (!BACKUP_NAME.test(folder) || folder.endsWith(".partial")) throw new MapError("INVALID_BACKUP_NAME", 400);
  const directory = path.join(backupRoot(), folder);
  const verdict = await validateBackupDirectory(directory, { requireStyleMatchesTiles: true }).catch(asBackupError);
  const manifest = verdict.manifest;
  if (!verdict.ok || !manifest) throw new MapError("BACKUP_INVALID", 422);
  const entries: Entry[] = manifest.artifacts;
  const features = entries.find((entry) => entry.kind === "geojson");
  const boundary = entries.find((entry) => entry.kind === "source" && entry.filename === "boundary-source.bin");
  const coverage = entries.find((entry) => entry.kind === "coverage");
  if (!features || !boundary || !coverage) throw new MapError("BACKUP_NOT_RESTORABLE", 422);

  const collection = parseJson(verified(await readStaged(path.join(directory, features.file)), features), "BACKUP_FEATURES_INVALID") as { features?: Feature[] };
  const rows = collection.features;
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_FEATURES || rows.some((row) => row?.type !== "Feature" || typeof row.properties?.label !== "string" || !row.geometry)) {
    throw new MapError("BACKUP_FEATURES_INVALID", 422);
  }
  const rawBoundary = parseJson(verified(await readStaged(path.join(directory, boundary.file)), boundary), "BACKUP_COVERAGE_INVALID");
  const boundaryGeometry = rawBoundary?.type === "Feature" ? rawBoundary.geometry : rawBoundary;
  const evidence = parseJson(verified(await readStaged(path.join(directory, coverage.file)), coverage), "BACKUP_COVERAGE_INVALID") as Record<string, unknown>;
  if (typeof evidence.boundaryAuthority !== "string" || typeof evidence.boundarySource !== "string") throw new MapError("BACKUP_COVERAGE_INVALID", 422);

  const version = restoredVersion(manifest.mapVersion, manifest.release.id);
  const created = await command({
    action: "create", version, source: `${manifest.release.source} (restored from backup ${folder})`.slice(0, 1000),
    sourceDate: manifest.release.sourceDate, license: manifest.release.license,
  }, actor) as { id: string };
  const releaseId = created.id;

  try {
    await db.$transaction(async (tx) => {
      const claimed = await tx.$executeRaw(sql`UPDATE jenan_map.release SET status='Processing' WHERE id=${releaseId}::uuid AND status='Draft'`);
      if (claimed !== 1) throw new MapError("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
      await audit(tx, actor, "backup.restore_started", releaseId, { folder, sourceReleaseId: manifest.release.id });
    });

    await db.$transaction(async (tx) => {
      await tx.$executeRaw(sql`INSERT INTO jenan_map.boundary (id,"releaseId",authority,source,geometry,coverage)
        VALUES (${randomUUID()}::uuid,${releaseId}::uuid,${evidence.boundaryAuthority as string},${evidence.boundarySource as string},
          ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(boundaryGeometry)}),4326)),
          ${evidence.authoritative === false ? JSON.stringify(evidence) : null}::jsonb)`);
      // Set-based: every feature must still be valid and inside the restored boundary (clipped administrative polygons within the shared tolerance).
      // The widened boundary is computed once (MATERIALIZED), not per feature.
      const inserted = await tx.$executeRaw(sql`WITH b AS MATERIALIZED (
          SELECT geometry, ST_Buffer(geometry, ${CLIP_TOLERANCE_DEGREES}::float8) AS widened FROM jenan_map.boundary WHERE "releaseId" = ${releaseId}::uuid)
        INSERT INTO jenan_map.feature (id,"releaseId",label,category,geometry,search,"sourceId","layerId",aliases)
        SELECT gen_random_uuid(), ${releaseId}::uuid, p.label, p.category, p.geometry,
          to_tsvector('simple', array_to_string(ARRAY[p.label] || p.aliases, ' ')), p."sourceId", p."layerId", p.aliases
        FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) AS e(f)
        CROSS JOIN LATERAL (SELECT e.f->'properties'->>'label' AS label, COALESCE(e.f->'properties'->>'category', e.f->'properties'->>'layerId', 'place') AS category,
          e.f->'properties'->>'sourceId' AS "sourceId", e.f->'properties'->>'layerId' AS "layerId",
          ARRAY(SELECT jsonb_array_elements_text(COALESCE(e.f->'properties'->'aliases', '[]'::jsonb))) AS aliases,
          ST_SetSRID(ST_GeomFromGeoJSON((e.f->'geometry')::text), 4326) AS geometry) p
        CROSS JOIN b
        WHERE ST_IsValid(p.geometry) AND NOT ST_IsEmpty(p.geometry)
          AND ST_Covers(CASE WHEN p."layerId" IN ('regions','governorates') THEN b.widened ELSE b.geometry END, p.geometry)`);
      if (inserted !== rows.length) throw new MapError("BACKUP_FEATURES_OUTSIDE_BOUNDARY", 422);
      for (const entry of entries.filter((item) => item.kind === "source" || item.kind === "geojson")) {
        await persistTrusted(tx, releaseId, entry, verified(await readStaged(path.join(directory, entry.file)), entry));
      }
      await tx.$executeRaw(sql`UPDATE jenan_map.release SET status='Ready' WHERE id=${releaseId}::uuid AND status='Processing'`);
      await audit(tx, actor, "backup.restore_rows", releaseId, { folder, features: inserted });
    }, { isolationLevel: "Serializable", timeout: 600_000, maxWait: 15_000 });

    // The rest goes through the same validated import path as any administrator upload (format checks, checksums, immutability).
    for (const entry of entries.filter((item) => !["source", "geojson"].includes(item.kind))) {
      const source = path.join(directory, entry.file);
      let stream: Readable, sha256 = entry.sha256, byteSize = entry.byteSize;
      if (entry.kind === "style") {
        const bytes = Buffer.from(rewriteReleaseBase(verified(await readStaged(source), entry).toString("utf8"), manifest.release.id, releaseId));
        stream = Readable.from([bytes]); sha256 = createHash("sha256").update(bytes).digest("hex"); byteSize = bytes.length;
      } else stream = createReadStream(source);
      const metadata = importSchema.safeParse({ kind: entry.kind, filename: entry.filename, sha256, byteSize, publicSafe: entry.publicSafe,
        exportAllowed: entry.exportAllowed, ...(entry.exportAllowed && entry.exportLicense ? { exportLicense: entry.exportLicense } : {}), confirmation: "IMPORT OWNED MAP ARTIFACT" });
      if (!metadata.success) { stream.destroy(); throw new MapError("BACKUP_ENTRY_INVALID", 422); }
      await ingestArtifact(releaseId, metadata.data, stream, actor);
    }

    const layers = manifest.configuration.layers;
    for (const layer of layers) {
      const label = typeof layer.label === "string" && layer.label.trim() ? layer.label.trim().slice(0, 120) : layer.id;
      await db.$executeRaw(sql`INSERT INTO jenan_map.layer (id,label) VALUES (${layer.id},${label}) ON CONFLICT (id) DO NOTHING`);
    }
    const bindings = bindLayersSchema.safeParse({
      layers: layers.map((layer) => ({ id: layer.id, styleLayerIds: layer.styleLayerIds, searchCategories: layer.searchCategories, visibility: layer.visibility,
        confidence: layer.confidence, provenance: layer.provenance ?? undefined })),
      confirmation: "BIND MAP LAYERS",
    });
    if (!bindings.success) throw new MapError("BACKUP_LAYERS_INVALID", 422);
    await ingestLayerBindings(releaseId, bindings.data, actor);
    await db.$transaction((tx) => audit(tx, actor, "backup.restored", releaseId, { folder, sourceReleaseId: manifest.release.id, artifacts: entries.length, features: rows.length }));
  } catch (error) {
    await markFailed(releaseId, actor, error);
    throw error;
  }
  return {
    releaseId, version, folder, status: "Ready" as const,
    features: rows.length, artifacts: entries.length, reviewRequired: true,
    nextStep: "Preview → Approve → Publish. Nothing was published; production is unchanged.",
  };
}
