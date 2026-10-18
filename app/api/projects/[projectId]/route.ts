import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserProject } from "@/services/projects/project-service";
import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const decision = await checkProjectRateLimit("status", request, user.id);
  if (!decision.allowed) {
    return NextResponse.json({ success: false, message: "Rate limit exceeded" }, { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } });
  }
  const { projectId } = await context.params;
  const project = await getUserProject(projectId, user.id);
  if (!project) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
  return NextResponse.json({
    success: true,
    project: {
      ...project,
      evidenceFiles: project.evidenceFiles.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })),
    },
  }, { headers: { "cache-control": "private, no-store" } });
}