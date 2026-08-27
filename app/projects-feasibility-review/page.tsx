import { notFound } from "next/navigation";

import { ProjectsFeasibilityCinematic } from "@/components/source/projects-feasibility-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function ProjectsFeasibilityReviewPage() {
  const { locale } = await getRequestDictionary();
  const match = await findPlatformService("projects", "feasibility-study");
  if (!match) notFound();
  return (
    <ProjectsFeasibilityCinematic
      locale={locale}
      module={match.module}
      service={match.service}
      userLabel="Jenan BIZ Review"
      navigationMode="preview"
    />
  );
}
