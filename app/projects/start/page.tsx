import { ProjectStartDashboard } from "@/components/projects/project-start-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function ProjectStartPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/start"),
  ]);

  return (
    <ProjectStartDashboard
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
