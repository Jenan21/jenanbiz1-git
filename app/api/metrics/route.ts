import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRateLimitProviderReady } from "@/lib/rate-limit/auth-rate-limit";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { credentialsMatchToken } from "@/lib/security/site-gate";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  return Boolean(token) && credentialsMatchToken(request.headers.get("authorization"), token as string);
}

export async function GET(request: NextRequest) {
  // Collectors poll every few seconds at most; anything faster is guessing or abuse.
  const limited = await enforceRouteRateLimit(request, { scope: "metrics", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  if (!isAuthorized(request)) return NextResponse.json({ message: "Metrics authorization required" }, { status: 401 });
  try {
    const [users, organizations, robots, tasks, rateLimitReady] = await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.robot.count(),
      db.robotTask.count(),
      isRateLimitProviderReady(),
    ]);
    return NextResponse.json({ timestamp: new Date().toISOString(), records: { users, organizations, robots, tasks }, dependencies: { rateLimit: rateLimitReady ? "ready" : "not_ready" } }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Metrics unavailable" }, { status: 503 });
  }
}