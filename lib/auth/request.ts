import type { NextRequest } from "next/server";
import type { RequestContext } from "@/services/auth/auth.service";

export function getRequestContext(request: NextRequest): RequestContext {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return {
    ipAddress: forwardedFor ?? null,
    userAgent: request.headers.get("user-agent"),
  };
}

export function hasValidOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHost =
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      request.headers.get("host") ||
      requestUrl.host;
    const expectedProtocol =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      requestUrl.protocol.replace(":", "");
    return (
      originUrl.host === expectedHost &&
      originUrl.protocol === `${expectedProtocol}:`
    );
  } catch {
    return false;
  }
}
