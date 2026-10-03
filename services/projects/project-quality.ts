import type { ProjectAssessmentType } from "@/generated/prisma/client";

export type AssessmentInput = {
  type: ProjectAssessmentType;
  score: number | null;
  summary: string | null;
  source: string | null;
};

const weights: Record<ProjectAssessmentType, number> = {
  MARKET: 25,
  FINANCIAL: 25,
  OPERATIONAL: 15,
  RISK: 15,
  TECHNICAL: 10,
  COMPLIANCE: 10,
};

export function assessProjectQuality(assessments: AssessmentInput[]) {
  const requiredTypes = Object.keys(weights) as ProjectAssessmentType[];
  const byType = new Map(assessments.map((assessment) => [assessment.type, assessment]));
  const missing = requiredTypes.filter((type) => {
    const assessment = byType.get(type);
    return !assessment || assessment.score === null || !assessment.summary?.trim() || !assessment.source?.trim();
  });
  const completed = requiredTypes.length - missing.length;
  const completeness = Math.round((completed / requiredTypes.length) * 100);
  const weightedScore = requiredTypes.reduce((total, type) => {
    const score = byType.get(type)?.score;
    return total + (score === null || score === undefined ? 0 : score * weights[type] / 100);
  }, 0);
  const score = Math.round(weightedScore);

  return {
    score,
    completeness,
    missing,
    readyForDecision: missing.length === 0,
    verdict: !missing.length ? (score >= 75 ? "APPROVE" : score >= 55 ? "REVIEW" : "REJECT") : "INCOMPLETE",
    weights,
  } as const;
}
