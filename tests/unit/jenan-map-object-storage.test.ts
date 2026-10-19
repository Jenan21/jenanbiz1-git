import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { assertStorageConfigured, objectStore, openArtifact, resetObjectStoreCache, storageState, storeFailure } from "@/services/jenan-map/storage";
import { MapError, type Artifact } from "@/services/jenan-map/contracts";
import { ObjectStoreError, signRequest } from "../../scripts/jenan-map/s3-store.mjs";
import { credentials, fakeStore, sha } from "./jenan-map-fake-s3";

const RELEASE = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const bytes = Buffer.from("PMTiles-header-then-directory-then-tile-data-0123456789");
const artifact = (over: Partial<Artifact> = {}): Artifact => ({
  id: "a1", releaseId: RELEASE, kind: "pmtiles", filename: "saudi.pmtiles", mime: "application/vnd.pmtiles", publicSafe: true,
  sha256: sha(bytes), storageKey: `${RELEASE}/${sha(bytes)}.pmtiles`, byteSize: BigInt(bytes.length), ...over,
});

describe("shared object storage behind the same artifact handle", () => {
  let fake: ReturnType<typeof fakeStore>;
  const saved = { ...process.env };
  const stored = `jenan-map/${artifact().storageKey}`;
  beforeEach(async () => {
    fake = fakeStore();
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
    Object.assign(process.env, {
      JENAN_MAP_STORAGE_DRIVER: "s3", JENAN_MAP_S3_ENDPOINT: `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`, JENAN_MAP_S3_BUCKET: "jenan-map",
      JENAN_MAP_S3_REGION: "auto", JENAN_MAP_S3_ACCESS_KEY_ID: credentials.accessKeyId, JENAN_MAP_S3_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    });
    delete process.env.JENAN_MAP_STORAGE_ROOT;
    delete process.env.JENAN_MAP_S3_PREFIX;
    await objectStore()!.putBytes(artifact().storageKey, bytes, sha(bytes));
  });
  afterEach(async () => {
    process.env = { ...saved };
    await new Promise((resolve) => fake.server.close(resolve));
  });

  it("is configured without any local storage root, and a broken configuration is a 503, never a silent fallback to disk", () => {
    expect(() => assertStorageConfigured()).not.toThrow();
    process.env.JENAN_MAP_S3_BUCKET = "Bad_Bucket";
    expect(() => objectStore()).toThrow(expect.objectContaining({ code: "INVALID_OBJECT_STORE_CONFIG:bucket", status: 503 }));
    expect(() => assertStorageConfigured()).toThrow(MapError);
  });
  it("serves positional reads, the whole file and byte ranges exactly like a local handle", async () => {
    const handle = await openArtifact(artifact());
    expect(await handle.stat()).toEqual({ size: bytes.length });
    const buffer = Buffer.alloc(16);
    expect((await handle.read(buffer, 0, 7, 0)).bytesRead).toBe(7);
    expect(buffer.subarray(0, 7).toString()).toBe("PMTiles");
    expect((await handle.read(buffer, 2, 100, bytes.length - 4)).bytesRead).toBe(4);
    expect(buffer.subarray(2, 6).toString()).toBe(bytes.subarray(-4).toString());
    expect((await handle.read(buffer, 0, 5, bytes.length)).bytesRead).toBe(0);
    expect(await handle.readFile()).toEqual(bytes);
    const slice: Buffer[] = [];
    for await (const chunk of handle.createReadStream({ start: 5, end: 12 })) slice.push(chunk as Buffer);
    expect(Buffer.concat(slice).toString()).toBe(bytes.subarray(5, 13).toString());
    await handle.close();
  });
  it("refuses an artifact whose size or checksum disagrees with the database record, or that is missing", async () => {
    await expect(openArtifact(artifact({ byteSize: BigInt(bytes.length + 1) }))).rejects.toMatchObject({ code: "ARTIFACT_INTEGRITY_FAILED", status: 503 });
    resetObjectStoreCache();
    fake.objects.set(stored, { body: bytes, sha256: sha("something else") });
    await expect(openArtifact(artifact())).rejects.toMatchObject({ code: "ARTIFACT_INTEGRITY_FAILED" });
    fake.objects.delete(stored);
    await expect(openArtifact(artifact())).rejects.toMatchObject({ code: "ARTIFACT_INTEGRITY_FAILED" });
  });
  it("hashes the whole object when verification is forced, so same-size corruption is caught; an ordinary open trusts the recorded checksum", async () => {
    resetObjectStoreCache();
    fake.objects.set(stored, { body: Buffer.from(bytes.toString().replace("PMTiles", "PMTilez")), sha256: sha(bytes) });
    await expect(openArtifact(artifact())).resolves.toBeDefined();
    await expect(openArtifact(artifact(), true)).rejects.toMatchObject({ code: "ARTIFACT_INTEGRITY_FAILED" });
  });
  it("coalesces concurrent forced verifications into one full read", async () => {
    // The read is held back so every caller finds it in flight, as with a real archive that takes seconds to hash.
    fake.latency.rangeMs = 250;
    const before = fake.seen.filter((item) => item.range).length;
    await Promise.all(Array.from({ length: 8 }, () => openArtifact(artifact(), true)));
    expect(fake.seen.filter((item) => item.range === `bytes=0-${bytes.length - 1}`).length - before).toBe(1);
  });
  it("the fake store itself returns a whole object, and a range of it, byte for byte, whatever bytes it holds", async () => {
    // Every byte value, including those at or above 0x80 that a text encoding would rewrite.
    const everyByte = Buffer.from(Array.from({ length: 256 }, (_, value) => value));
    const key = `${RELEASE}/${sha(everyByte)}.bin`;
    await objectStore()!.putBytes(key, everyByte, sha(everyByte));
    const url = `${process.env.JENAN_MAP_S3_ENDPOINT}/jenan-map/${key}`;
    const read = (headers: Record<string, string> = {}) => fetch(url, { headers: signRequest({ ...credentials, region: "auto", method: "GET", url, headers, now: new Date() }) });
    const whole = await read();
    expect(whole.status).toBe(200);
    expect(Number(whole.headers.get("content-length"))).toBe(everyByte.length);
    expect(Buffer.from(await whole.arrayBuffer()).equals(everyByte)).toBe(true);
    const part = await read({ range: "bytes=120-140" });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).equals(everyByte.subarray(120, 141))).toBe(true);
  });
  it("hashes once a store that records no checksum, then trusts it", async () => {
    resetObjectStoreCache();
    fake.objects.set(stored, { body: bytes, sha256: "" });
    await openArtifact(artifact());
    const full = () => fake.seen.filter((item) => item.range === `bytes=0-${bytes.length - 1}`).length;
    const first = full();
    await openArtifact(artifact());
    expect(full()).toBe(first);
    expect(first).toBeGreaterThanOrEqual(1);
  });
  it("measures storage by listing the bucket and reports it unavailable with wrong credentials", async () => {
    expect(await storageState()).toEqual({ status: "available", configured: true, driver: "s3" });
    process.env.JENAN_MAP_S3_SECRET_ACCESS_KEY = "x".repeat(40);
    expect(await storageState()).toEqual({ status: "unavailable", configured: true, driver: "s3" });
    process.env.JENAN_MAP_S3_BUCKET = "Bad_Bucket";
    expect(await storageState()).toMatchObject({ status: "unavailable", driver: "s3" });
  });
  it("turns store failures into plain MapErrors without store detail", () => {
    expect(() => storeFailure(new ObjectStoreError("OBJECT_STORE_404", 404))).toThrow(expect.objectContaining({ code: "ARTIFACT_INTEGRITY_FAILED" }));
    expect(() => storeFailure(new ObjectStoreError("OBJECT_CONFLICT", 409))).toThrow(expect.objectContaining({ code: "OBJECT_CONFLICT" }));
    expect(() => storeFailure(new TypeError("fetch failed: ECONNREFUSED 10.0.0.5"))).toThrow(expect.objectContaining({ code: "OBJECT_STORE_UNAVAILABLE", status: 503 }));
  });
});
