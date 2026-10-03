import { ProjectEvaluationDashboard } from "@/components/projects/project-evaluation-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ProjectEvaluationPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/evaluation"),
  ]);

  return (
    <ProjectEvaluationDashboard
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
