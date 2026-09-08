import { FundingAssessmentStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

type AssessmentInput = {
  countryCode: string;
  organizationType: string;
  growthStage: string;
  requestedAmountMinor: number;
  monthlyRevenueMinor: number;
  yearsOperating: number;
};

export function calculateFundingReadiness(input: AssessmentInput) {
  const annualRevenue = input.monthlyRevenueMinor * 12;
  const amountRatio = annualRevenue ? input.requestedAmountMinor / annualRevenue : Number.POSITIVE_INFINITY;
  const revenueScore = input.monthlyRevenueMinor > 0 ? 30 : 0;
  const operatingScore = input.yearsOperating >= 3 ? 25 : input.yearsOperating >= 1 ? 15 : 5;
  const requestScore = amountRatio <= 0.5 ? 25 : amountRatio <= 1 ? 15 : amountRatio <= 2 ? 5 : 0;
  const stageScore = input.growthStage === "OPERATING" || input.growthStage === "GROWING" ? 20 : 10;
  return Math.min(100, revenueScore + operatingScore + requestScore + stageScore);
}

export async function createFundingAssessment(input: AssessmentInput, userId: string) {
  const score = calculateFundingReadiness(input);
  return db.$transaction(async (transaction) => {
    const assessment = await transaction.fundingAssessment.create({
      data: { ...input, countryCode: input.countryCode.toUpperCase(), userId, score },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "funding.assessment.completed", entityType: "FundingAssessment", entityId: assessment.id, metadata: { score, countryCode: assessment.countryCode } as Prisma.InputJsonValue },
    });
    return assessment;
  });
}

export async function listFundingAssessments(userId: string) {
  return db.fundingAssessment.findMany({
    where: { userId, status: FundingAssessmentStatus.COMPLETED },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}