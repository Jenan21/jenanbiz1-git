import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const [robots, activeTasks, pendingTasks, failedExecutions, pendingRetraining] = await Promise.all([
      db.robot.count({ where: { status: "ACTIVE" } }),
      db.robotTask.count({ where: { status: { in: ["ACTIVE", "IN_PROGRESS"] } } }),
      db.robotTask.count({ where: { status: "PENDING_APPROVAL" } }),
      db.modelExecution.count({ where: { success: false } }),
      db.retrainingEvent.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    ]);
    const signals = failedExecutions + pendingRetraining + pendingTasks;
    return NextResponse.json({
      success: true,
      health: {
        status: "OBSERVABILITY_UNCONFIGURED",
        monitoringConfigured: false,
        activeRobots: robots,
        activeTasks,
        pendingTasks,
        failedExecutions,
        pendingRetraining,
        signals,
      },
    });
  } catch (error) {
    console.error("admin global health route failed", error);
    return NextResponse.json({ success: false, message: "Unable to load global health" }, { status: 500 });
  }
}
