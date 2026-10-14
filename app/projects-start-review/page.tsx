import { notFound } from "next/navigation";
import { ProjectsCompletionCinematic } from "@/components/source/projects-completion-cinematic";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";
export default async function ProjectsStartReviewPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects/start"),
  ]);
  const match = await findPlatformService("projects", "start");
  if (!match) notFound();
  return <ProjectsCompletionCinematic locale={locale} module={match.module} service={match.service} userId={user.id} userLabel={user.profile?.displayName ?? user.email} mode="launch" />;
}
