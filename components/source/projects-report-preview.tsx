import { ProjectsLiveExperience } from "@/components/source/projects-live-experience";
import { findPlatformModule } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

type ReportVariant = "executive" | "feasibility" | "evaluation";

export async function ProjectsReportPreview({
  locale,
  userId,
  userLabel,
  variant,
}: {
  locale: Locale;
  userId: string;
  userLabel: string;
  variant: ReportVariant;
}) {
  const projectModule = await findPlatformModule("/projects");
  if (!projectModule) return null;

  return (
    <ProjectsLiveExperience
      locale={locale}
      module={projectModule}
      userId={userId}
      userLabel={userLabel}
      view={
        variant === "feasibility"
          ? "feasibility-report"
          : variant === "evaluation"
            ? "evaluation-report"
            : "executive-report"
      }
    />
  );
}
