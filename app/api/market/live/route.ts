import { NextResponse } from "next/server";
import { getMarketSnapshot } from "@/lib/market/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getMarketSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control":
        snapshot.state === "live"
          ? "public, max-age=15, stale-while-revalidate=45"
          : "no-store",
    },
  });
}
