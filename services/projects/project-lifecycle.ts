import type {
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

function isResolvedPhase(status: ProjectPhaseStatus) {
  return status === "COMPLETED" || status === "SKIPPED";
}

function resolveProjectStatus(
  phaseType: ProjectPhaseType,
  phaseStatus: ProjectPhaseStatus,
): ProjectStatus {
 if (phaseStatus === "BLOCKED") return "ON_HOLD" as ProjectStatus;
 if (phaseType === "ANALYSIS") return "ANALYSIS" as ProjectStatus;
 if (phaseType === "FEASIBILITY") return "FEASIBILITY" as ProjectStatus;
 if (phaseType === "EVALUATION") return "EVALUATION" as ProjectStatus;
 if (phaseType === "PLANNING") return "APPROVED" as ProjectStatus;
  if (phaseType === "EXECUTION" || phaseType === "REVIEW") {
   return "IN_PROGRESS" as ProjectStatus;
  }
  return phaseStatus === "COMPLETED"
   ? ("COMPLETED" as ProjectStatus)
   : ("IN_PROGRESS" as ProjectStatus);
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
        status: "COMPLETED" as ProjectStatus,
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
            status: "ACTIVE" as ProjectPhaseStatus,
            startedAt: now,
            completedAt: null,
          }
        : undefined,
  } as const;
}

export function assertValidProjectPhaseUpdate(
  phases: ReadonlyArray<{
    type: ProjectPhaseType;
    status: ProjectPhaseStatus;
    sequence: number;
  }>,
  updatedPhaseType: ProjectPhaseType,
  updatedStatus: ProjectPhaseStatus,
  completedAssessmentCount: number,
) {
  const ordered = [...phases].sort((left, right) => left.sequence - right.sequence);
  const index = ordered.findIndex((phase) => phase.type === updatedPhaseType);

  if (index < 0) throw new Error("Unknown project phase");

  const target = ordered[index];
  const previous = ordered.slice(0, index);
  const previousResolved = previous.every((phase) => isResolvedPhase(phase.status));

  if (
    !previousResolved &&
    updatedStatus !== "PENDING" &&
    !(index === 0 && updatedPhaseType === "ANALYSIS")
  ) {
    throw new Error("Complete earlier project phases before advancing this phase");
  }

  if (updatedStatus === "COMPLETED" && target.status === "PENDING") {
    throw new Error("Activate a phase before marking it completed");
  }

  if (
    (updatedStatus === "ACTIVE" || updatedStatus === "COMPLETED") &&
    updatedPhaseType === "EXECUTION" &&
    completedAssessmentCount < projectAssessmentTypes.length
  ) {
    throw new Error("Complete all project assessments before execution");
  }
}
