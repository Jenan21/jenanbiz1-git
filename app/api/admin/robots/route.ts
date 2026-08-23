import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { getCurrentUser } from "@/lib/auth/session";
import { createRobotCandidate } from "@/lib/admin/robot-intelligence";
import { getRobotDashboardSnapshot } from "@/lib/admin/robot-queries";

const generationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  team: z.string().trim().min(2).max(80),
  mission: z.string().trim().min(4).max(160),
});

export async function GET() {
  try {
    const snapshot = await getRobotDashboardSnapshot();
    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (error) {
    console.error("robot snapshot failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load robot data",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }

  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  }

  const parsed = generationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid robot generation input" }, { status: 400 });
  }

  const candidate = createRobotCandidate(parsed.data);
  const robot = await db.$transaction(async (transaction) => {
    const createdRobot = await transaction.robot.create({
      data: {
        name: candidate.name,
        slug: `${candidate.slugBase}-${crypto.randomUUID().slice(0, 8)}`,
        team: candidate.team,
        intelligence: candidate.intelligence,
        skill: candidate.skill,
        experience: candidate.experience,
        status: candidate.status,
        isVisible: candidate.isVisible,
        notes: candidate.notes,
      },
    });

    await transaction.robotTask.create({
      data: {
        robotId: createdRobot.id,
        title: candidate.taskTitle,
        description: "Initial evaluation mission generated with the robot candidate.",
        status: "DRAFT",
        priority: "HIGH",
      },
    });

    return createdRobot;
  });

  return NextResponse.json({
    success: true,
    robot: { id: robot.id, name: robot.name, status: robot.status, isVisible: robot.isVisible },
    lifecycle: "REVIEW",
  }, { status: 201 });
}
