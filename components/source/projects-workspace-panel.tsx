"use client";

import { ProjectsWorkspace, type Project } from "@/components/source/projects-workspace";
import type { Locale } from "@/types/i18n";

export function ProjectsWorkspacePanel({
  locale,
  focusMode,
  initialProjects,
  initialSelectedProjectId,
  title,
  helper,
  allowCreate,
}: {
  locale: Locale;
  focusMode?: "all" | "analysis" | "feasibility" | "evaluation" | "launch";
  initialProjects?: Project[];
  initialSelectedProjectId?: string;
  title?: string;
  helper?: string;
  allowCreate?: boolean;
}) {
  return (
    <ProjectsWorkspace
      locale={locale}
      focusMode={focusMode}
      initialProjects={initialProjects}
      initialSelectedProjectId={initialSelectedProjectId}
      title={title}
      helper={helper}
      allowCreate={allowCreate}
    />
  );
}
