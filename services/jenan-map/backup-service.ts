import path from "node:path";
import { mkdir, readdir, stat } from "node:fs/promises";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MapError } from "./contracts";
import { ownershipOf, type BackupArtifact, type BackupInput } from "./backup";
import { validateBackupDirectory, writeBackup } from "./backup-files";
import { audit, artifacts, releaseById, runtime } from "./service";
import { openArtifact } from "./storage";

const sql = Prisma.sql;

/** Backups live beside, never inside, the map storage and the public folder. */
export function backupRoot() {
  const root = process.env.JENAN_MAP_BACKUP_ROOT?.trim();
  if (!root || !path.isAbsolute(root)) throw new MapError("BACKUP_ROOT_NOT_CONFIGURED", 503);
  const resolved = path.resolve(root), publicRoot = path.resolve(process.cwd(), "public");
  const storage = process.env.JENAN_MAP_STORAGE_ROOT?.trim();
  if (resolved === publicRoot || resolved.startsWith(publicRoot + path.sep)) throw new MapError("PRIVATE_BACKUP_ROOT_REQUIRED", 503);
  if (storage && (resolved === path.resolve(storage) || resolved.startsWith(path.resolve(storage) + path.sep))) throw new MapError("PRIVATE_BACKUP_ROOT_REQUIRED", 503);
  return resolved;
}

export function backupFolderName(version: string, releaseId: string, now = new Date()) {
  const stamp = now.toISOString().replaceAll(/[-:]/g, "").slice(0, 15);
  return `jenan-map-${version.replaceAll(/[^A-Za-z0-9._-]/g, "_").slice(0, 40)}-${releaseId.slice(0, 8)}-${stamp}`;
}

/** Everything a restore needs about one release, read from the database in one pass. */
export async function backupInputFor(releaseId: string, actor: string): Promise<BackupInput> {
  const release = await releaseById(releaseId);
  const files = await artifacts(releaseId);
  const state = await runtime();
  const layers = await db.$queryRaw<Array<{ id: string; label: string; styleLayerIds: string[] | null; visibility: string; status: string; provenance: unknown }>>(sql`
    SELECT l.id, l.label, rl."styleLayerIds", rl.visibility, rl.status, rl.provenance
    FROM jenan_map.release_layer rl JOIN jenan_map.layer l ON l.id = rl."layerId"
    WHERE rl."releaseId" = ${releaseId}::uuid ORDER BY l.id`);
  const backupArtifacts: BackupArtifact[] = files.filter((file) => file.kind !== "source").map((file) => ({
    id: file.id, kind: file.kind, filename: file.filename, mime: file.mime, sha256: file.sha256, byteSize: Number(file.byteSize),
    publicSafe: file.publicSafe, exportAllowed: file.exportAllowed === true, exportLicense: file.exportLicense ?? null,
    // Jenan's own styles carry no third-party licence; tiles and data follow the licence recorded for them.
    ownership: ownershipOf({ license: file.kind === "style" ? "" : file.exportLicense ?? release.license, author: file.kind === "style" ? "jenan" : null }),
  }));
  const seen = new Map<string, BackupInput["sources"][number]>();
  seen.set(release.source, { name: release.source, url: release.source.startsWith("http") ? release.source : "https://www.openstreetmap.org/copyright", license: release.license, ownership: ownershipOf({ license: release.license }) });
  for (const layer of layers) {
    const p = layer.provenance as { source?: string; url?: string; license?: string; attribution?: string } | null;
    if (p?.source) seen.set(p.source, { name: p.source, url: p.url ?? "", license: p.license ?? "", ownership: ownershipOf({ license: p.license }), attribution: p.attribution });
  }
  seen.set("Jenan PRO Map styles and design", { name: "Jenan PRO Map styles and design", url: "https://jenanpro.sa", license: "", ownership: "JENAN_OWNED" });
  return {
    release: { id: release.id, version: release.version, status: release.status, source: release.source, sourceDate: new Date(release.sourceDate).toISOString(), license: release.license, publishedAt: release.publishedAt ? new Date(release.publishedAt).toISOString() : null },
    artifacts: backupArtifacts,
    layers: layers.map((layer) => ({ id: layer.id, label: layer.label, styleLayerIds: layer.styleLayerIds ?? [], visibility: layer.visibility, status: layer.status, provenance: layer.provenance })),
    runtime: { status: state.status, maintenanceMessage: state.maintenanceMessage, publishedReleaseId: state.publishedReleaseId, revision: state.revision },
    sources: [...seen.values()], createdAt: new Date().toISOString(), createdBy: actor,
  };
}

/** Creates a full backup of one release in a new folder and records the action; it changes nothing that customers see. */
export async function createFullBackup(releaseId: string, actor: string) {
  const root = backupRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  const input = await backupInputFor(releaseId, actor);
  const name = backupFolderName(input.release.version, releaseId);
  const byId = new Map((await artifacts(releaseId)).map((file) => [file.id, file]));
  const written = await writeBackup(path.join(root, name), input, async (item) => {
    const file = byId.get(item.id);
    if (!file) throw new MapError("ARTIFACT_NOT_FOUND", 404);
    const handle = await openArtifact(file, true);
    return handle.createReadStream({ autoClose: true, start: 0 });
  });
  await db.$transaction((tx) => audit(tx, actor, "backup.created", releaseId, { folder: name, digest: written.digest, artifacts: written.artifacts }));
  return { folder: name, digest: written.digest, artifacts: written.artifacts, releaseId, mapVersion: input.release.version };
}

export async function listBackups() {
  const root = backupRoot();
  const names = await readdir(root).catch(() => [] as string[]);
  const out: Array<{ folder: string; modifiedAt: string }> = [];
  for (const name of names) {
    const info = await stat(path.join(root, name)).catch(() => null);
    if (info?.isDirectory() && !name.endsWith(".partial")) out.push({ folder: name, modifiedAt: info.mtime.toISOString() });
  }
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/**
 * Restore, step 1: prove a backup is complete and intact. It never imports anything and never touches the published map; a
 * restore continues only as a new unreviewed candidate through the normal Validate → Preview → Approve → Publish path.
 */
export async function validateBackupFolder(folder: string, actor: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(folder) || folder.endsWith(".partial")) throw new MapError("INVALID_BACKUP_NAME", 400);
  const verdict = await validateBackupDirectory(path.join(backupRoot(), folder), { requireStyleMatchesTiles: false });
  await db.$transaction((tx) => audit(tx, actor, "backup.validated", null, { folder, ok: verdict.ok, problems: verdict.problems.map((p) => p.code) }));
  return { folder, ok: verdict.ok, problems: verdict.problems, mapVersion: verdict.manifest?.mapVersion ?? null, dataVersion: verdict.manifest?.dataVersion ?? null,
    nextStep: verdict.ok ? "Import as a new unreviewed candidate, then Preview → Approve → Publish. Production is not modified by validation." : "Fix or discard this backup." };
}