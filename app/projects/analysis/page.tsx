import { ProjectAnalysisDashboard } from "@/components/projects/project-analysis-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findLatestAnalysisReportId } from "@/services/projects/project-analysis";
import { redirect } from "next/navigation";

export default async function ProjectAnalysisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["project", "run"]) {
    if (typeof query[key] === "string") params.set(key, query[key]);
  }
  const returnPath = `/projects/analysis${params.size ? `?${params}` : ""}`;
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
