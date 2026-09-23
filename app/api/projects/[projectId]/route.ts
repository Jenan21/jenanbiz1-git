import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserProject } from "@/services/projects/project-service";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
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