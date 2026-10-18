import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { idSchema, MapError, type Artifact } from "./contracts";
import { authorizedArtifact, authorizedReleaseAsset, servedStyle } from "./service";
import { byteRange, downloadMetadata, openArtifact } from "./storage";

const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function boundedBody(request: NextRequest, limit: number, errorCode = "REQUEST_TOO_LARGE") {
  if (!request.body) throw new MapError("IMPORT_BODY_REQUIRED", 400);
  const chunks: Uint8Array[] = [];
  let count = 0;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      count += result.value.byteLength;
      if (count > limit) {
        await reader.cancel();
        throw new MapError(errorCode, 413);
      }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

export function failure(error: unknown) {
  return json({ error: error instanceof MapError ? error.code : "MAP_UNAVAILABLE" }, error instanceof MapError ? error.status : 503);
}

export async function access(request: NextRequest, admin = false, mutation = false) {
  const user = await getCurrentUser();
  if (!user) return { response: json({ error: "AUTHENTICATION_REQUIRED" }, 401) };
  if (admin && !hasPlatformAdminAccess(user.systemRole)) return { response: json({ error: "ADMIN_REQUIRED" }, 403) };
  if (mutation && !hasValidOrigin(request)) return { response: json({ error: "INVALID_ORIGIN" }, 403) };
  const response = await enforceRouteRateLimit(request, { userId: user.id, scope: admin ? "jenan-map:admin" : "jenan-map:read", limit: admin ? 60 : 180, windowMs: 60_000 });
  return response ? { response } : { user };
}

/** A download is an export: it needs the artifact's own export permission, on every route that can stream it. */
function assertDownloadAllowed(request: NextRequest, artifact: Artifact) {
  if (request.nextUrl.searchParams.get("download") === "1" &&
      (artifact as Artifact & { exportAllowed?: boolean }).exportAllowed !== true) throw new MapError("EXPORT_LICENSE_PERMISSION_REQUIRED", 403);
}

export async function artifactResponse(request: NextRequest, artifactId: string, admin: boolean) {
  try {
    const auth = await access(request, admin);
    if (auth.response) return auth.response;
    if (!idSchema.safeParse(artifactId).success) return json({ error: "INVALID_ARTIFACT_ID" }, 400);
    const artifact = await authorizedArtifact(artifactId, admin);
    assertDownloadAllowed(request, artifact);
    if (artifact.kind === "style" && request.nextUrl.searchParams.get("download") !== "1") return json(await servedStyle(artifact, admin));
    return await streamArtifact(request, artifact, admin);
  } catch (error) {
    return failure(error);
  }
}

async function streamArtifact(request: NextRequest, artifact: Artifact, admin: boolean) {
    const download = downloadMetadata(artifact);
    const size = Number(artifact.byteSize);
    if (!Number.isSafeInteger(size)) throw new MapError("ARTIFACT_TOO_LARGE", 503);
    const headers = new Headers({
      ...privateHeaders, "accept-ranges": "bytes", "content-type": download.mime,
      "content-disposition": `${admin && request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${download.filename}"`,
      etag: `"sha256-${artifact.sha256}"`, "x-checksum-sha256": artifact.sha256,
    });
    let range;
    try {
      const ifRange = request.headers.get("if-range");
      range = byteRange(ifRange && ifRange !== headers.get("etag") ? null : request.headers.get("range"), size);
    } catch {
      headers.set("content-range", `bytes */${size}`);
      return new NextResponse(null, { status: 416, headers });
    }
    const handle = await openArtifact(artifact);
    headers.set("content-length", String(range ? range.end - range.start + 1 : size));
    if (range) headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    const stream = handle.createReadStream({ start: range?.start ?? 0, end: range?.end ?? size - 1, autoClose: true });
    const abort = () => stream.destroy();
    if (request.signal.aborted) abort();
    else request.signal.addEventListener("abort", abort, { once: true });
    stream.once("close", () => request.signal.removeEventListener("abort", abort));
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
}

export async function releaseAssetResponse(request: NextRequest, releaseId: string, segments: string[], admin: boolean) {
  try {
    const auth = await access(request, admin);
    if (auth.response) return auth.response;
    if (!idSchema.safeParse(releaseId).success || segments.length < 2 || segments.length > 3) throw new MapError("INVALID_ASSET_PATH", 400);
    const [requestedKind, ...name] = segments;
    const kind = requestedKind === "sprites" ? "sprite" : requestedKind;
    if (name.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f]/.test(part))) throw new MapError("INVALID_ASSET_PATH", 400);
    const artifact = await authorizedReleaseAsset(releaseId, kind, name.join("/"), admin);
    assertDownloadAllowed(request, artifact);
    if (kind === "style") return json(await servedStyle(artifact, admin));
    return await streamArtifact(request, artifact, admin);
  } catch (error) { return failure(error); }
}
