import { ProjectAnalysisDashboard } from "@/components/projects/project-analysis-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ProjectAnalysisPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/analysis"),
  ]);

  return (
    <ProjectAnalysisDashboard
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
