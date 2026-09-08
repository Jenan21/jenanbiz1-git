import { NextRequest, NextResponse } from "next/server";
import { getAdminPagination } from "@/lib/admin/pagination";
import { getRobotDashboardSnapshot } from "@/lib/admin/robot-queries";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const snapshot = await getRobotDashboardSnapshot(getAdminPagination(request, 20));
    const visibleRobots = snapshot.robots
      .filter((robot) => robot.status === "ACTIVE")
      .map((robot) => ({
        id: robot.id,
        name: robot.name,
        intelligence: robot.intelligence,
        skill: robot.skill,
        experience: robot.experience,
        status: "ACTIVE" as const,
      }));

    return NextResponse.json({
      success: true,
      summary: {
        totalRobots: snapshot.totalRobots,
        visibleRobots,
        hiddenRobots: snapshot.hiddenRobots,
        averageIntelligence: snapshot.averageIntelligence,
        dailyGeneration: snapshot.dailyGeneration,
        approvalRate: snapshot.totalRobots
          ? Math.round((snapshot.activeRobots / snapshot.totalRobots) * 100)
          : 0,
        pagination: snapshot.pagination,
      },
    });
  } catch (error) {
    console.error("admin dashboard route error", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load dashboard data",
      },
      { status: 500 },
    );
  }
}
