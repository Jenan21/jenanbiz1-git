import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { pdfResponse } from "@/lib/http/pdf-response";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { renderAnalysisReportPdf } from "@/services/projects/analysis-report-pdf";
import { buildLiveReport } from "@/services/projects/analysis-report-service";

const query = z.object({ locale: z.enum(["ar", "en"]).default("ar"), disposition: z.enum(["attachment", "inline"]).default("attachment") });

/** The finished analysis report of a project as a PDF on the official letterhead. */
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const limited = await enforceRouteRateLimit(request, { scope: "projects:analysis-pdf", limit: 20, windowMs: 60_000, userId: user.id });
  if (limited) return limited;
  const search = new URL(request.url).searchParams;
  const parsed = query.safeParse({ locale: search.get("locale") ?? undefined, disposition: search.get("disposition") ?? undefined });
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid report parameters" }, { status: 400 });
  const { projectId } = await context.params;
  try {
    const built = await buildLiveReport(projectId, user.id, parsed.data.locale);
    if (!built) return NextResponse.json({ success: false, message: "Project not found" }, { status: 404 });
    if (!built.model.complete) return NextResponse.json({ success: false, message: "Analysis not completed" }, { status: 409 });
    const bytes = await renderAnalysisReportPdf(built.model);
    return pdfResponse(bytes, `jenan-pro-analysis-${projectId}.pdf`, parsed.data.disposition === "inline");
  } catch (error) {
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "Report generation failed") }, { status: 500 });
  }
}
