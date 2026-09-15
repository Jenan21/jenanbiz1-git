import { describe, expect, it } from "vitest";

import { ProjectPhaseStatus } from "@/generated/prisma/client";
import {
  buildFeasibilityAssessmentDraft,
  buildProjectPortfolioStats,
  selectProject,
} from "@/services/projects/project-review-data";

const completedAssessments = [
  { type: "MARKET", score: 80, summary: "ok", source: "src" },
  { type: "FINANCIAL", score: 74, summary: "ok", source: "src" },
  { type: "OPERATIONAL", score: 78, summary: "ok", source: "src" },
  { type: "RISK", score: 62, summary: "ok", source: "src" },
  { type: "TECHNICAL", score: 85, summary: "ok", source: "src" },
  { type: "COMPLIANCE", score: 91, summary: "ok", source: "src" },
];

describe("project review data", () => {
  it("selects a preferred project when present", () => {
    const project = selectProject(
      [{ id: "first" }, { id: "second" }],
      "second",
    );

    expect(project?.id).toBe("second");
  });

  it("builds portfolio stats from live project records", () => {
    const stats = buildProjectPortfolioStats([
      {
        id: "p1",
        name: "A",
        status: "IN_PROGRESS",
        updatedAt: new Date(),
        phases: [
          { status: ProjectPhaseStatus.COMPLETED },
          { status: ProjectPhaseStatus.ACTIVE },
        ],
        assessments: completedAssessments,
      },
      {
        id: "p2",
        name: "B",
        status: "DRAFT",
        updatedAt: new Date(),
        phases: [
          { status: ProjectPhaseStatus.COMPLETED },
          { status: ProjectPhaseStatus.PENDING },
        ],
        assessments: completedAssessments.map((assessment, index) =>
          index === 0 ? { ...assessment, source: null } : assessment,
        ),
      },
    ] as never);

    expect(stats).toEqual({
      total: 2,
      active: 1,
      ready: 1,
      averageScore: 76,
      completionPercent: 50,
    });
  });

  it("creates a persisted feasibility assessment draft from live calculations", () => {
    const draft = buildFeasibilityAssessmentDraft({
      breakEvenUnits: 120,
      monthlyProfit: 15000,
      roiPercent: 68.4,
      paybackMonths: 14.2,
      monthlyRevenue: 40000,
    });

    expect(draft.source).toBe("Jenan BIZ feasibility engine");
    expect(draft.score).toBeGreaterThan(0);
    expect(draft.summary).toContain("Break-even units: 120");
    expect(draft.summary).toContain("ROI: 68.4%");
  });
});
