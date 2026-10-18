import { createHash } from "node:crypto";
import { constants, lstatSync } from "node:fs";
import { access, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Artifact } from "./contracts";
import { MapError } from "./contracts";

const verifiedFiles = new Map<string, string>();
const pendingVerification = new Map<string, Promise<void>>();

/** Windows has no O_NOFOLLOW; there a final symlink is refused with an lstat check before the open instead. */
export const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export async function openNoFollow(target: string, flags: number, mode?: number) {
  // Synchronous on purpose: it adds no await point, so concurrent callers keep the same interleaving as on POSIX.
  if (!NO_FOLLOW && lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new MapError("INVALID_STORAGE_KEY", 503);
  return open(target, flags | NO_FOLLOW, mode);
}

/**
 * Storage and staging directories must not be readable by other accounts. POSIX permission bits carry that guarantee on Linux and
 * macOS (where production runs); Windows reports fixed modes, so there the check applies only outside production.
 */
export async function assertPrivateDirectory(directory: string, code: "PRIVATE_STORAGE_REQUIRED" | "PRIVATE_STAGING_REQUIRED") {
  const insecure = process.platform === "win32" ? process.env.NODE_ENV === "production" : ((await stat(directory)).mode & 0o077) !== 0;
  if (insecure) throw new MapError(code, 503);
}

/** Flushes a directory entry to disk; Windows cannot open a directory as a file, and NTFS journals the link itself. */
export async function syncDirectory(directory: string) {
  if (process.platform === "win32") return;
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}

export function storageRoot() {
  const root = process.env.JENAN_MAP_STORAGE_ROOT?.trim();
  if (!root || !path.isAbsolute(root)) throw new MapError("PRIVATE_STORAGE_NOT_CONFIGURED", 503);
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(root);
  if (resolved === publicRoot || resolved.startsWith(publicRoot + path.sep)) throw new MapError("PRIVATE_STORAGE_REQUIRED", 503);
  return resolved;
}

export function safeStorageKey(key: string) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9]{64}\.(geojson|json|pmtiles|bin)$/.test(key)) throw new MapError("INVALID_STORAGE_KEY", 503);
  return key;
}

const downloadTypes: Record<string, string> = {
  geojson: "application/geo+json", json: "application/json",
  pmtiles: "application/vnd.pmtiles", pbf: "application/x-protobuf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", avif: "image/avif", bin: "application/octet-stream",
};

export function downloadMetadata(artifact: Pick<Artifact, "id" | "filename" | "kind" | "mime">) {
  const requested = path.basename(artifact.filename);
  const suffix = path.extname(requested).slice(1).toLowerCase();
  const mimeExtension: Record<string, string> = {
    "application/x-protobuf": "pbf", "application/vnd.mapbox-vector-tile": "pbf",
    "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif",
  };
  const kindExtension: Record<string, string> = { geojson: "geojson", style: "json", pmtiles: "pmtiles" };
  const extension = downloadTypes[suffix] ? suffix : mimeExtension[artifact.mime] ??
    (kindExtension[artifact.kind] ?? "bin");
  const basename = requested.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+/, "").slice(0, 140) || artifact.id;
  return { filename: `${basename}.${extension}`, mime: downloadTypes[extension] };
}

const logicalNames: Record<string, RegExp> = {
  glyphs: /^[^/\\]{1,150}\/\d+-\d+\.pbf$/,
  sprite: /^sprite(@\d+x)?\.(json|png)$/,
  pmtiles: /^[A-Za-z0-9][A-Za-z0-9._-]{0,139}\.pmtiles$/,
};

/** The name the style and the portable manifest refer to; a safe download name would rewrite `sprite@2x.png` or dotted PMTiles names. */
export function logicalFilename(artifact: Pick<Artifact, "id" | "filename" | "kind" | "mime">) {
  return logicalNames[artifact.kind]?.test(artifact.filename) ? artifact.filename : downloadMetadata(artifact).filename;
}

export async function storageState() {
  const configured = Boolean(process.env.JENAN_MAP_STORAGE_ROOT?.trim());
  try {
    const root = await realpath(storageRoot());
    const publicRoot = await realpath(path.resolve(process.cwd(), "public")).catch(() => path.resolve(process.cwd(), "public"));
    if (root === publicRoot || root.startsWith(publicRoot + path.sep) || !(await stat(root)).isDirectory()) {
      return { status: "unavailable", configured };
    }
    await access(root, constants.R_OK);
    return { status: "available", configured };
  } catch {
    return { status: "unavailable", configured };
  }
}

/** Verify the same open file descriptor that will be streamed; never follow a final symlink. */
export async function openArtifact(artifact: Artifact, forceVerification = false) {
  const root = await realpath(storageRoot());
  const publicRoot = await realpath(path.resolve(process.cwd(), "public")).catch(() => path.resolve(process.cwd(), "public"));
  if (root === publicRoot || root.startsWith(publicRoot + path.sep)) throw new MapError("PRIVATE_STORAGE_REQUIRED", 503);
  const target = path.join(root, safeStorageKey(artifact.storageKey));
  const parent = await realpath(path.dirname(target));
  if (!parent.startsWith(root + path.sep)) throw new MapError("INVALID_STORAGE_KEY", 503);
  const handle = await openNoFollow(target, constants.O_RDONLY);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || BigInt(stat.size) !== artifact.byteSize) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
    const key = `${root}/${artifact.storageKey}:${artifact.sha256}`;
    const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (forceVerification || verifiedFiles.get(key) !== identity) {
      const pendingKey = `${key}:${identity}`;
      let verification = pendingVerification.get(pendingKey);
      if (!verification) {
        verification = (async () => {
          const hash = createHash("sha256");
          for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) hash.update(chunk);
          const after = await handle.stat();
          if (hash.digest("hex") !== artifact.sha256 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
            verifiedFiles.delete(key);
            throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
          }
          if (verifiedFiles.size >= 128) verifiedFiles.delete(verifiedFiles.keys().next().value!);
          verifiedFiles.set(key, identity);
        })();
        pendingVerification.set(pendingKey, verification);
      }
      try { await verification; }
      finally { if (pendingVerification.get(pendingKey) === verification) pendingVerification.delete(pendingKey); }
      const after = await handle.stat();
      if (`${after.dev}:${after.ino}:${after.size}:${after.mtimeMs}:${after.ctimeMs}` !== identity) {
        throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
      }
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export function byteRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1) throw new MapError("RANGE_NOT_SATISFIABLE", 416);
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) throw new MapError("RANGE_NOT_SATISFIABLE", 416);
  return { start, end };
}
