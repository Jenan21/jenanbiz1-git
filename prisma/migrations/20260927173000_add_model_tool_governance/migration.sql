CREATE TYPE "ModelRegistryStatus" AS ENUM ('ACTIVE', 'DEGRADED', 'DISABLED');
CREATE TYPE "ToolRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "ToolExecutionStatus" AS ENUM ('PENDING_APPROVAL', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DENIED');
CREATE TYPE "ToolApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ModelRegistryEntry" (
  "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "modelKey" TEXT NOT NULL, "displayName" TEXT NOT NULL,
  "capabilities" JSONB, "status" "ModelRegistryStatus" NOT NULL DEFAULT 'DISABLED', "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "averageLatencyMs" INTEGER NOT NULL DEFAULT 0, "inputCostPerMillionMinor" INTEGER NOT NULL DEFAULT 0,
  "outputCostPerMillionMinor" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'USD', "contextWindow" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelRegistryEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ModelRoutingRule" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "taskType" TEXT NOT NULL, "modelId" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 0,
  "minimumQuality" INTEGER NOT NULL DEFAULT 0, "maximumLatencyMs" INTEGER, "maximumCostMinor" INTEGER, "requiredCapabilities" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ModelRoutingRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ModelFallbackLink" (
  "id" TEXT NOT NULL, "primaryModelId" TEXT NOT NULL, "fallbackModelId" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 0,
  "condition" JSONB, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelFallbackLink_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ToolDefinition" (
  "id" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "handlerId" TEXT NOT NULL,
  "riskLevel" "ToolRiskLevel" NOT NULL DEFAULT 'LOW', "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolDefinition_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ToolPermission" (
  "id" TEXT NOT NULL, "toolId" TEXT NOT NULL, "role" "SystemRole" NOT NULL, "allowed" BOOLEAN NOT NULL DEFAULT false,
  "approvalRequired" BOOLEAN NOT NULL DEFAULT false, "scopes" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ToolPermission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ToolExecution" (
  "id" TEXT NOT NULL, "toolId" TEXT NOT NULL, "actorId" TEXT, "status" "ToolExecutionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "traceId" TEXT NOT NULL, "input" JSONB NOT NULL, "output" JSONB, "error" TEXT, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ToolApproval" (
  "id" TEXT NOT NULL, "executionId" TEXT NOT NULL, "requestedById" TEXT, "decidedById" TEXT,
  "status" "ToolApprovalStatus" NOT NULL DEFAULT 'PENDING', "rationale" TEXT, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3), CONSTRAINT "ToolApproval_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ModelExecution" ADD COLUMN "registryModelId" TEXT, ADD COLUMN "routingRuleId" TEXT, ADD COLUMN "fallbackFromId" TEXT,
  ADD COLUMN "costMinor" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "qualityScore" INTEGER, ADD COLUMN "error" TEXT, ADD COLUMN "traceId" TEXT;

CREATE UNIQUE INDEX "ModelRegistryEntry_provider_modelKey_key" ON "ModelRegistryEntry"("provider", "modelKey");
CREATE INDEX "ModelRegistryEntry_status_enabled_qualityScore_idx" ON "ModelRegistryEntry"("status", "enabled", "qualityScore");
CREATE INDEX "ModelRoutingRule_taskType_enabled_priority_idx" ON "ModelRoutingRule"("taskType", "enabled", "priority");
CREATE INDEX "ModelRoutingRule_modelId_idx" ON "ModelRoutingRule"("modelId");
CREATE UNIQUE INDEX "ModelFallbackLink_primaryModelId_fallbackModelId_key" ON "ModelFallbackLink"("primaryModelId", "fallbackModelId");
CREATE INDEX "ModelFallbackLink_primaryModelId_enabled_priority_idx" ON "ModelFallbackLink"("primaryModelId", "enabled", "priority");
CREATE UNIQUE INDEX "ToolDefinition_key_key" ON "ToolDefinition"("key");
CREATE UNIQUE INDEX "ToolPermission_toolId_role_key" ON "ToolPermission"("toolId", "role");
CREATE INDEX "ToolPermission_role_allowed_idx" ON "ToolPermission"("role", "allowed");
CREATE UNIQUE INDEX "ToolExecution_traceId_key" ON "ToolExecution"("traceId");
CREATE INDEX "ToolExecution_toolId_status_createdAt_idx" ON "ToolExecution"("toolId", "status", "createdAt");
CREATE INDEX "ToolExecution_actorId_createdAt_idx" ON "ToolExecution"("actorId", "createdAt");
CREATE UNIQUE INDEX "ToolApproval_executionId_key" ON "ToolApproval"("executionId");
CREATE INDEX "ModelExecution_registryModelId_createdAt_idx" ON "ModelExecution"("registryModelId", "createdAt");
CREATE INDEX "ModelExecution_routingRuleId_idx" ON "ModelExecution"("routingRuleId");
CREATE INDEX "ModelExecution_traceId_idx" ON "ModelExecution"("traceId");

ALTER TABLE "ModelRoutingRule" ADD CONSTRAINT "ModelRoutingRule_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ModelRegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelFallbackLink" ADD CONSTRAINT "ModelFallbackLink_primaryModelId_fkey" FOREIGN KEY ("primaryModelId") REFERENCES "ModelRegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelFallbackLink" ADD CONSTRAINT "ModelFallbackLink_fallbackModelId_fkey" FOREIGN KEY ("fallbackModelId") REFERENCES "ModelRegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModelExecution" ADD CONSTRAINT "ModelExecution_registryModelId_fkey" FOREIGN KEY ("registryModelId") REFERENCES "ModelRegistryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelExecution" ADD CONSTRAINT "ModelExecution_routingRuleId_fkey" FOREIGN KEY ("routingRuleId") REFERENCES "ModelRoutingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelExecution" ADD CONSTRAINT "ModelExecution_fallbackFromId_fkey" FOREIGN KEY ("fallbackFromId") REFERENCES "ModelRegistryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolPermission" ADD CONSTRAINT "ToolPermission_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolApproval" ADD CONSTRAINT "ToolApproval_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ToolExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolApproval" ADD CONSTRAINT "ToolApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolApproval" ADD CONSTRAINT "ToolApproval_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;