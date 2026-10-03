import { assessProjectQuality, type AssessmentInput } from "./project-quality";

type DatedAssessment = AssessmentInput & {
  assessedAt?: Date | string | null;
  evidenceFiles?: Array<{ fileAssetId: string; checksum?: string | null; fileAsset?: { checksum?: string | null } }>;
};
type ReadinessProject = {
  assessments: DatedAssessment[];
  financialPlans: Array<{ id?: string; createdAt: Date | string; baseCase?: unknown }>;
  decisions: Array<{ verdict: string; createdAt: Date | string; evidenceSnapshot?: unknown }>;
  risks: Array<{ score: number; status: string; reviewAt?: Date | string | null }>;
  complianceItems: Array<{ status: string }>;
  phases: Array<{ type: string; status: string }>;
  evidenceFiles: Array<{ checksum: string | null }>;
  intelligenceSnapshots?: Array<{ fetchedAt?: Date | string }>;
};

export function isProjectDecisionCurrent(project: Pick<ReadinessProject, "assessments" | "decisions" | "financialPlans">) {
  const decision = project.decisions[0];
  if (!decision || !decision.evidenceSnapshot || typeof decision.evidenceSnapshot !== "object" || Array.isArray(decision.evidenceSnapshot)) return false;
  const evidence = decision.evidenceSnapshot as { assessments?: DatedAssessment[]; financialPlanId?: string };
  if (!Array.isArray(evidence.assessments) || !project.financialPlans[0]?.id || evidence.financialPlanId !== project.financialPlans[0].id) return false;
  const snapshot = evidence.assessments;
  return project.assessments.length === snapshot.length && project.assessments.every((assessment) =>
    snapshot.some((saved) => {
      const savedFiles = (saved.evidenceFiles ?? []).map((file) => `${file.fileAssetId}:${file.checksum ?? file.fileAsset?.checksum ?? ""}`).sort();
      const currentFiles = (assessment.evidenceFiles ?? []).map((file) => `${file.fileAssetId}:${file.fileAsset?.checksum ?? ""}`).sort();
      return saved.type === assessment.type && saved.score === assessment.score && saved.summary === assessment.summary && saved.source === assessment.source &&
        (saved.assessedAt ? new Date(saved.assessedAt).getTime() : null) === (assessment.assessedAt ? new Date(assessment.assessedAt).getTime() : null) &&
        savedFiles.length === currentFiles.length && savedFiles.every((file, index) => file === currentFiles[index]);
    }),
  );
}

export function assessProjectReadiness(project: ReadinessProject, now = new Date()) {
  const quality = assessProjectQuality(project.assessments);
  const decisionCurrent = isProjectDecisionCurrent(project);
  const fetchedAt = project.intelligenceSnapshots?.[0]?.fetchedAt;
  const fetchedAtTime = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  const marketResearchAgeDays = Number.isFinite(fetchedAtTime) && fetchedAtTime <= now.getTime()
    ? Math.floor((now.getTime() - fetchedAtTime) / 86_400_000)
    : null;
  const marketResearchFreshness = !fetchedAt
    ? "UNAVAILABLE"
    : marketResearchAgeDays === null
      ? "UNKNOWN"
      : marketResearchAgeDays > 90
        ? "STALE"
        : "FRESH";
  const highOpenRisks = project.risks.filter((risk) => risk.score >= 15 && risk.status === "OPEN").length;
  const overdueRiskReviews = project.risks.filter((risk) => risk.status !== "CLOSED" && risk.reviewAt && new Date(risk.reviewAt).getTime() < now.getTime()).length;
  const pendingCompliance = project.complianceItems.filter((item) => !["APPROVED", "NOT_APPLICABLE"].includes(item.status)).length;
  const incompletePhases = ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING"].filter((type) => !project.phases.some((phase) => phase.type === type && phase.status === "COMPLETED"));
  const blockers = [
    ...(!quality.readyForDecision || quality.verdict !== "APPROVE" ? ["INCOMPLETE_OR_UNAPPROVED_ASSESSMENTS"] : []),
    ...(!project.financialPlans.length ? ["NO_SAVED_FINANCIAL_PLAN"] : []),
    ...(project.decisions[0]?.verdict !== "APPROVE" ? ["NO_APPROVAL_DECISION"] : []),
    ...(project.decisions[0] && !decisionCurrent ? ["APPROVAL_REQUIRES_REVIEW"] : []),
    ...(highOpenRisks ? ["OPEN_HIGH_RISKS"] : []),
    ...(incompletePhases.length ? ["INCOMPLETE_PREREQUISITE_PHASES"] : []),
  ];
  return {
    quality, decisionCurrent, highOpenRisks, overdueRiskReviews, pendingCompliance, incompletePhases,
    marketResearch: { freshness: marketResearchFreshness, ageDays: marketResearchAgeDays, fetchedAt: fetchedAt ?? null },
    checksummedFiles: project.evidenceFiles.filter((file) => Boolean(file.checksum)).length,
    evidenceFiles: project.evidenceFiles.length,
    blockers, readyToLaunch: blockers.length === 0,
    assurance: "USER_RECORDED_NOT_INDEPENDENTLY_VERIFIED" as const,
  };
}
