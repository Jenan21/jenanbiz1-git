import { notFound } from "next/navigation";

import { ProjectsFeasibilityCinematic } from "@/components/source/projects-feasibility-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectsFeasibilityReviewPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/feasibility-study"),
  ]);
  const match = await findPlatformService("projects", "feasibility-study");
  if (!match) notFound();
  return (
    <ProjectsFeasibilityCinematic
      locale={locale}
      module={match.module}
      service={match.service}
      userId={user.id}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
