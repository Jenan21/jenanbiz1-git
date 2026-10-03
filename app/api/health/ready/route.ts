import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRateLimitProviderReady } from "@/lib/rate-limit/auth-rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [databaseReady, rateLimitReady] = await Promise.all([
      db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      isRateLimitProviderReady(),
    ]);
    const ready = databaseReady && rateLimitReady;
    return NextResponse.json(
      { status: ready ? "ready" : "not_ready", checks: { database: databaseReady, rateLimit: rateLimitReady } },
      { status: ready ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503 });
  }
}