// Provider-neutral S3-compatible object store for map artifacts (AWS S3, Cloudflare R2, MinIO, ...): AWS Signature Version 4 over
// `fetch`, no SDK. Shared by the application and by the offline builder.
//
// Artifacts are immutable and content-addressed (`<release>/<sha256>.<ext>`), so the SHA-256 in a key is also its integrity check:
// an upload signs that payload hash (the store refuses a body that does not match it), records it as object metadata, and is verified
// afterwards; a read can compare size and metadata cheaply, or hash the whole object when a caller forces verification.
import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export class ObjectStoreError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
// A single PUT is limited to 5 GiB by S3; multipart upload is not implemented, so a larger artifact is refused rather than truncated.
export const MAX_SINGLE_PUT_BYTES = 5 * 1024 ** 3;
const HEX = /^[a-f0-9]{64}$/;
const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
const encodeRfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.codePointAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key) => key.split("/").map(encodeRfc3986).join("/");
// Signature V4 sorts by UTF-16 code unit, never by locale.
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// A loop rather than /\/+$/, which backtracks quadratically on a long run of slashes.
function trimTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}
// Every segment non-empty, made of safe characters, and the whole ending in "/", for example `maps/` or `a/b/`.
const validPrefix = (prefix) => prefix.endsWith("/") && prefix.slice(0, -1).split("/").every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== "." && part !== "..");

/**
 * AWS Signature Version 4, Authorization-header form. Signs `host`, `x-amz-date` and every `x-amz-*` header given, plus
 * `x-amz-content-sha256` for S3; other headers (range, content-length, if-none-match) travel unsigned, which every S3-compatible
 * store accepts. Returns the headers to send (without `host`, which `fetch` derives from the URL).
 */
export function signRequest({ method, url, headers = {}, payloadHash = EMPTY_SHA256, accessKeyId, secretAccessKey, region, service = "s3", now = new Date() }) {
  const target = new URL(url);
  const amzDate = now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const send = { ...headers, "x-amz-date": amzDate };
  if (service === "s3") send["x-amz-content-sha256"] = payloadHash;
  const signedSource = { host: target.host };
  for (const [name, value] of Object.entries(send)) if (name.toLowerCase().startsWith("x-amz-")) signedSource[name.toLowerCase()] = String(value).trim().replaceAll(/\s+/g, " ");
  const names = Object.keys(signedSource).sort(byCodeUnit);
  const canonicalHeaders = names.map((name) => `${name}:${signedSource[name]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...target.searchParams.entries()].map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort((a, b) => byCodeUnit(a[0], b[0]) || byCodeUnit(a[1], b[1])).map(([key, value]) => `${key}=${value}`).join("&");
  const canonicalRequest = `${method}\n${target.pathname}\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Reads and validates the object-store settings; returns null when the filesystem driver (the default) is selected. Never echoes a secret. */
export function s3ConfigFromEnv(env = process.env) {
  if ((env.JENAN_MAP_STORAGE_DRIVER?.trim() || "filesystem") !== "s3") return null;
  const bad = (field) => new ObjectStoreError(`INVALID_OBJECT_STORE_CONFIG:${field}`, 503);
  let endpoint;
  try { endpoint = new URL(env.JENAN_MAP_S3_ENDPOINT?.trim() ?? ""); } catch { throw bad("endpoint"); }
  // Credentials are signed into every request, so the endpoint must be TLS; plain HTTP is for a local test server only.
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && LOOPBACK.has(endpoint.hostname)))) throw bad("endpoint");
  const bucket = env.JENAN_MAP_S3_BUCKET?.trim() ?? "";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) throw bad("bucket");
  const region = env.JENAN_MAP_S3_REGION?.trim() || "auto";
  if (!/^[a-z0-9-]{2,32}$/.test(region)) throw bad("region");
  const accessKeyId = env.JENAN_MAP_S3_ACCESS_KEY_ID?.trim() ?? "";
  if (!/^[A-Za-z0-9/+=_.-]{8,128}$/.test(accessKeyId)) throw bad("accessKeyId");
  const secretAccessKey = env.JENAN_MAP_S3_SECRET_ACCESS_KEY?.trim() ?? "";
  if (!/^\S{16,200}$/.test(secretAccessKey)) throw bad("secretAccessKey");
  const prefix = env.JENAN_MAP_S3_PREFIX?.trim() ?? "";
  if (prefix && !validPrefix(prefix)) throw bad("prefix");
  return { endpoint: endpoint.origin + trimTrailingSlashes(endpoint.pathname), bucket, region, accessKeyId, secretAccessKey, prefix, pathStyle: env.JENAN_MAP_S3_PATH_STYLE?.trim() !== "0" };
}

export function createS3Store({ endpoint, bucket, region = "auto", accessKeyId, secretAccessKey, prefix = "", pathStyle = true, fetchImpl = fetch, clock = () => new Date() }) {
  const base = new URL(endpoint);
  const urlFor = (key, query) => {
    const host = pathStyle ? base.host : `${bucket}.${base.host}`;
    const root = pathStyle ? `${trimTrailingSlashes(base.pathname)}/${bucket}` : trimTrailingSlashes(base.pathname);
    const url = new URL(`${base.protocol}//${host}${root}${key ? `/${encodeKey(`${prefix}${key}`)}` : ""}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    return url.toString();
  };

  async function send(method, key, { query, headers = {}, body, payloadHash = EMPTY_SHA256, signal } = {}) {
    const url = urlFor(key, query);
    const signed = signRequest({ method, url, headers, payloadHash, accessKeyId, secretAccessKey, region, now: clock() });
    // A redirect would replay the signed request somewhere else; it is an error, never followed.
    return fetchImpl(url, { method, headers: signed, body, signal, redirect: "error", ...(body === undefined ? {} : { duplex: "half" }) });
  }
  const refused = (response) => new ObjectStoreError(`OBJECT_STORE_${response.status}`, response.status === 404 ? 404 : 502);

  async function head(key) {
    const response = await send("HEAD", key);
    if (response.status === 404) return null;
    if (!response.ok) throw refused(response);
    const size = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(size) || size < 0) throw new ObjectStoreError("OBJECT_STORE_BAD_RESPONSE");
    return { size, sha256: response.headers.get("x-amz-meta-sha256"), etag: response.headers.get("etag") };
  }

  /** Bytes `start..end` (inclusive) as a web stream; the caller may abort through `signal`. */
  async function range(key, start, end, signal) {
    const response = await send("GET", key, { headers: { range: `bytes=${start}-${end}` }, signal });
    if (response.status !== 206 || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw refused(response);
    }
    return response.body;
  }

  async function put(key, size, sha256, body) {
    if (!HEX.test(sha256) || !Number.isSafeInteger(size) || size < 1) throw new ObjectStoreError("INVALID_OBJECT", 400);
    if (size > MAX_SINGLE_PUT_BYTES) throw new ObjectStoreError("OBJECT_TOO_LARGE_FOR_SINGLE_PUT", 413);
    const same = (found) => found && found.size === size && found.sha256 === sha256;
    const existing = await head(key);
    if (existing) {
      if (same(existing)) return "exists";
      throw new ObjectStoreError("OBJECT_CONFLICT", 409);
    }
    const response = await send("PUT", key, { headers: { "content-length": String(size), "if-none-match": "*", "x-amz-meta-sha256": sha256 }, body: body(), payloadHash: sha256 });
    // Another writer created the same immutable object first: acceptable only if it is exactly ours.
    if (response.status === 412) {
      if (same(await head(key))) return "exists";
      throw new ObjectStoreError("OBJECT_CONFLICT", 409);
    }
    if (!response.ok) throw refused(response);
    if (!same(await head(key))) throw new ObjectStoreError("OBJECT_STORE_VERIFY_FAILED");
    return "created";
  }

  return {
    head, range,
    /** Uploads a file of known size and checksum under an immutable key. Resolves "created" or "exists" (identical object already there). */
    putFile: (key, filePath, size, sha256) => put(key, size, sha256, () => Readable.toWeb(createReadStream(filePath))),
    putBytes: (key, bytes, sha256) => put(key, bytes.length, sha256, () => bytes),
    /** Whether the bucket can be listed with these credentials: a real measurement, not an assumption. */
    async ping() {
      try {
        const response = await send("GET", "", { query: { "list-type": "2", "max-keys": "1" } });
        await response.body?.cancel().catch(() => undefined);
        return response.ok;
      } catch { return false; }
    },
  };
}
