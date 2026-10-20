import { createHash } from "node:crypto";
import { constants, lstatSync } from "node:fs";
import { access, mkdir, open, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { createS3Store, ObjectStoreError, s3ConfigFromEnv, type S3Store } from "../../scripts/jenan-map/s3-store.mjs";
import type { Artifact } from "./contracts";
import { MapError } from "./contracts";

const verifiedFiles = new Map<string, string>();
const pendingVerification = new Map<string, Promise<void>>();

/** What every consumer of a stored artifact needs; a local file handle and an object-store reader both provide it. */
export type ArtifactHandle = {
  stat(): Promise<{ size: number }>;
  read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }>;
  readFile(): Promise<Buffer>;
  readFile(options: { encoding: BufferEncoding }): Promise<string>;
  createReadStream(options?: { start?: number; end?: number; autoClose?: boolean }): Readable;
  close(): Promise<void>;
};

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
  let store: S3Store | null;
  try { store = objectStore(); } catch { return { status: "unavailable", configured: false, driver: "s3" }; }
  // Object storage is measured by actually listing the bucket with the configured credentials.
  if (store) return { status: (await store.ping()) ? "available" : "unavailable", configured: true, driver: "s3" };
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

let cachedStore: { key: string; store: S3Store } | null = null;

/**
 * The configured S3-compatible store (`JENAN_MAP_STORAGE_DRIVER=s3`), or null when the private filesystem is used. A broken configuration is
 * an operator error reported as 503, never a silent fallback to local disk, which would hide that the shared store is not in use.
 */
export function objectStore(): S3Store | null {
  let config;
  try { config = s3ConfigFromEnv(process.env); }
  catch (error) { throw new MapError(error instanceof ObjectStoreError ? error.message : "OBJECT_STORE_NOT_CONFIGURED", 503); }
  if (!config) { cachedStore = null; return null; }
  const key = JSON.stringify([config.endpoint, config.bucket, config.region, config.prefix, config.pathStyle, config.accessKeyId,
    createHash("sha256").update(config.secretAccessKey).digest("hex").slice(0, 16)]);
  if (cachedStore?.key !== key) { cachedStore = { key, store: createS3Store(config) }; resetObjectStoreCache(); }
  return cachedStore.store;
}

/** Forgets what was learned about stored objects (their size and checksum). Done automatically when the store configuration changes. */
export function resetObjectStoreCache() {
  objectInfo.clear();
  verifiedObjects.clear();
}

/** Both drivers need to be configured before the map can serve; reading this never touches the network. */
export function assertStorageConfigured() {
  if (!objectStore()) storageRoot();
}

/** An object-store failure reaches callers as a MapError, with no store detail in it. */
export function storeFailure(error: unknown): never {
  if (error instanceof MapError) throw error;
  if (error instanceof ObjectStoreError && error.status === 404) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
  throw new MapError(error instanceof ObjectStoreError && error.status === 409 ? "OBJECT_CONFLICT" : "OBJECT_STORE_UNAVAILABLE", 503);
}

/** Reads one stored object through ranged requests; the same shape as a local file handle, so validation and streaming are unchanged. */
class ObjectHandle implements ArtifactHandle {
  constructor(private readonly store: S3Store, private readonly key: string, private readonly size: number) {}
  async stat() { return { size: this.size }; }
  private async bytes(start: number, end: number) {
    const chunks: Buffer[] = [];
    const body = await this.store.range(this.key, start, end).catch(storeFailure);
    for await (const chunk of Readable.fromWeb(body as never) as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  async read(buffer: Buffer, offset: number, length: number, position: number) {
    if (length < 1 || position < 0 || position >= this.size) return { bytesRead: 0 };
    const data = await this.bytes(position, Math.min(position + length, this.size) - 1);
    return { bytesRead: data.copy(buffer, offset, 0, Math.min(data.length, length)) };
  }
  readFile(): Promise<Buffer>;
  readFile(options: { encoding: BufferEncoding }): Promise<string>;
  async readFile(options?: { encoding?: BufferEncoding }): Promise<string | Buffer> {
    const data = await this.bytes(0, this.size - 1);
    return options?.encoding ? data.toString(options.encoding) : data;
  }
  createReadStream(options: { start?: number; end?: number } = {}) {
    const controller = new AbortController();
    const out = new PassThrough();
    // The request is cancelled as soon as the consumer goes away (a closed browser tab), so abandoned ranges do not keep downloading.
    out.once("close", () => controller.abort());
    this.store.range(this.key, options.start ?? 0, options.end ?? this.size - 1, controller.signal).then(
      (body) => { const source = Readable.fromWeb(body as never); source.once("error", (error) => out.destroy(error)); source.pipe(out); },
      (error) => out.destroy(error instanceof MapError ? error : new MapError("OBJECT_STORE_UNAVAILABLE", 503)),
    );
    return out;
  }
  async close() { /* nothing is held open */ }
}

const objectInfo = new Map<string, { size: number; sha256: string | null }>();
const verifiedObjects = new Set<string>();

async function verifyObject(store: S3Store, key: string, sha256: string, size: number) {
  const hash = createHash("sha256");
  const body = await store.range(key, 0, size - 1).catch(storeFailure);
  for await (const chunk of Readable.fromWeb(body as never) as AsyncIterable<Uint8Array>) hash.update(chunk);
  if (hash.digest("hex") !== sha256) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
}

/**
 * Objects are immutable and content-addressed, so size and the checksum recorded at upload are compared with the database record on open
 * (one HEAD per object, then cached). A caller that forces verification (approval, backup) reads and hashes the whole object, coalesced
 * across concurrent callers like the local adapter; a store that returned no checksum metadata is hashed once instead.
 */
async function openObjectArtifact(store: S3Store, artifact: Artifact, forceVerification: boolean): Promise<ArtifactHandle> {
  const key = safeStorageKey(artifact.storageKey);
  const size = Number(artifact.byteSize);
  if (!Number.isSafeInteger(size) || size < 1) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
  const cacheKey = `${key}:${artifact.sha256}`;
  let info = objectInfo.get(cacheKey);
  if (!info) {
    const found = await store.head(key).catch(storeFailure);
    if (!found) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
    info = { size: found.size, sha256: found.sha256 };
  }
  if (info.size !== size || (info.sha256 !== null && info.sha256 !== artifact.sha256)) throw new MapError("ARTIFACT_INTEGRITY_FAILED", 503);
  if (forceVerification || (info.sha256 === null && !verifiedObjects.has(cacheKey))) {
    let verification = pendingVerification.get(cacheKey);
    if (!verification) {
      verification = verifyObject(store, key, artifact.sha256, size);
      pendingVerification.set(cacheKey, verification);
    }
    try { await verification; } finally { if (pendingVerification.get(cacheKey) === verification) pendingVerification.delete(cacheKey); }
    if (verifiedObjects.size >= 128) verifiedObjects.delete(verifiedObjects.values().next().value!);
    verifiedObjects.add(cacheKey);
  }
  if (objectInfo.size >= 512) objectInfo.delete(objectInfo.keys().next().value!);
  objectInfo.set(cacheKey, info);
  return new ObjectHandle(store, key, size);
}

/** Where an upload is staged before validation (private local scratch; never the shared store) and how it is placed afterwards. */
export async function scratchDirectory() {
  const directory = path.join(process.env.JENAN_MAP_SCRATCH_ROOT?.trim() || os.tmpdir(), "jenan-map-uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await realpath(directory);
  await assertPrivateDirectory(resolved, "PRIVATE_STORAGE_REQUIRED");
  return resolved;
}

/** Verify the same open file descriptor that will be streamed; never follow a final symlink. */
export async function openArtifact(artifact: Artifact, forceVerification = false): Promise<ArtifactHandle> {
  const store = objectStore();
  return store ? openObjectArtifact(store, artifact, forceVerification) : openLocalArtifact(artifact, forceVerification);
}

async function openLocalArtifact(artifact: Artifact, forceVerification: boolean) {
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
