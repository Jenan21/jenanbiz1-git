import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Artifact } from "./contracts";
import { MapError } from "./contracts";

const verifiedFiles = new Map<string, string>();

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
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || BigInt(stat.size) !== artifact.byteSize) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
    const key = `${root}/${artifact.storageKey}:${artifact.sha256}`;
    const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    if (forceVerification || verifiedFiles.get(key) !== identity) {
      const hash = createHash("sha256");
      for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) hash.update(chunk);
      const after = await handle.stat();
      if (hash.digest("hex") !== artifact.sha256 || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
        verifiedFiles.delete(key);
        throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
      }
      if (verifiedFiles.size >= 128) verifiedFiles.delete(verifiedFiles.keys().next().value!);
      verifiedFiles.set(key, identity);
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
