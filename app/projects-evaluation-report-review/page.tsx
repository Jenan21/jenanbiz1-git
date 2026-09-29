import { ProjectsReportPreview } from "@/components/source/projects-report-preview";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
export default async function ProjectsEvaluationReportReviewPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/evaluation"),
  ]);
  return <ProjectsReportPreview locale={locale} userId={user.id} userLabel={user.profile?.displayName ?? user.email} variant="evaluation" />;
}
