import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";

export async function GET() {
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
