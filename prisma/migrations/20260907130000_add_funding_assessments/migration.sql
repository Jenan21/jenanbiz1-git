CREATE TYPE "FundingAssessmentStatus" AS ENUM ('COMPLETED', 'ARCHIVED');

CREATE TABLE "FundingAssessment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "organizationType" TEXT NOT NULL,
  "growthStage" TEXT NOT NULL,
  "requestedAmountMinor" INTEGER NOT NULL,
  "monthlyRevenueMinor" INTEGER NOT NULL,
  "yearsOperating" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "status" "FundingAssessmentStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FundingAssessment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FundingAssessment_userId_status_createdAt_idx" ON "FundingAssessment"("userId", "status", "createdAt");
CREATE INDEX "FundingAssessment_countryCode_createdAt_idx" ON "FundingAssessment"("countryCode", "createdAt");
ALTER TABLE "FundingAssessment" ADD CONSTRAINT "FundingAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;