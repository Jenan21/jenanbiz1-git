import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createProjectReport } from "@/services/projects/project-report";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const { projectId } = await context.params;
  try {
    const query = new URL(request.url).searchParams;
    const location = query.get("location")?.trim();
    const intelligence = location
      ? await searchProjectIntelligence({ query: location, countryCode: query.get("countryCode") ?? undefined, sector: query.get("sector") ?? undefined })
      : undefined;
    const pdf = await createProjectReport(projectId, user.id, intelligence);
    return new NextResponse(pdf as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="jenan-biz-project-${projectId}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report generation failed";
    return NextResponse.json({ success: false, message }, { status: message === "Project not found" ? 404 : 500 });
  }
}
