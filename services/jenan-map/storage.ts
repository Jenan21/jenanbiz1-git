import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import type { Artifact } from "./contracts";
import { MapError } from "./contracts";

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

/** Verify the same open file descriptor that will be streamed; never follow a final symlink. */
export async function openArtifact(artifact: Artifact) {
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
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false, start: 0 })) hash.update(chunk);
    if (hash.digest("hex") !== artifact.sha256) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
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
