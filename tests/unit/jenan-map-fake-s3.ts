import http from "node:http";
import { createHash } from "node:crypto";
import { signRequest } from "../../scripts/jenan-map/s3-store.mjs";

export const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
export const credentials = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", region: "us-east-1" };

/** A small S3 look-alike that re-derives every signature from what actually arrives on the wire and checks the payload hash. */
export function fakeStore() {
  const objects = new Map<string, { body: Buffer; sha256: string }>();
  const hidden = new Set<string>();
  // Holds every ranged read back, so a test can keep a long read in flight the way a real archive does.
  const latency = { rangeMs: 0 };
  const seen: Array<{ method: string; path: string; range?: string; ifNoneMatch?: string }> = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const date = String(request.headers["x-amz-date"] ?? "");
      const meta: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) if (name.startsWith("x-amz-meta-")) meta[name] = String(value);
      const payloadHash = String(request.headers["x-amz-content-sha256"] ?? "");
      const expected = signRequest({ ...credentials, region: "auto", method: request.method ?? "", url: `http://${request.headers.host}${request.url}`, headers: meta, payloadHash,
        now: new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`) });
      const key = decodeURIComponent(url.pathname.slice(1));
      seen.push({ method: request.method ?? "", path: key, range: request.headers.range, ifNoneMatch: request.headers["if-none-match"] as string | undefined });
      const send = (status: number, headers: Record<string, string | number> = {}, body: string | Buffer = "") => { response.writeHead(status, headers); response.end(body); };
      if (expected.authorization !== request.headers.authorization) return send(403, {}, "SignatureDoesNotMatch");
      if (url.searchParams.get("list-type") === "2") return send(200, { "content-type": "application/xml" }, "<ListBucketResult/>");
      const found = objects.get(key);
      if (request.method === "PUT") {
        if (sha(body) !== payloadHash) return send(400, {}, "XAmzContentSHA256Mismatch");
        if (request.headers["if-none-match"] === "*" && found) return send(412);
        objects.set(key, { body, sha256: meta["x-amz-meta-sha256"] });
        return send(200);
      }
      if (!found || hidden.has(key)) return send(404);
      const headers = { "content-length": found.body.length, ...(found.sha256 ? { "x-amz-meta-sha256": found.sha256 } : {}), etag: '"e"' };
      if (request.method === "HEAD") return send(200, headers);
      const range = /bytes=(\d+)-(\d+)/.exec(String(request.headers.range ?? ""));
      // The bytes themselves, never a text rendering of them: a string would be re-encoded as UTF-8 and no longer match its content-length.
      if (!range) return send(200, headers, found.body);
      const [start, end] = [Number(range[1]), Number(range[2])];
      const reply = () => {
        response.writeHead(206, { "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${found.body.length}` });
        response.end(found.body.subarray(start, end + 1));
      };
      if (latency.rangeMs > 0) setTimeout(reply, latency.rangeMs);
      else reply();
    });
  });
  return { server, objects, hidden, seen, latency };
}
