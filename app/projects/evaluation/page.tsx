import { notFound } from "next/navigation";

import { ProjectsCompletionCinematic } from "@/components/source/projects-completion-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectEvaluationPage() {
  const [match, { locale }, user] = await Promise.all([
    findPlatformService("projects", "evaluation"),
    getRequestDictionary(),
    requireUser("/projects/evaluation"),
  ]);

  if (!match) notFound();

  return (
    <ProjectsCompletionCinematic
      locale={locale}
      module={match.module}
      service={match.service}
      userId={user.id}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
