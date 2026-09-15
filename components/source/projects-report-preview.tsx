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
  const module = await findPlatformModule("/projects");
  if (!module) return null;

  return (
    <ProjectsLiveExperience
      locale={locale}
      module={module}
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
