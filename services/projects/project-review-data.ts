import type {
  ProjectAssessment,
  ProjectIntelligenceSnapshot,
  ProjectPhase,
  ProjectStatus,
} from "@/generated/prisma/client";
import { assessProjectQuality } from "@/services/projects/project-quality";

type ProjectReviewRecord = {
  id: string;
  name: string;
  status: ProjectStatus;
  updatedAt: Date;
  phases: ProjectPhase[];
  assessments: ProjectAssessment[];
  intelligenceSnapshots?: ProjectIntelligenceSnapshot[];
};

export function selectProject<T extends { id: string }>(
  projects: readonly T[],
  preferredId?: string | null,
) {
  if (!projects.length) return null;
  if (preferredId) {
    const matched = projects.find((project) => project.id === preferredId);
    if (matched) return matched;
  }
  return projects[0] ?? null;
}

export function buildProjectPortfolioStats(projects: readonly ProjectReviewRecord[]) {
  const total = projects.length;
  const active = projects.filter((project) => project.status === "IN_PROGRESS").length;
  const ready = projects.filter(
    (project) => assessProjectQuality(project.assessments).readyForDecision,
  ).length;
  const averageScore = total
    ? Math.round(
        projects.reduce(
          (sum, project) => sum + assessProjectQuality(project.assessments).score,
          0,
        ) / total,
      )
    : 0;
  const completedPhases = projects.reduce(
    (sum, project) =>
      sum +
      project.phases.filter((phase) => phase.status === "COMPLETED").length,
    0,
  );
  const totalPhases = projects.reduce((sum, project) => sum + project.phases.length, 0);

  return {
    total,
    active,
    ready,
    averageScore,
    completionPercent: totalPhases ? Math.round((completedPhases / totalPhases) * 100) : 0,
  } as const;
}

export function getLatestProjectIntelligence(
  project: Pick<ProjectReviewRecord, "intelligenceSnapshots"> | null,
) {
  return project?.intelligenceSnapshots?.[0] ?? null;
}

export function buildFeasibilityAssessmentDraft(input: {
  breakEvenUnits: number;
  monthlyProfit: number;
  roiPercent: number;
  paybackMonths: number | null;
  monthlyRevenue?: number;
}) {
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        45 +
          Math.min(input.roiPercent, 80) * 0.35 +
          (input.monthlyProfit > 0 ? 18 : 0) +
          (input.paybackMonths !== null && input.paybackMonths <= 24 ? 9 : 0) -
          Math.min(input.breakEvenUnits / 200, 18),
      ),
    ),
  );

  const summary = [
    `Break-even units: ${input.breakEvenUnits}`,
    `Monthly profit: ${input.monthlyProfit.toFixed(2)}`,
    `ROI: ${input.roiPercent.toFixed(1)}%`,
    `Payback months: ${input.paybackMonths === null ? "not reached" : input.paybackMonths.toFixed(1)}`,
    input.monthlyRevenue !== undefined
      ? `Monthly revenue: ${input.monthlyRevenue.toFixed(2)}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    score,
    source: "Jenan BIZ feasibility engine",
    summary,
  } as const;
}
