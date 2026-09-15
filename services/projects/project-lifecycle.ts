import {
  ProjectAssessmentType,
  ProjectPhaseStatus,
  ProjectPhaseType,
  ProjectStatus,
} from "@/generated/prisma/client";

export const projectPhasePlan: ReadonlyArray<{
  type: ProjectPhaseType;
  title: string;
  sequence: number;
}> = [
  { type: "ANALYSIS", title: "Project analysis", sequence: 1 },
  { type: "FEASIBILITY", title: "Feasibility study", sequence: 2 },
  { type: "EVALUATION", title: "Project evaluation", sequence: 3 },
  { type: "PLANNING", title: "Delivery planning", sequence: 4 },
  { type: "EXECUTION", title: "Project launch", sequence: 5 },
  { type: "REVIEW", title: "Progress review", sequence: 6 },
  { type: "COMPLETION", title: "Completion", sequence: 7 },
] as const;

export const projectAssessmentTypes: readonly ProjectAssessmentType[] = [
  "MARKET",
  "FINANCIAL",
  "OPERATIONAL",
  "RISK",
  "TECHNICAL",
  "COMPLIANCE",
] as const;

function resolveProjectStatus(
  phaseType: ProjectPhaseType,
  phaseStatus: ProjectPhaseStatus,
) {
  if (phaseStatus === "BLOCKED") return ProjectStatus.ON_HOLD;
  if (phaseType === "ANALYSIS") return ProjectStatus.ANALYSIS;
  if (phaseType === "FEASIBILITY") return ProjectStatus.FEASIBILITY;
  if (phaseType === "EVALUATION") return ProjectStatus.EVALUATION;
  if (phaseType === "PLANNING") return ProjectStatus.APPROVED;
  if (phaseType === "EXECUTION" || phaseType === "REVIEW")
    return ProjectStatus.IN_PROGRESS;
  return phaseStatus === "COMPLETED"
    ? ProjectStatus.COMPLETED
    : ProjectStatus.IN_PROGRESS;
}

export function deriveProjectTransition(
  phases: ReadonlyArray<{
    type: ProjectPhaseType;
    status: ProjectPhaseStatus;
    sequence: number;
  }>,
  updatedPhaseType: ProjectPhaseType,
  updatedStatus: ProjectPhaseStatus,
  now = new Date(),
) {
  const ordered = [...phases].sort((left, right) => left.sequence - right.sequence);
  const index = ordered.findIndex((phase) => phase.type === updatedPhaseType);

  if (index < 0) throw new Error("Unknown project phase");

  if (updatedStatus !== "COMPLETED") {
    return {
      project: {
        currentPhase: updatedPhaseType,
        status: resolveProjectStatus(updatedPhaseType, updatedStatus),
      },
    } as const;
  }

  const nextPhase = ordered[index + 1];

  if (!nextPhase) {
    return {
      project: {
        currentPhase: updatedPhaseType,
        status: ProjectStatus.COMPLETED,
      },
    } as const;
  }

  return {
    project: {
      currentPhase: nextPhase.type,
      status: resolveProjectStatus(nextPhase.type, "ACTIVE"),
    },
    nextPhaseActivation:
      nextPhase.status === "PENDING"
        ? {
            type: nextPhase.type,
            status: ProjectPhaseStatus.ACTIVE,
            startedAt: now,
            completedAt: null,
          }
        : undefined,
  } as const;
}
