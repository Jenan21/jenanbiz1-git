import { notFound } from "next/navigation";

import { ProjectsCinematic } from "@/components/source/projects-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformModule } from "@/lib/platform/catalog";

export default async function ProjectsShowcaseReviewPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects"),
  ]);
  const catalogModule = await findPlatformModule("/projects");
  if (!catalogModule) notFound();

  return (
    <ProjectsCinematic
      locale={locale}
      module={catalogModule}
      userId={user.id}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
