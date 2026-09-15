import { describe, expect, it } from "vitest";
import { ProjectPhaseStatus } from "@/generated/prisma/client";
import {
  assertValidProjectPhaseUpdate,
  deriveProjectTransition,
  projectAssessmentTypes,
  projectPhasePlan,
} from "@/services/projects/project-lifecycle";

describe("project lifecycle transitions", () => {
  it("advances to the next phase and activates it when a phase completes", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    const transition = deriveProjectTransition(
      projectPhasePlan.map((phase, index) => ({
        type: phase.type,
        sequence: phase.sequence,
        status: index === 0 ? ProjectPhaseStatus.ACTIVE : ProjectPhaseStatus.PENDING,
      })),
      "ANALYSIS",
      "COMPLETED",
      now,
    );

    expect(transition.project).toEqual({
      currentPhase: "FEASIBILITY",
      status: "FEASIBILITY",
    });
    expect(transition.nextPhaseActivation).toEqual({
      type: "FEASIBILITY",
      status: "ACTIVE",
      startedAt: now,
      completedAt: null,
    });
  });

  it("marks blocked work as on hold without advancing phases", () => {
    const transition = deriveProjectTransition(
      projectPhasePlan.map((phase, index) => ({
        type: phase.type,
        sequence: phase.sequence,
        status: index === 0 ? ProjectPhaseStatus.ACTIVE : ProjectPhaseStatus.PENDING,
      })),
      "ANALYSIS",
      "BLOCKED",
    );

    expect(transition.project).toEqual({
      currentPhase: "ANALYSIS",
      status: "ON_HOLD",
    });
    expect(transition).not.toHaveProperty("nextPhaseActivation");
  });

  it("completes the project when the final phase completes", () => {
    const transition = deriveProjectTransition(
      projectPhasePlan.map((phase) => ({
        type: phase.type,
        sequence: phase.sequence,
        status: phase.type === "COMPLETION" ? ProjectPhaseStatus.ACTIVE : ProjectPhaseStatus.COMPLETED,
      })),
      "COMPLETION",
      "COMPLETED",
    );

    expect(transition.project).toEqual({
      currentPhase: "COMPLETION",
      status: "COMPLETED",
    });
  });

  it("rejects activating a future phase before earlier phases complete", () => {
    expect(() =>
      assertValidProjectPhaseUpdate(
        projectPhasePlan.map((phase, index) => ({
          type: phase.type,
          sequence: phase.sequence,
          status: index === 0 ? ProjectPhaseStatus.ACTIVE : ProjectPhaseStatus.PENDING,
        })),
        "EVALUATION",
        "ACTIVE",
        0,
      ),
    ).toThrow("Complete earlier project phases");
  });

  it("rejects execution before all assessments complete", () => {
    expect(() =>
      assertValidProjectPhaseUpdate(
        projectPhasePlan.map((phase, index) => ({
          type: phase.type,
          sequence: phase.sequence,
          status:
            index < 4
              ? ProjectPhaseStatus.COMPLETED
              : index === 4
                ? ProjectPhaseStatus.PENDING
                : ProjectPhaseStatus.PENDING,
        })),
        "EXECUTION",
        "ACTIVE",
        projectAssessmentTypes.length - 1,
      ),
    ).toThrow("Complete all project assessments before execution");
  });
});
