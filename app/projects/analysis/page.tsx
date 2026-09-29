import { notFound } from "next/navigation";

import { ProjectsAnalysisCinematic } from "@/components/source/projects-analysis-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectAnalysisPage() {
  const [match, { locale }, user] = await Promise.all([
    findPlatformService("projects", "analysis"),
    getRequestDictionary(),
    requireUser("/projects/analysis"),
  ]);

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
