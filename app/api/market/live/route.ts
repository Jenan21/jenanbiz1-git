import { NextResponse } from "next/server";
import type { MarketRequestContext } from "@/lib/market/contracts";
import { getMarketSnapshot } from "@/lib/market/service";

export const dynamic = "force-dynamic";

function marketContext(request: Request): MarketRequestContext {
  const candidate = request.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? null;
  const countryCode = candidate && /^[A-Z]{2}$/.test(candidate) ? candidate : null;
  return {
    countryCode,
    countrySource: countryCode ? "vercel" : "unavailable",
  };
}

export async function GET(request: Request) {
  const context = marketContext(request);
  const snapshot = await getMarketSnapshot(undefined, Date.now(), context);
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control":
        snapshot.state === "live"
          ? "private, max-age=15, stale-while-revalidate=45"
          : "no-store",
    },
  });
}
