import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { buildFallbackPlatformInsights } from "@/lib/ai/platform-intelligence";

export async function GET() {
  try {
    const summary = await getPlatformAdminSummary();
    const insights = buildFallbackPlatformInsights({
      totalRobots: summary.totalRobots,
      visibleRobots: summary.visibleRobots,
      reviewRobots: summary.reviewRobots,
      hiddenRobots: summary.hiddenRobots,
      averageIntelligence: summary.averageIntelligence,
      committeeApprovalRate: summary.committeeApprovalRate,
      activeTasks: summary.activeTasks,
      pendingTasks: summary.pendingTasks,
      totalUsers: summary.totalUsers,
      totalOrganizations: summary.totalOrganizations,
    });

    return NextResponse.json({
      success: true,
      insights,
    });
  } catch (error) {
    console.error("admin intel route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load intelligence insights",
      },
      { status: 500 },
    );
  }
}
