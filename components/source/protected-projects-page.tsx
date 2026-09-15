import { notFound } from "next/navigation";

import { ProjectsLiveExperience } from "@/components/source/projects-live-experience";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformModule } from "@/lib/platform/catalog";

export async function ProtectedProjectsPage() {
  const [catalogModule, { locale }, user] = await Promise.all([
    findPlatformModule("/projects"),
    getRequestDictionary(),
    requireUser("/projects"),
  ]);

  if (!catalogModule) notFound();

  return (
    <ProjectsLiveExperience
      locale={locale}
      module={catalogModule}
      userId={user.id}
      userLabel={user.profile?.displayName ?? user.email}
      view="showcase"
    />
  );
}
