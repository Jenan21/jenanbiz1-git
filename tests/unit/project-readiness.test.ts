import { describe, expect, it } from "vitest";
import { assessProjectReadiness, isProjectDecisionCurrent } from "@/services/projects/project-readiness";
import type { AssessmentInput } from "@/services/projects/project-quality";

const assessments = (["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const).map((type) => ({
  type, score: 80, summary: "Reviewed input", source: "User source", assessedAt: "2026-01-01T00:00:00Z", evidenceFiles: [] as Array<{ fileAssetId: string; checksum?: string | null; fileAsset?: { checksum?: string | null } }>,
}));
function project() {
  return {
    assessments: assessments.map((item) => ({ ...item })),
    financialPlans: [{ id: "finance-1", createdAt: "2026-01-02T00:00:00Z" }],
    decisions: [{ verdict: "APPROVE", createdAt: "2026-01-03T00:00:00Z", evidenceSnapshot: { financialPlanId: "finance-1", assessments: assessments.map((item) => ({ ...item })) } }],
    phases: ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING"].map((type) => ({ type, status: "COMPLETED" })),
    risks: [{ score: 16, status: "MITIGATING", reviewAt: "2026-01-04T00:00:00Z" }],
    complianceItems: [{ status: "SUBMITTED" }],
    evidenceFiles: [{ checksum: "checksum" }, { checksum: null }],
    intelligenceSnapshots: [] as Array<{ fetchedAt: string }>,
  };
}

describe("project review readiness", () => {
  it("separates launch gates from advisory compliance and source-review checks", () => {
    const review = assessProjectReadiness(project(), new Date("2026-02-01"));
    expect(review.readyToLaunch).toBe(true);
    expect(review.overdueRiskReviews).toBe(1);
    expect(review.pendingCompliance).toBe(1);
    expect(review.checksummedFiles).toBe(1);
    expect(review.assurance).toBe("USER_RECORDED_NOT_INDEPENDENTLY_VERIFIED");
  });
  it("requires a new decision when evidence or financial version changes", () => {
    const input = project();
    input.assessments[0]!.source = "Changed source";
    expect(isProjectDecisionCurrent(input)).toBe(false);
    expect(assessProjectReadiness(input).blockers).toContain("APPROVAL_REQUIRES_REVIEW");
    input.assessments = assessments.map((item) => ({ ...item }));
    input.financialPlans[0]!.id = "finance-2";
    expect(isProjectDecisionCurrent(input)).toBe(false);
  });
  it("fails closed for missing snapshot, missing prerequisite phases and high open risks", () => {
    const input = project();
    input.decisions[0]!.evidenceSnapshot.assessments = [];
    input.risks[0]!.status = "OPEN";
    input.phases = [];
    const result = assessProjectReadiness(input);
    expect(result.readyToLaunch).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(["APPROVAL_REQUIRES_REVIEW", "OPEN_HIGH_RISKS", "INCOMPLETE_PREREQUISITE_PHASES"]));
  });
  it("requires matching assessment timestamps even if the score is unchanged", () => {
    const input = project();
    input.assessments[0]!.assessedAt = "2026-01-04T00:00:00Z";
    expect(isProjectDecisionCurrent(input)).toBe(false);
    expect(assessProjectReadiness({ ...input, assessments: [] as AssessmentInput[] }).quality.verdict).toBe("INCOMPLETE");
  });
  it("invalidates approval when linked source files are removed or changed", () => {
    const input = project();
    input.assessments[0]!.evidenceFiles = [{ fileAssetId: "file-1", fileAsset: { checksum: "sha-1" } }];
    input.decisions[0]!.evidenceSnapshot.assessments[0]!.evidenceFiles = [{ fileAssetId: "file-1", checksum: "sha-1" }];
    expect(isProjectDecisionCurrent(input)).toBe(true);
    input.assessments[0]!.evidenceFiles = [];
    expect(isProjectDecisionCurrent(input)).toBe(false);
  });
  it("reports saved research age as an advisory without blocking launch", () => {
    const input = project();
    const now = new Date("2026-04-02T00:00:00Z");
    expect(assessProjectReadiness(input, now).marketResearch.freshness).toBe("UNAVAILABLE");
    input.intelligenceSnapshots = [{ fetchedAt: "2026-01-01T00:00:00Z" }];
    const stale = assessProjectReadiness(input, now);
    expect(stale.marketResearch).toMatchObject({ freshness: "STALE", ageDays: 91 });
    expect(stale.readyToLaunch).toBe(true);
    input.intelligenceSnapshots = [{ fetchedAt: "2026-04-03T00:00:00Z" }];
    expect(assessProjectReadiness(input, now).marketResearch.freshness).toBe("UNKNOWN");
  });
});
