import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";

const decisionSchema = z.object({ id: z.string().cuid(), action: z.enum(["approve", "defer"]) });

export async function GET() {
  try {
    const tasks = await db.robotTask.findMany({
      include: { robot: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });

    return NextResponse.json({
      success: true,
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        robotName: task.robot.name,
        status: task.status,
        priority: task.priority,
        description: task.description,
      })),
    });
  } catch (error) {
    console.error("decision route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load decision queue",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid decision input" }, { status: 400 });
  const task = await db.robotTask.update({ where: { id: parsed.data.id }, data: { status: parsed.data.action === "approve" ? "ACTIVE" : "PENDING_APPROVAL" } });
  await db.auditLog.create({ data: { actorId: user.id, action: parsed.data.action === "approve" ? "TASK_APPROVED" : "TASK_DEFERRED", entityType: "RobotTask", entityId: task.id } });
  return NextResponse.json({ success: true, task: { id: task.id, status: task.status } });
}
