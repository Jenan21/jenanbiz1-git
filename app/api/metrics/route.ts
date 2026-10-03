import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRateLimitProviderReady } from "@/lib/rate-limit/auth-rate-limit";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const token = process.env.METRICS_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function GET(request: NextRequest) {
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