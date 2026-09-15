-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ANALYSIS', 'FEASIBILITY', 'EVALUATION', 'APPROVED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectPhaseType" AS ENUM ('ANALYSIS', 'FEASIBILITY', 'EVALUATION', 'PLANNING', 'EXECUTION', 'REVIEW', 'COMPLETION');

-- CreateEnum
CREATE TYPE "ProjectPhaseStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ProjectAssessmentType" AS ENUM ('MARKET', 'FINANCIAL', 'OPERATIONAL', 'RISK', 'TECHNICAL', 'COMPLIANCE');

-- CreateTable
CREATE TABLE "Project" (
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

-- CreateTable
CREATE TABLE "ProjectPhase" (
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

-- CreateTable
CREATE TABLE "ProjectAssessment" (
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

-- CreateTable
CREATE TABLE "ProjectIntelligenceSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" JSONB,
    "population" JSONB,
    "purchasingPower" JSONB,
    "competitors" JSONB,
    "sources" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectIntelligenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_createdById_status_idx" ON "Project"("createdById", "status");

-- CreateIndex
CREATE INDEX "Project_organizationId_status_idx" ON "Project"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Project_countryCode_sector_idx" ON "Project"("countryCode", "sector");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPhase_projectId_type_key" ON "ProjectPhase"("projectId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPhase_projectId_sequence_key" ON "ProjectPhase"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "ProjectPhase_projectId_status_idx" ON "ProjectPhase"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAssessment_projectId_type_key" ON "ProjectAssessment"("projectId", "type");

-- CreateIndex
CREATE INDEX "ProjectAssessment_projectId_status_idx" ON "ProjectAssessment"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectIntelligenceSnapshot_projectId_fetchedAt_idx" ON "ProjectIntelligenceSnapshot"("projectId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPhase" ADD CONSTRAINT "ProjectPhase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAssessment" ADD CONSTRAINT "ProjectAssessment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectIntelligenceSnapshot" ADD CONSTRAINT "ProjectIntelligenceSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
