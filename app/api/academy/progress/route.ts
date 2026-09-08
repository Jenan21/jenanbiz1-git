import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { completeLearnerLesson, enrollLearner, getLearnerCourseProgress } from "@/services/academy/learner-progress-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll"), courseId: z.string().cuid() }),
  z.object({ action: z.literal("completeLesson"), lessonId: z.string().cuid() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId || !z.string().cuid().safeParse(courseId).success) return NextResponse.json({ success: false, message: "Valid courseId required" }, { status: 400 });
  return NextResponse.json({ success: true, ...(await getLearnerCourseProgress(courseId, user.id)) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid learning progress command" }, { status: 400 });
  try {
    const result = parsed.data.action === "enroll" ? await enrollLearner(parsed.data.courseId, user.id) : await completeLearnerLesson(parsed.data.lessonId, user.id);
    return NextResponse.json({ success: true, result }, { status: parsed.data.action === "enroll" ? 201 : 200 });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Learning progress failed" }, { status: 409 }); }
}