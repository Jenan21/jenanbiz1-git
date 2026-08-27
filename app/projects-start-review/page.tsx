import { notFound } from "next/navigation";
import { ProjectsCompletionCinematic } from "@/components/source/projects-completion-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";
export default async function ProjectsStartReviewPage() {
  const { locale } = await getRequestDictionary();
  const match = await findPlatformService("projects", "start");
  if (!match) notFound();
  return <ProjectsCompletionCinematic locale={locale} module={match.module} service={match.service} userLabel="Jenan BIZ Review" navigationMode="preview" />;
}
