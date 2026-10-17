import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";
import { getProjectAnalysisStatus } from "@/services/projects/project-analysis";

/** The step a project analysis is on, read by the progress popup; it never returns stored error text. */
export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const decision = await checkProjectRateLimit("status", request, user.id);
  if (!decision.allowed) {
    return NextResponse.json({ success: false, message: "Rate limit exceeded" }, { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } });
  }
  const { projectId } = await context.params;
  const status = await getProjectAnalysisStatus(projectId, user.id);
  if (!status) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
  return NextResponse.json({ success: true, ...status }, { headers: { "cache-control": "private, no-store" } });
}
