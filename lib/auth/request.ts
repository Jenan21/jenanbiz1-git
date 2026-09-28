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
    const allowedOrigins = new Set([requestUrl.origin]);
    const host = request.headers.get("host")?.trim();
    const forwardedProtocol = request.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim();
    const protocol =
      forwardedProtocol === "http" || forwardedProtocol === "https"
        ? forwardedProtocol
        : requestUrl.protocol.replace(":", "");
    if (host) allowedOrigins.add(`${protocol}://${host}`);
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configuredAppUrl) allowedOrigins.add(new URL(configuredAppUrl).origin);
    return allowedOrigins.has(originUrl.origin);
  } catch {
    return false;
  }
}
