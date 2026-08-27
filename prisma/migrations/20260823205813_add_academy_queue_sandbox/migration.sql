-- CreateEnum
CREATE TYPE "AcademyQueueKind" AS ENUM ('ADMISSION', 'ENROLLMENT', 'EXAMINATION', 'CERTIFICATION', 'RETRAINING', 'RECERTIFICATION', 'CURRICULUM_CHANGE', 'GEOGRAPHY_REFRESH');

-- CreateEnum
CREATE TYPE "AcademyQueueItemStatus" AS ENUM ('PENDING', 'LEASED', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SandboxLabRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'CANCELLED', 'AWAITING_AI_PROVIDER');

-- CreateTable
CREATE TABLE "AcademyWorkQueue" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyWorkQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyQueueItem" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "profileId" TEXT,
    "kind" "AcademyQueueKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "status" "AcademyQueueItemStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxLabRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SandboxLabRunStatus" NOT NULL DEFAULT 'QUEUED',
    "providerState" "AIProviderReadiness" NOT NULL DEFAULT 'NOT_REQUIRED',
    "input" JSONB,
    "output" JSONB,
    "evidence" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxLabRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyWorkQueue_academyId_paused_idx" ON "AcademyWorkQueue"("academyId", "paused");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyWorkQueue_academyId_key_key" ON "AcademyWorkQueue"("academyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyQueueItem_idempotencyKey_key" ON "AcademyQueueItem"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AcademyQueueItem_queueId_status_priority_availableAt_idx" ON "AcademyQueueItem"("queueId", "status", "priority", "availableAt");

-- CreateIndex
CREATE INDEX "AcademyQueueItem_profileId_kind_idx" ON "AcademyQueueItem"("profileId", "kind");

-- CreateIndex
CREATE INDEX "AcademyQueueItem_leaseExpiresAt_idx" ON "AcademyQueueItem"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxLabRun_idempotencyKey_key" ON "SandboxLabRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SandboxLabRun_status_providerState_idx" ON "SandboxLabRun"("status", "providerState");

-- CreateIndex
CREATE INDEX "SandboxLabRun_profileId_labId_idx" ON "SandboxLabRun"("profileId", "labId");

-- AddForeignKey
ALTER TABLE "AcademyWorkQueue" ADD CONSTRAINT "AcademyWorkQueue_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyQueueItem" ADD CONSTRAINT "AcademyQueueItem_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "AcademyWorkQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyQueueItem" ADD CONSTRAINT "AcademyQueueItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxLabRun" ADD CONSTRAINT "SandboxLabRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxLabRun" ADD CONSTRAINT "SandboxLabRun_labId_fkey" FOREIGN KEY ("labId") REFERENCES "AcademyLab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
