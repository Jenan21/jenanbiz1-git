import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { idSchema, MapError } from "./contracts";
import { authorizedArtifact } from "./service";
import { byteRange, openArtifact } from "./storage";

const privateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

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

export async function artifactResponse(request: NextRequest, artifactId: string, admin: boolean) {
  try {
    const auth = await access(request, admin);
    if (auth.response) return auth.response;
    if (!idSchema.safeParse(artifactId).success) return json({ error: "INVALID_ARTIFACT_ID" }, 400);
    const expires = request.nextUrl.searchParams.get("expires");
    if (expires && (!/^\d+$/.test(expires) || Number(expires) < Date.now() || Number(expires) > Date.now() + 15 * 60_000)) return json({ error: "EXPORT_LINK_EXPIRED" }, 410);
    const artifact = await authorizedArtifact(artifactId, admin);
    const size = Number(artifact.byteSize);
    if (!Number.isSafeInteger(size)) throw new MapError("ARTIFACT_TOO_LARGE", 503);
    const headers = new Headers({
      ...privateHeaders, "accept-ranges": "bytes", "content-type": artifact.mime,
      "content-disposition": `${admin ? "attachment" : "inline"}; filename="${artifact.id}.${artifact.kind === "geojson" ? "geojson" : artifact.kind === "style" ? "json" : artifact.kind === "pmtiles" ? "pmtiles" : "bin"}"`,
      etag: `"sha256-${artifact.sha256}"`, "x-checksum-sha256": artifact.sha256,
    });
    let range;
    try {
      range = byteRange(request.headers.get("range"), size);
    } catch {
      headers.set("content-range", `bytes */${size}`);
      return new NextResponse(null, { status: 416, headers });
    }
    const handle = await openArtifact(artifact);
    headers.set("content-length", String(range ? range.end - range.start + 1 : size));
    if (range) headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    const stream = handle.createReadStream({ start: range?.start ?? 0, end: range?.end ?? size - 1, autoClose: true });
    request.signal.addEventListener("abort", () => stream.destroy(), { once: true });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    return failure(error);
  }
}
