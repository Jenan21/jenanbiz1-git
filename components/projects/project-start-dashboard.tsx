import { ProjectStartWorkspace } from "@/components/projects/project-start-workspace";
import type { Locale } from "@/types/i18n";

export function ProjectStartDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  return (
    <ProjectStartWorkspace
      locale={locale}
      route="/projects/start"
      userLabel={userLabel}
    />
  );
}
