import { NextResponse } from "next/server";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { buildPlatformObservations } from "@/lib/ai/platform-intelligence";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const summary = await getPlatformAdminSummary();
    const observations = buildPlatformObservations({
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
      observations,
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
