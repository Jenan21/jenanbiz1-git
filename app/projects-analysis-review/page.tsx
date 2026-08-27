import { notFound } from "next/navigation";

import { ProjectsAnalysisCinematic } from "@/components/source/projects-analysis-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectsAnalysisReviewPage() {
  const { locale } = await getRequestDictionary();
  const match = await findPlatformService("projects", "analysis");
  if (!match) notFound();

  return (
    <ProjectsAnalysisCinematic
      locale={locale}
      module={match.module}
      service={match.service}
      userLabel="Jenan BIZ Review"
      navigationMode="preview"
    />
  );
}
