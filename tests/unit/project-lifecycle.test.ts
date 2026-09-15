import { describe, expect, it } from "vitest";
import { ProjectPhaseStatus } from "@/generated/prisma/client";
import {
  deriveProjectTransition,
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
});
