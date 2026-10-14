import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { createProjectReport } from "@/services/projects/project-report";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { userCanReadProject } from "@/services/projects/project-service";

// The same budget as the project intelligence command: a report with a location fans out to three outside providers.
const REPORT_BUDGET = { limit: 8, windowMs: 60_000 } as const;
const reportQuery = z.object({
  location: z.string().max(200).optional(),
  countryCode: z.string().length(2).optional(),
  sector: z.string().max(120).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const limited = await enforceRouteRateLimit(request, { scope: "projects:report", ...REPORT_BUDGET, userId: user.id });
  if (limited) return limited;
  const { projectId } = await context.params;
  try {
    const query = new URL(request.url).searchParams;
    const parsed = reportQuery.safeParse({
      location: query.get("location")?.trim() || undefined,
      countryCode: query.get("countryCode")?.trim() || undefined,
      sector: query.get("sector")?.trim() || undefined,
    });
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid report parameters" }, { status: 400 });
    // Outside providers are only called for a project the user may read.
    if (!(await userCanReadProject(projectId, user.id))) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
    const intelligence = parsed.data.location
      ? await searchProjectIntelligence({ query: parsed.data.location, countryCode: parsed.data.countryCode, sector: parsed.data.sector })
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
    const status = error instanceof Error && error.message === "Project not found" ? 404 : 500;
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "Report generation failed") }, { status });
  }
}
