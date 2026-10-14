import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { checks, ready } = await checkReadiness();
    return NextResponse.json(
      { status: ready ? "ready" : "not_ready", checks },
      { headers: { "cache-control": "no-store" }, status: ready ? 200 : 503 },
    );
  } catch {
    return NextResponse.json({ status: "not_ready" }, { headers: { "cache-control": "no-store" }, status: 503 });
  }
}