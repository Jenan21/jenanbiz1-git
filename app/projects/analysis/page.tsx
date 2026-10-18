import { ProjectAnalysisDashboard } from "@/components/projects/project-analysis-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findLatestAnalysisReportId } from "@/services/projects/project-analysis";
import { redirect } from "next/navigation";
import { analysisReturnPath } from "@/lib/projects/analysis-errors";

export default async function ProjectAnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const returnPath = analysisReturnPath("/projects/analysis", query);
  const params = new URLSearchParams(returnPath.split("?")[1]);
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(returnPath),
  ]);
  if (params.has("project")) redirect(`/projects/analysis/progress?${params}`);
  const latestReportId = await findLatestAnalysisReportId(user.id).catch(() => null);

  return (
    <ProjectAnalysisDashboard
      latestReportId={latestReportId}
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
