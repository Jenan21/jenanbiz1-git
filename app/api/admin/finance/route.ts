import { NextResponse } from "next/server";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";
import { getFinancialSummary } from "@/lib/admin/financial-summary";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    return NextResponse.json({ success: true, summary: await getFinancialSummary() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("finance summary failed", error);
    return NextResponse.json({ success: false, message: "Unable to load financial summary" }, { status: 500 });
  }
}
