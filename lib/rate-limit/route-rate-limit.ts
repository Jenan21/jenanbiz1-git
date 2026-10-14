import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { clientAddress } from "@/lib/security/site-gate";

export interface RouteRateLimit {
  /** Names the budget, e.g. `studio:export`; every route that shares a scope shares the budget. */
  scope: string;
  limit: number;
  windowMs: number;
  /** The signed-in user; anonymous callers are counted by client address instead. */
  userId?: string | null;
}

/**
 * Counts one request against the scope's budget. Returns the 429 response to send when the caller is over the limit,
 * or `null` when the request may proceed. The shared provider is Redis in production and fails closed when it is down.
 */
export async function enforceRouteRateLimit(
  request: Pick<NextRequest, "headers">,
  policy: RouteRateLimit,
): Promise<NextResponse | null> {
  const subject = policy.userId ? `user:${policy.userId}` : `ip:${clientAddress(request.headers)}`;
  const key = `route:${policy.scope}:${createHash("sha256").update(subject).digest("hex").slice(0, 32)}`;
  const decision = await getRateLimitProvider().consume({ key, limit: policy.limit, windowMs: policy.windowMs });
  if (decision.allowed) return null;
  return NextResponse.json(
    { error: "RATE_LIMITED" },
    { status: 429, headers: { "cache-control": "no-store", "retry-after": String(Math.max(1, decision.retryAfterSeconds)) } },
  );
}
