import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
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
