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
    const [users, organizations, completedTasks, activeRobots] = await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.robotTask.count({ where: { status: "COMPLETED" } }),
      db.robot.count({ where: { status: "ACTIVE" } }),
    ]);
    return NextResponse.json({ success: true, growth: { users, organizations, completedTasks, activeRobots } });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load growth metrics" }, { status: 500 });
  }
}
