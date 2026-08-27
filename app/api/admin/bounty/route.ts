import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";

export async function GET() {
  try {
    const summary = await getPlatformAdminSummary();

    return NextResponse.json({
      success: true,
      bounty: {
        leaders: summary.leaders.map((leader) => ({
          name: leader.name,
          score: leader.score,
          reward: leader.reward,
        })),
      },
    });
  } catch (error) {
    console.error("admin bounty route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load bounty data",
      },
      { status: 500 },
    );
  }
}
