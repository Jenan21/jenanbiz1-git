import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
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
