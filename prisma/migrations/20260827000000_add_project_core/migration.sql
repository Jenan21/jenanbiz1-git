DO $$
BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ANALYSIS', 'FEASIBILITY', 'EVALUATION', 'APPROVED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'REJECTED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectPhaseType" AS ENUM ('ANALYSIS', 'FEASIBILITY', 'EVALUATION', 'PLANNING', 'EXECUTION', 'REVIEW', 'COMPLETION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectPhaseStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectAssessmentType" AS ENUM ('MARKET', 'FINANCIAL', 'OPERATIONAL', 'RISK', 'TECHNICAL', 'COMPLIANCE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sector" TEXT,
  "countryCode" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
  "currentPhase" "ProjectPhaseType" NOT NULL DEFAULT 'ANALYSIS',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectPhase" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" "ProjectPhaseType" NOT NULL,
  "status" "ProjectPhaseStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "notes" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectPhase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProjectAssessment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" "ProjectAssessmentType" NOT NULL,
  "score" INTEGER,
  "status" "ProjectPhaseStatus" NOT NULL DEFAULT 'PENDING',
  "summary" TEXT,
  "source" TEXT,
  "assessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Project_slug_key" ON "Project"("slug");
CREATE INDEX IF NOT EXISTS "Project_createdById_status_idx" ON "Project"("createdById", "status");
CREATE INDEX IF NOT EXISTS "Project_organizationId_status_idx" ON "Project"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Project_countryCode_sector_idx" ON "Project"("countryCode", "sector");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPhase_projectId_type_key" ON "ProjectPhase"("projectId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectPhase_projectId_sequence_key" ON "ProjectPhase"("projectId", "sequence");
CREATE INDEX IF NOT EXISTS "ProjectPhase_projectId_status_idx" ON "ProjectPhase"("projectId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectAssessment_projectId_type_key" ON "ProjectAssessment"("projectId", "type");
CREATE INDEX IF NOT EXISTS "ProjectAssessment_projectId_status_idx" ON "ProjectAssessment"("projectId", "status");

DO $$
BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectPhase" ADD CONSTRAINT "ProjectPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProjectAssessment" ADD CONSTRAINT "ProjectAssessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$