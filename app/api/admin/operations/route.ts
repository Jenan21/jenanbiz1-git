import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const [summary, missions] = await Promise.all([
      getPlatformAdminSummary(),
      db.robotTask.findMany({
        where: { status: { in: ["ACTIVE", "IN_PROGRESS", "PENDING_APPROVAL"] } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          robot: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      operations: {
        approvedCount: summary.visibleRobots,
        users: summary.activeUsers,
        stages: [
          { stage: "تم التوليد", count: summary.totalRobots, detail: "روبوتات متاحة في المنصة" },
          { stage: "قيد المراجعة", count: summary.reviewRobots, detail: "يحتاج مراجعة اللجنة" },
          { stage: "اللجنة", count: summary.committeeReviews, detail: "تقييمات سابقة" },
          { stage: "تمت الموافقة", count: summary.visibleRobots, detail: "انتقل إلى التشغيل" },
          { stage: "مؤجل", count: summary.pendingTasks, detail: "مهام معلقة" },
        ],
        missions: missions.map((mission) => ({
          id: mission.id,
          title: mission.title,
          owner: mission.robot.name,
          zone: mission.status,
        })),
      },
    });
  } catch (error) {
    console.error("admin operations route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load operations data",
      },
      { status: 500 },
    );
  }
}
