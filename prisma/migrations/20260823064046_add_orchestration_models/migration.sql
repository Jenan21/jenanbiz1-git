-- CreateEnum
CREATE TYPE "RobotStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVIEW', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PENDING_APPROVAL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewVerdict" AS ENUM ('APPROVE', 'DEFER', 'REJECT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SystemRole" ADD VALUE 'EMPLOYEE';
ALTER TYPE "SystemRole" ADD VALUE 'SUPERVISOR';
ALTER TYPE "SystemRole" ADD VALUE 'MANAGER';
ALTER TYPE "SystemRole" ADD VALUE 'ELITE_COMMITTEE';

-- CreateTable
CREATE TABLE "EmployeeHierarchy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "managerId" TEXT,
    "level" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeHierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Robot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "team" TEXT,
    "intelligence" INTEGER NOT NULL DEFAULT 0,
    "skill" INTEGER NOT NULL DEFAULT 0,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "status" "RobotStatus" NOT NULL DEFAULT 'PENDING',
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Robot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotTask" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" TEXT DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "missionId" TEXT,

    CONSTRAINT "RobotTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "requiredIntelligence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "robotTaskId" TEXT,
    "missionId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL,
    "robotId" TEXT,
    "robotTaskId" TEXT,
    "missionId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "computeCostMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "estimatedDuration" INTEGER,
    "actualDuration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningLog" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "robotTaskId" TEXT,
    "missionId" TEXT,
    "signal" TEXT NOT NULL,
    "scoreBefore" INTEGER NOT NULL DEFAULT 0,
    "scoreAfter" INTEGER NOT NULL DEFAULT 0,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotEvolution" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "intelligenceDelta" INTEGER NOT NULL DEFAULT 0,
    "skillDelta" INTEGER NOT NULL DEFAULT 0,
    "experienceDelta" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RobotEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedKnowledge" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "missionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelExecution" (
    "id" TEXT NOT NULL,
    "robotId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeReview" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "verdict" "ReviewVerdict" NOT NULL DEFAULT 'DEFER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitteeReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MissionToRobot" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MissionToRobot_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeHierarchy_userId_key" ON "EmployeeHierarchy"("userId");

-- CreateIndex
CREATE INDEX "EmployeeHierarchy_supervisorId_idx" ON "EmployeeHierarchy"("supervisorId");

-- CreateIndex
CREATE INDEX "EmployeeHierarchy_managerId_idx" ON "EmployeeHierarchy"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Robot_slug_key" ON "Robot"("slug");

-- CreateIndex
CREATE INDEX "Robot_status_idx" ON "Robot"("status");

-- CreateIndex
CREATE INDEX "Robot_isVisible_idx" ON "Robot"("isVisible");

-- CreateIndex
CREATE INDEX "RobotTask_robotId_status_idx" ON "RobotTask"("robotId", "status");

-- CreateIndex
CREATE INDEX "Mission_status_idx" ON "Mission"("status");

-- CreateIndex
CREATE INDEX "Evidence_robotId_verified_idx" ON "Evidence"("robotId", "verified");

-- CreateIndex
CREATE INDEX "Evidence_robotTaskId_idx" ON "Evidence"("robotTaskId");

-- CreateIndex
CREATE INDEX "Evidence_missionId_idx" ON "Evidence"("missionId");

-- CreateIndex
CREATE INDEX "CostRecord_robotId_createdAt_idx" ON "CostRecord"("robotId", "createdAt");

-- CreateIndex
CREATE INDEX "CostRecord_missionId_createdAt_idx" ON "CostRecord"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningLog_robotId_createdAt_idx" ON "LearningLog"("robotId", "createdAt");

-- CreateIndex
CREATE INDEX "RobotEvolution_robotId_createdAt_idx" ON "RobotEvolution"("robotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RobotEvolution_robotId_generation_key" ON "RobotEvolution"("robotId", "generation");

-- CreateIndex
CREATE INDEX "SharedKnowledge_confidence_idx" ON "SharedKnowledge"("confidence");

-- CreateIndex
CREATE INDEX "ModelExecution_provider_model_createdAt_idx" ON "ModelExecution"("provider", "model", "createdAt");

-- CreateIndex
CREATE INDEX "CommitteeReview_robotId_verdict_idx" ON "CommitteeReview"("robotId", "verdict");

-- CreateIndex
CREATE INDEX "_MissionToRobot_B_index" ON "_MissionToRobot"("B");

-- AddForeignKey
ALTER TABLE "EmployeeHierarchy" ADD CONSTRAINT "EmployeeHierarchy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHierarchy" ADD CONSTRAINT "EmployeeHierarchy_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeHierarchy" ADD CONSTRAINT "EmployeeHierarchy_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotTask" ADD CONSTRAINT "RobotTask_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotTask" ADD CONSTRAINT "RobotTask_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_robotTaskId_fkey" FOREIGN KEY ("robotTaskId") REFERENCES "RobotTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_robotTaskId_fkey" FOREIGN KEY ("robotTaskId") REFERENCES "RobotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_robotTaskId_fkey" FOREIGN KEY ("robotTaskId") REFERENCES "RobotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotEvolution" ADD CONSTRAINT "RobotEvolution_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedKnowledge" ADD CONSTRAINT "SharedKnowledge_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelExecution" ADD CONSTRAINT "ModelExecution_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeReview" ADD CONSTRAINT "CommitteeReview_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MissionToRobot" ADD CONSTRAINT "_MissionToRobot_A_fkey" FOREIGN KEY ("A") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MissionToRobot" ADD CONSTRAINT "_MissionToRobot_B_fkey" FOREIGN KEY ("B") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
