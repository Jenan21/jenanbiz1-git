import { notFound } from "next/navigation";

import { ProjectsAnalysisCinematic } from "@/components/source/projects-analysis-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectsAnalysisReviewPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/analysis"),
  ]);
  const match = await findPlatformService("projects", "analysis");
  if (!match) notFound();

  return (
    <ProjectsAnalysisCinematic
      locale={locale}
      module={match.module}
      service={match.service}
      userId={user.id}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
