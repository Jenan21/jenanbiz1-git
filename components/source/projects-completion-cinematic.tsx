import { ProjectsLiveExperience } from "@/components/source/projects-live-experience";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import type { PlatformNavigationMode } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

export function ProjectsCompletionCinematic({
  locale,
  module,
  service,
  userId,
  userLabel,
  mode,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  service: PlatformServiceDefinition;
  userId: string;
  userLabel: string;
  mode?: "evaluation" | "launch";
  navigationMode?: PlatformNavigationMode;
}) {
  return (
    <ProjectsLiveExperience
      locale={locale}
      module={module}
      service={service}
      userId={userId}
      userLabel={userLabel}
      view={mode === "launch" ? "launch" : "evaluation"}
    />
  );
}
