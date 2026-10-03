import { ProjectFeasibilityDashboard } from "@/components/projects/project-feasibility-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ProjectFeasibilityPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/feasibility"),
  ]);

  return (
    <ProjectFeasibilityDashboard
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
