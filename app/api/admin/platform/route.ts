import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformAdminSummary } from "@/lib/admin/platform-summary";
import { denyUnlessAdmin } from "@/lib/auth/admin-api";

export async function GET() {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  try {
    const [summary, users, organizations, robots, tasks] = await Promise.all([
      getPlatformAdminSummary(),
      db.user.count(),
      db.organization.count(),
      db.robot.count(),
      db.robotTask.count(),
    ]);

    return NextResponse.json({
      success: true,
      platform: {
        summary,
        metrics: {
          users,
          organizations,
          robots,
          tasks,
        },
      },
    });
  } catch (error) {
    console.error("admin platform route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load full platform data",
      },
      { status: 500 },
    );
  }
}
