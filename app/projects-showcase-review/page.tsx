import { notFound } from "next/navigation";

import { ProjectsCinematic } from "@/components/source/projects-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformModule } from "@/lib/platform/catalog";

export default async function ProjectsShowcaseReviewPage() {
  const { locale } = await getRequestDictionary();
  const catalogModule = await findPlatformModule("/projects");
  if (!catalogModule) notFound();

  return (
    <ProjectsCinematic
      locale={locale}
      module={catalogModule}
      userLabel="Jenan BIZ Review"
      reviewMode
    />
  );
}
