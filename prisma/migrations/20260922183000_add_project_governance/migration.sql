DO $$
BEGIN
  CREATE TYPE "ProjectDecisionVerdict" AS ENUM ('APPROVE', 'REJECT', 'RETURN_FOR_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectRiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'ACCEPTED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProjectAssessmentRevision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "summary" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAssessmentRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectDecision" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "decidedById" TEXT NOT NULL,
  "verdict" "ProjectDecisionVerdict" NOT NULL,
  "weightedScore" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDecision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectFinancialPlan" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "inputs" JSONB NOT NULL,
  "baseCase" JSONB NOT NULL,
  "scenarios" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectFinancialPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectRisk" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "likelihood" INTEGER NOT NULL,
  "impact" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "status" "ProjectRiskStatus" NOT NULL DEFAULT 'OPEN',
  "mitigation" TEXT NOT NULL,
  "ownerLabel" TEXT NOT NULL,
  "reviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectRisk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAssessmentRevision_assessmentId_version_key" ON "ProjectAssessmentRevision"("assessmentId", "version");
CREATE INDEX IF NOT EXISTS "ProjectAssessmentRevision_projectId_createdAt_idx" ON "ProjectAssessmentRevision"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectAssessmentRevision_recordedById_createdAt_idx" ON "ProjectAssessmentRevision"("recordedById", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectDecision_projectId_createdAt_idx" ON "ProjectDecision"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectDecision_decidedById_createdAt_idx" ON "ProjectDecision"("decidedById", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectFinancialPlan_projectId_version_key" ON "ProjectFinancialPlan"("projectId", "version");
CREATE INDEX IF NOT EXISTS "ProjectFinancialPlan_projectId_createdAt_idx" ON "ProjectFinancialPlan"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectFinancialPlan_createdById_createdAt_idx" ON "ProjectFinancialPlan"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "ProjectRisk_projectId_status_idx" ON "ProjectRisk"("projectId", "status");
CREATE INDEX IF NOT EXISTS "ProjectRisk_projectId_score_idx" ON "ProjectRisk"("projectId", "score");

DO $$
BEGIN
  ALTER TABLE "ProjectAssessmentRevision" ADD CONSTRAINT "ProjectAssessmentRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectAssessmentRevision" ADD CONSTRAINT "ProjectAssessmentRevision_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "ProjectAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectAssessmentRevision" ADD CONSTRAINT "ProjectAssessmentRevision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectDecision" ADD CONSTRAINT "ProjectDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectDecision" ADD CONSTRAINT "ProjectDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectFinancialPlan" ADD CONSTRAINT "ProjectFinancialPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectFinancialPlan" ADD CONSTRAINT "ProjectFinancialPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;