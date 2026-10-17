import { ProjectAnalysisDashboard } from "@/components/projects/project-analysis-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findLatestAnalysisReportId } from "@/services/projects/project-analysis";

export default async function ProjectAnalysisPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/analysis"),
  ]);
  const latestReportId = await findLatestAnalysisReportId(user.id).catch(() => null);

  return (
    <ProjectAnalysisDashboard
      latestReportId={latestReportId}
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
