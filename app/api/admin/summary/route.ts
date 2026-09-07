import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const summary = await getPlatformAdminSummary();
    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("admin summary route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load platform summary",
      },
      { status: 500 },
    );
  }
}
