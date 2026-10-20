import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createS3Store, ObjectStoreError, s3ConfigFromEnv, signRequest } from "../../scripts/jenan-map/s3-store.mjs";
import { credentials, fakeStore, sha } from "./jenan-map-fake-s3";

const signature = (headers: Record<string, string>) => headers.authorization.split("Signature=")[1];

describe("AWS Signature Version 4", () => {
  // Published AWS signature test-suite cases (service "service", 2015-08-30T12:36:00Z); the expected values were also reproduced with an
  // independent implementation.
  const vector = { ...credentials, service: "service", now: new Date("2015-08-30T12:36:00Z") };
  it("matches the AWS get-vanilla vector", () => {
    const headers = signRequest({ ...vector, method: "GET", url: "https://example.amazonaws.com/" });
    expect(headers.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
  });
  it("sorts query parameters before signing (get-vanilla-query-order-key-case)", () => {
    expect(signature(signRequest({ ...vector, method: "GET", url: "https://example.amazonaws.com/?Param2=value2&Param1=value1" })))
      .toBe("b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500");
  });
  it("for S3 also signs the payload hash and any x-amz-meta header, and leaves range and length unsigned", () => {
    const headers = signRequest({ ...credentials, method: "PUT", url: "https://r2.example/bucket/key", headers: { range: "bytes=0-1", "content-length": "5", "x-amz-meta-sha256": "ab" }, payloadHash: sha("x"), now: new Date("2026-10-18T10:00:00Z") });
    expect(headers["x-amz-content-sha256"]).toBe(sha("x"));
    expect(headers.authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-meta-sha256,");
  });
});

describe("object-store settings", () => {
  const good = { JENAN_MAP_STORAGE_DRIVER: "s3", JENAN_MAP_S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com", JENAN_MAP_S3_BUCKET: "jenan-map", JENAN_MAP_S3_ACCESS_KEY_ID: "AKIAEXAMPLE1234", JENAN_MAP_S3_SECRET_ACCESS_KEY: "s".repeat(32) };
  it("keeps the filesystem driver when nothing is selected", () => {
    expect(s3ConfigFromEnv({})).toBeNull();
    expect(s3ConfigFromEnv({ JENAN_MAP_STORAGE_DRIVER: "filesystem" })).toBeNull();
  });
  it("accepts a complete configuration and defaults to region auto and path style", () => {
    expect(s3ConfigFromEnv(good)).toMatchObject({ endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "jenan-map", region: "auto", prefix: "", pathStyle: true });
    expect(s3ConfigFromEnv({ ...good, JENAN_MAP_S3_PREFIX: "prod/maps/", JENAN_MAP_S3_PATH_STYLE: "0", JENAN_MAP_S3_REGION: "me-south-1" })).toMatchObject({ prefix: "prod/maps/", pathStyle: false, region: "me-south-1" });
  });
  it.each([
    ["endpoint", { JENAN_MAP_S3_ENDPOINT: "http://store.example.com" }], ["endpoint", { JENAN_MAP_S3_ENDPOINT: "https://user:pw@store.example.com" }],
    ["endpoint", { JENAN_MAP_S3_ENDPOINT: "not a url" }], ["bucket", { JENAN_MAP_S3_BUCKET: "Bad_Bucket" }], ["bucket", { JENAN_MAP_S3_BUCKET: "a..b" }],
    ["region", { JENAN_MAP_S3_REGION: "../x" }], ["accessKeyId", { JENAN_MAP_S3_ACCESS_KEY_ID: "short" }], ["secretAccessKey", { JENAN_MAP_S3_SECRET_ACCESS_KEY: "has space in it and is long enough" }],
    ["prefix", { JENAN_MAP_S3_PREFIX: "../evil/" }], ["prefix", { JENAN_MAP_S3_PREFIX: "no-trailing-slash" }],
  ])("refuses an invalid %s and never echoes a secret", (field, override) => {
    try { s3ConfigFromEnv({ ...good, ...override }); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(ObjectStoreError);
      expect((error as Error).message).toBe(`INVALID_OBJECT_STORE_CONFIG:${field}`);
      expect((error as Error).message).not.toContain("sssss");
    }
  });
  it("allows plain HTTP only to a loopback test server", () => {
    expect(s3ConfigFromEnv({ ...good, JENAN_MAP_S3_ENDPOINT: "http://127.0.0.1:9000" })?.endpoint).toBe("http://127.0.0.1:9000");
    expect(() => s3ConfigFromEnv({ ...good, JENAN_MAP_S3_ENDPOINT: "http://10.0.0.5:9000" })).toThrow("INVALID_OBJECT_STORE_CONFIG:endpoint");
  });
});

describe("S3-compatible object store", () => {
  let fake: ReturnType<typeof fakeStore>, directory: string, endpoint: string;
  const store = (overrides: Record<string, unknown> = {}) => createS3Store({ endpoint, bucket: "jenan-map", prefix: "prod/", ...credentials, region: "auto", ...overrides });
  beforeEach(async () => {
    fake = fakeStore();
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
    endpoint = `http://127.0.0.1:${(fake.server.address() as AddressInfo).port}`;
    directory = await mkdtemp(path.join(os.tmpdir(), "jenan-s3-"));
  });
  afterEach(async () => { await new Promise((resolve) => fake.server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const bytes = Buffer.from("PMTiles-bytes-for-an-immutable-artifact");
  const key = `1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1/${sha(bytes)}.pmtiles`;
  const stored = `jenan-map/prod/${key}`;

  it("creates an object under an immutable key, signed on the wire, with the checksum as payload hash and metadata", async () => {
    expect(await store().putBytes(key, bytes, sha(bytes))).toBe("created");
    expect(fake.objects.get(stored)?.sha256).toBe(sha(bytes));
    expect(fake.seen.find((item) => item.method === "PUT")?.ifNoneMatch).toBe("*");
  });
  it("streams a file from disk the same way and is idempotent for an identical object", async () => {
    const file = path.join(directory, "a.pmtiles");
    await writeFile(file, bytes);
    expect(await store().putFile(key, file, bytes.length, sha(bytes))).toBe("created");
    expect(await store().putFile(key, file, bytes.length, sha(bytes))).toBe("exists");
    expect(fake.seen.filter((item) => item.method === "PUT")).toHaveLength(1);
  });
  it("refuses a body that does not match its checksum (the store rejects it) and never overwrites a different object", async () => {
    await expect(store().putBytes(key, Buffer.from("tampered"), sha(bytes))).rejects.toMatchObject({ code: "OBJECT_STORE_400" });
    fake.objects.set(stored, { body: Buffer.from("other"), sha256: sha("other") });
    await expect(store().putBytes(key, bytes, sha(bytes))).rejects.toMatchObject({ code: "OBJECT_CONFLICT", status: 409 });
    expect(fake.objects.get(stored)?.body.toString()).toBe("other");
  });
  it("accepts a concurrent writer that created the identical object first (412)", async () => {
    fake.objects.set(stored, { body: bytes, sha256: sha(bytes) });
    fake.hidden.add(stored);
    let heads = 0;
    // The first HEAD does not see the object (the other writer is mid-flight); by the second it is visible.
    const racing = createS3Store({ endpoint, bucket: "jenan-map", prefix: "prod/", ...credentials, region: "auto",
      fetchImpl: async (url, init) => { if (init?.method === "HEAD" && ++heads === 2) fake.hidden.delete(stored); return fetch(url, init); } });
    expect(await racing.putBytes(key, bytes, sha(bytes))).toBe("exists");
    expect(fake.seen.filter((item) => item.method === "PUT")).toHaveLength(1);
  });
  it("reads size and metadata, and byte ranges (inclusive) as a stream", async () => {
    await store().putBytes(key, bytes, sha(bytes));
    expect(await store().head(key)).toMatchObject({ size: bytes.length, sha256: sha(bytes) });
    expect(await store().head("missing/object.pmtiles")).toBeNull();
    const body = await store().range(key, 3, 9);
    expect(Buffer.from(await new Response(body).arrayBuffer()).toString()).toBe(bytes.subarray(3, 10).toString());
    expect(fake.seen.find((item) => item.range)?.range).toBe("bytes=3-9");
  });
  it("treats a store that ignores Range as an error instead of returning the wrong bytes", async () => {
    await store().putBytes(key, bytes, sha(bytes));
    const ignoring = createS3Store({ endpoint, bucket: "jenan-map", prefix: "prod/", ...credentials, region: "auto", fetchImpl: (url, init) => { const headers = { ...(init?.headers as Record<string, string>) }; delete headers.range; return fetch(url, { ...init, headers }); } });
    await expect(ignoring.range(key, 3, 9)).rejects.toMatchObject({ code: "OBJECT_STORE_200" });
  });
  it("reports whether the bucket is reachable with these credentials, and refuses wrong credentials and redirects", async () => {
    expect(await store().ping()).toBe(true);
    expect(await store({ secretAccessKey: "x".repeat(40) }).ping()).toBe(false);
    const redirecting = http.createServer((_request, response) => { response.writeHead(302, { location: "http://127.0.0.1:1/elsewhere" }); response.end(); });
    await new Promise<void>((resolve) => redirecting.listen(0, "127.0.0.1", resolve));
    const port = (redirecting.address() as AddressInfo).port;
    expect(await store({ endpoint: `http://127.0.0.1:${port}` }).ping()).toBe(false);
    await new Promise((resolve) => redirecting.close(resolve));
  });
  it("refuses an artifact larger than a single S3 upload and invalid object descriptions", async () => {
    await expect(store().putBytes(key, { length: 6 * 1024 ** 3 } as Buffer, sha(bytes))).rejects.toMatchObject({ code: "OBJECT_TOO_LARGE_FOR_SINGLE_PUT", status: 413 });
    await expect(store().putBytes(key, bytes, "not-a-sha")).rejects.toMatchObject({ code: "INVALID_OBJECT", status: 400 });
  });
});
