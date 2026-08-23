import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { summarizeRobotMetrics } from "@/lib/admin/robot-intelligence";

export async function GET() {
  try {
    const robots = await db.robot.findMany({
      orderBy: { intelligence: "desc" },
      take: 50,
    });

    const normalized: import("@/lib/admin/robot-intelligence").RobotRecord[] = robots.map((robot) => ({
      id: robot.id,
      name: robot.name,
      intelligence: robot.intelligence,
      skill: robot.skill,
      experience: robot.experience,
      status:
        robot.status === "ARCHIVED"
          ? "HIDDEN"
          : robot.status === "REVIEW"
            ? "REVIEW"
            : robot.status === "HIDDEN"
              ? "HIDDEN"
              : "ACTIVE",
    }));

    return NextResponse.json({
      success: true,
      summary: summarizeRobotMetrics(normalized),
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
