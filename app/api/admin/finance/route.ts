import { NextResponse } from "next/server";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";
import { getFinancialSummary } from "@/lib/admin/financial-summary";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    return NextResponse.json({ success: true, summary: await getFinancialSummary() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("finance summary failed", error);
    return NextResponse.json({ success: false, message: "Unable to load financial summary" }, { status: 500 });
  }
}
