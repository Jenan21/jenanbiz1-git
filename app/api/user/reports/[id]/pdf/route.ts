import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { pdfResponse } from "@/lib/http/pdf-response";
import { buildReport } from "@/lib/projects/analysis-report";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { renderAnalysisReportPdf } from "@/services/projects/analysis-report-pdf";
import { getSavedAnalysisReport } from "@/services/projects/analysis-report-service";

const query = z.object({ locale: z.enum(["ar", "en"]).optional(), disposition: z.enum(["attachment", "inline"]).default("attachment") });

/** A report copy saved in the person's own data, as a PDF on the official letterhead; only its owner can read it. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const limited = await enforceRouteRateLimit(request, { scope: "projects:analysis-pdf", limit: 20, windowMs: 60_000, userId: user.id });
  if (limited) return limited;
  const search = new URL(request.url).searchParams;
  const parsed = query.safeParse({ locale: search.get("locale") ?? undefined, disposition: search.get("disposition") ?? undefined });
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid report parameters" }, { status: 400 });
  const { id } = await context.params;
  try {
    const saved = await getSavedAnalysisReport(id, user.id);
    if (!saved) return NextResponse.json({ success: false, message: "Report not found" }, { status: 404 });
    const bytes = await renderAnalysisReportPdf(buildReport(saved.data, parsed.data.locale ?? saved.locale));
    return pdfResponse(bytes, `jenan-pro-analysis-${saved.data.project.id}.pdf`, parsed.data.disposition === "inline");
  } catch (error) {
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "Report generation failed") }, { status: 500 });
  }
}
