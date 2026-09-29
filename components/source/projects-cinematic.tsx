import { ProjectsLiveExperience } from "@/components/source/projects-live-experience";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

export function ProjectsCinematic({
  locale,
  module,
  userId,
  userLabel,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  userId: string;
  userLabel: string;
  reviewMode?: boolean;
}) {
  return (
    <ProjectsLiveExperience
      locale={locale}
      module={module}
      userId={userId}
      userLabel={userLabel}
      view="showcase"
    />
  );
}
