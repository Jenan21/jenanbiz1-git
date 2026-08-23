import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { executeRobotTask } from "@/services/orchestration/task-execution";

const requestSchema = z.object({
  taskType: z.enum(["design", "analysis", "coding", "general"]).default("general"),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid task execution input" }, { status: 400 });
  }

  const { taskId } = await context.params;
  try {
    const result = await executeRobotTask({ taskId, taskType: parsed.data.taskType });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task execution failed";
    const status = message === "Robot task not found" ? 404 : 409;
    return NextResponse.json({ success: false, message }, { status });
  }
}
