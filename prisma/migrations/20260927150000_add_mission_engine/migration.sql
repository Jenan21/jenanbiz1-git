CREATE TYPE "MissionRunStatus" AS ENUM ('CREATED', 'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'RETRY', 'FALLBACK', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "MissionSubtaskStatus" AS ENUM ('PENDING', 'READY', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "MissionAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "MissionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');
CREATE TYPE "MissionEscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "MissionRetryBackoff" AS ENUM ('FIXED', 'LINEAR', 'EXPONENTIAL');
CREATE TYPE "MissionDependencyType" AS ENUM ('REQUIRES', 'BLOCKS');

CREATE TABLE "MissionRun" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "createdById" TEXT,
  "status" "MissionRunStatus" NOT NULL DEFAULT 'CREATED',
  "traceId" TEXT NOT NULL,
  "currentAttempt" INTEGER NOT NULL DEFAULT 0,
  "queuedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionSubtask" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "parentId" TEXT,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "MissionSubtaskStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionSubtask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionDependency" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "predecessorId" TEXT NOT NULL,
  "successorId" TEXT NOT NULL,
  "type" "MissionDependencyType" NOT NULL DEFAULT 'REQUIRES',
  "condition" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionRetryPolicy" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "backoff" "MissionRetryBackoff" NOT NULL DEFAULT 'EXPONENTIAL',
  "baseDelaySeconds" INTEGER NOT NULL DEFAULT 30,
  "maximumDelaySeconds" INTEGER NOT NULL DEFAULT 3600,
  "retryableErrors" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionRetryPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionFallbackPolicy" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "provider" TEXT,
  "model" TEXT,
  "toolId" TEXT,
  "condition" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionFallbackPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionAttempt" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "subtaskId" TEXT,
  "fallbackPolicyId" TEXT,
  "attempt" INTEGER NOT NULL,
  "attemptKey" TEXT NOT NULL,
  "status" "MissionAttemptStatus" NOT NULL DEFAULT 'RUNNING',
  "provider" TEXT,
  "model" TEXT,
  "output" JSONB,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MissionAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionApproval" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "requestedById" TEXT,
  "decidedById" TEXT,
  "gate" TEXT NOT NULL,
  "status" "MissionApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "rationale" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "MissionApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionEscalation" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "approvalId" TEXT,
  "actorId" TEXT,
  "level" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT NOT NULL,
  "assignedRole" "SystemRole",
  "status" "MissionEscalationStatus" NOT NULL DEFAULT 'OPEN',
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionEscalation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionHistory" (
  "id" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "runId" TEXT,
  "actorId" TEXT,
  "event" TEXT NOT NULL,
  "fromStatus" "MissionRunStatus",
  "toStatus" "MissionRunStatus",
  "traceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionHistory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Evidence" ADD COLUMN "missionRunId" TEXT, ADD COLUMN "attemptId" TEXT;
ALTER TABLE "CostRecord" ADD COLUMN "missionRunId" TEXT, ADD COLUMN "attemptId" TEXT;

CREATE UNIQUE INDEX "MissionRun_traceId_key" ON "MissionRun"("traceId");
CREATE INDEX "MissionRun_missionId_status_createdAt_idx" ON "MissionRun"("missionId", "status", "createdAt");
CREATE UNIQUE INDEX "MissionSubtask_runId_key_key" ON "MissionSubtask"("runId", "key");
CREATE INDEX "MissionSubtask_runId_status_sequence_idx" ON "MissionSubtask"("runId", "status", "sequence");
CREATE INDEX "MissionSubtask_parentId_idx" ON "MissionSubtask"("parentId");
CREATE UNIQUE INDEX "MissionDependency_predecessorId_successorId_key" ON "MissionDependency"("predecessorId", "successorId");
CREATE INDEX "MissionDependency_runId_idx" ON "MissionDependency"("runId");
CREATE INDEX "MissionDependency_successorId_idx" ON "MissionDependency"("successorId");
CREATE UNIQUE INDEX "MissionRetryPolicy_missionId_key" ON "MissionRetryPolicy"("missionId");
CREATE UNIQUE INDEX "MissionFallbackPolicy_missionId_priority_key" ON "MissionFallbackPolicy"("missionId", "priority");
CREATE INDEX "MissionFallbackPolicy_missionId_active_priority_idx" ON "MissionFallbackPolicy"("missionId", "active", "priority");
CREATE UNIQUE INDEX "MissionAttempt_attemptKey_key" ON "MissionAttempt"("attemptKey");
CREATE INDEX "MissionAttempt_runId_attempt_idx" ON "MissionAttempt"("runId", "attempt");
CREATE INDEX "MissionAttempt_subtaskId_attempt_idx" ON "MissionAttempt"("subtaskId", "attempt");
CREATE INDEX "MissionApproval_runId_status_requestedAt_idx" ON "MissionApproval"("runId", "status", "requestedAt");
CREATE INDEX "MissionEscalation_runId_status_createdAt_idx" ON "MissionEscalation"("runId", "status", "createdAt");
CREATE INDEX "MissionEscalation_approvalId_idx" ON "MissionEscalation"("approvalId");
CREATE INDEX "MissionHistory_missionId_createdAt_idx" ON "MissionHistory"("missionId", "createdAt");
CREATE INDEX "MissionHistory_runId_createdAt_idx" ON "MissionHistory"("runId", "createdAt");
CREATE INDEX "MissionHistory_traceId_idx" ON "MissionHistory"("traceId");
CREATE INDEX "Evidence_missionRunId_createdAt_idx" ON "Evidence"("missionRunId", "createdAt");
CREATE INDEX "Evidence_attemptId_idx" ON "Evidence"("attemptId");
CREATE INDEX "CostRecord_missionRunId_createdAt_idx" ON "CostRecord"("missionRunId", "createdAt");
CREATE INDEX "CostRecord_attemptId_idx" ON "CostRecord"("attemptId");

ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionRun" ADD CONSTRAINT "MissionRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionSubtask" ADD CONSTRAINT "MissionSubtask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionSubtask" ADD CONSTRAINT "MissionSubtask_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MissionSubtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionDependency" ADD CONSTRAINT "MissionDependency_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionDependency" ADD CONSTRAINT "MissionDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "MissionSubtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionDependency" ADD CONSTRAINT "MissionDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "MissionSubtask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionRetryPolicy" ADD CONSTRAINT "MissionRetryPolicy_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionFallbackPolicy" ADD CONSTRAINT "MissionFallbackPolicy_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionAttempt" ADD CONSTRAINT "MissionAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionAttempt" ADD CONSTRAINT "MissionAttempt_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "MissionSubtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionAttempt" ADD CONSTRAINT "MissionAttempt_fallbackPolicyId_fkey" FOREIGN KEY ("fallbackPolicyId") REFERENCES "MissionFallbackPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionApproval" ADD CONSTRAINT "MissionApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionApproval" ADD CONSTRAINT "MissionApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionApproval" ADD CONSTRAINT "MissionApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionEscalation" ADD CONSTRAINT "MissionEscalation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionEscalation" ADD CONSTRAINT "MissionEscalation_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "MissionApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionEscalation" ADD CONSTRAINT "MissionEscalation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionHistory" ADD CONSTRAINT "MissionHistory_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionHistory" ADD CONSTRAINT "MissionHistory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MissionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissionHistory" ADD CONSTRAINT "MissionHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "MissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_missionRunId_fkey" FOREIGN KEY ("missionRunId") REFERENCES "MissionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "MissionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;