import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createProjectReport } from "@/services/projects/project-report";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { getUserProject } from "@/services/projects/project-service";
import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const { projectId } = await context.params;
  try {
    if (!await getUserProject(projectId, user.id)) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
    const limit = await checkProjectRateLimit("report", request, user.id);
    if (!limit.allowed) return NextResponse.json({ success: false, message: "Report rate limit exceeded" }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
    const query = new URL(request.url).searchParams;
    const parsed = z.object({
      location: z.string().trim().min(2).max(200).optional(),
      countryCode: z.string().trim().length(2).optional(),
      sector: z.string().trim().max(120).optional(),
    }).safeParse({ location: query.get("location") ?? undefined, countryCode: query.get("countryCode") ?? undefined, sector: query.get("sector") ?? undefined });
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid report query" }, { status: 400 });
    const { location, countryCode, sector } = parsed.data;
    const intelligence = location
      ? await searchProjectIntelligence({ query: location, countryCode, sector })
      : undefined;
    const pdf = await createProjectReport(projectId, user.id, intelligence);
    return new NextResponse(pdf as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="jenan-pro-project-${projectId}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Project not found" ? error.message : "Report generation failed";
    return NextResponse.json({ success: false, message }, { status: message === "Project not found" ? 404 : 500 });
  }
}
