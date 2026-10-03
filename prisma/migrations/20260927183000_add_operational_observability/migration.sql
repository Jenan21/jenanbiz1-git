-- CreateEnum
CREATE TYPE "WorkerNodeStatus" AS ENUM ('ONLINE', 'DEGRADED', 'OFFLINE', 'DRAINING');

-- CreateEnum
CREATE TYPE "OperationsJobStatus" AS ENUM ('QUEUED', 'LEASED', 'RETRYING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationalAlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationalAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BackupRecordStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RestoreDrillStatus" AS ENUM ('PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "WorkerNode" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkerNodeStatus" NOT NULL DEFAULT 'OFFLINE',
    "capabilities" JSONB,
    "version" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" "WorkerNodeStatus" NOT NULL,
    "loadPercent" INTEGER NOT NULL DEFAULT 0,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsQueue" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationsQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsJob" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "workerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "OperationsJobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "output" JSONB,
    "traceId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leasedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationsJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "severity" "OperationalAlertSeverity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "traceId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalAlert" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "severity" "OperationalAlertSeverity" NOT NULL,
    "status" "OperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "traceId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "storageKey" TEXT,
    "status" "BackupRecordStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "sizeBytes" BIGINT,
    "checksum" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreDrill" (
    "id" TEXT NOT NULL,
    "backupId" TEXT NOT NULL,
    "status" "RestoreDrillStatus" NOT NULL DEFAULT 'PLANNED',
    "target" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "evidence" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestoreDrill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerNode_key_key" ON "WorkerNode"("key");

-- CreateIndex
CREATE INDEX "WorkerNode_status_lastHeartbeatAt_idx" ON "WorkerNode"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_workerId_createdAt_idx" ON "WorkerHeartbeat"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerHeartbeat_traceId_idx" ON "WorkerHeartbeat"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsQueue_key_key" ON "OperationsQueue"("key");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsJob_idempotencyKey_key" ON "OperationsJob"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsJob_traceId_key" ON "OperationsJob"("traceId");

-- CreateIndex
CREATE INDEX "OperationsJob_queueId_status_priority_availableAt_idx" ON "OperationsJob"("queueId", "status", "priority", "availableAt");

-- CreateIndex
CREATE INDEX "OperationsJob_workerId_status_idx" ON "OperationsJob"("workerId", "status");

-- CreateIndex
CREATE INDEX "OperationsJob_leaseExpiresAt_idx" ON "OperationsJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "OperationalIncident_status_severity_openedAt_idx" ON "OperationalIncident"("status", "severity", "openedAt");

-- CreateIndex
CREATE INDEX "OperationalIncident_traceId_idx" ON "OperationalIncident"("traceId");

-- CreateIndex
CREATE INDEX "OperationalAlert_status_severity_createdAt_idx" ON "OperationalAlert"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "OperationalAlert_traceId_idx" ON "OperationalAlert"("traceId");

-- CreateIndex
CREATE INDEX "OperationalAlert_entityType_entityId_idx" ON "OperationalAlert"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "SystemLog_traceId_createdAt_idx" ON "SystemLog"("traceId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_level_source_createdAt_idx" ON "SystemLog"("level", "source", "createdAt");

-- CreateIndex
CREATE INDEX "BackupRecord_status_startedAt_idx" ON "BackupRecord"("status", "startedAt");

-- CreateIndex
CREATE INDEX "RestoreDrill_status_createdAt_idx" ON "RestoreDrill"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RestoreDrill_backupId_idx" ON "RestoreDrill"("backupId");

-- AddForeignKey
ALTER TABLE "WorkerHeartbeat" ADD CONSTRAINT "WorkerHeartbeat_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsJob" ADD CONSTRAINT "OperationsJob_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "OperationsQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsJob" ADD CONSTRAINT "OperationsJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalAlert" ADD CONSTRAINT "OperationalAlert_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "OperationalIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestoreDrill" ADD CONSTRAINT "RestoreDrill_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "BackupRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
