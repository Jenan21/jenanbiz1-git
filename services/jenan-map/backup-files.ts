import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { backupFileName, buildBackupManifest, validateBackup, type BackupFile, type BackupInput } from "./backup";

async function hashFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Writes a full backup into a NEW folder (never into an existing one) and checks every file after writing it.
 * `open` returns a read stream for an artifact; the caller supplies it so any storage adapter works.
 */
export async function writeBackup(directory: string, input: BackupInput, open: (artifact: BackupInput["artifacts"][number]) => Promise<Readable>) {
  const target = path.resolve(directory), partial = `${target}.partial`;
  await rm(partial, { recursive: true, force: true });
  await stat(target).then(() => { throw new Error("BACKUP_FOLDER_EXISTS"); }, () => undefined);
  const built = buildBackupManifest(input);
  await mkdir(path.join(partial, "artifacts"), { recursive: true, mode: 0o700 });
  try {
    for (const artifact of input.artifacts) {
      const file = path.join(partial, backupFileName(artifact.sha256));
      await pipeline(await open(artifact), createWriteStream(file, { flags: "wx", mode: 0o600 }));
      if (await hashFile(file) !== artifact.sha256 || (await stat(file)).size !== artifact.byteSize) throw new Error(`BACKUP_ARTIFACT_CHANGED:${artifact.filename}`);
    }
    await writeFile(path.join(partial, "manifest.json"), built.text, { flag: "wx", mode: 0o600 });
    await writeFile(path.join(partial, "manifest.sha256"), built.digest + "\n", { flag: "wx", mode: 0o600 });
    const verdict = await validateBackupDirectory(partial);
    if (!verdict.ok) throw new Error(`BACKUP_VERIFICATION_FAILED:${verdict.problems.map((p) => p.code).join(",")}`);
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { recursive: true, force: true });
    throw error;
  }
  return { directory: target, digest: built.digest, artifacts: input.artifacts.length };
}

/** Reads a backup folder (streaming the large files) and validates it. */
export async function validateBackupDirectory(directory: string, options: { requireStyleMatchesTiles?: boolean } = {}) {
  const root = path.resolve(directory);
  const files = new Map<string, BackupFile>();
  const small = new Set(["manifest.json", "manifest.sha256"]);
  const walk = async (relative: string) => {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`BACKUP_SYMLINK_REFUSED:${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) {
        const full = path.join(root, name), info = await stat(full);
        const bytes = small.has(name) || info.size < 8 * 1024 * 1024 && name.startsWith("artifacts/") ? await (async () => {
          const chunks: Buffer[] = []; for await (const chunk of createReadStream(full)) chunks.push(chunk as Buffer); return Buffer.concat(chunks);
        })() : undefined;
        files.set(name, { size: info.size, sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : await hashFile(full), bytes });
      }
    }
  };
  await walk("");
  return validateBackup(files, options);
}
