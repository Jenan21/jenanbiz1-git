CREATE TYPE "DataCenterPublicationState" AS ENUM (
  'DRAFT',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'DEPRECATED',
  'ARCHIVED',
  'REJECTED'
);

CREATE TYPE "DataCenterScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'USER_PRIVATE');

CREATE TYPE "DataCenterVerificationStatus" AS ENUM (
  'VERIFIED',
  'ESTIMATED',
  'DERIVED',
  'UNVERIFIED',
  'CONFLICTED'
);

CREATE TYPE "DataCenterOwnership" AS ENUM (
  'JENAN_OWNED',
  'OPEN_LICENSE',
  'LICENSED',
  'PRIVATE',
  'RESTRICTED'
);

CREATE TABLE "DataCenterSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "organization" TEXT,
  "url" TEXT,
  "sourceDate" TIMESTAMP(3),
  "license" TEXT,
  "ownership" "DataCenterOwnership",
  "notes" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataCenterSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterRecord" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "department" TEXT,
  "summary" TEXT,
  "body" TEXT,
  "content" JSONB,
  "metadata" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "scope" "DataCenterScope" NOT NULL DEFAULT 'PLATFORM',
  "organizationId" TEXT,
  "ownerId" TEXT,
  "sourceId" TEXT,
  "source" TEXT,
  "sourceOrganization" TEXT,
  "sourceUrl" TEXT,
  "sourceDate" TIMESTAMP(3),
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "geography" JSONB,
  "license" TEXT,
  "ownership" "DataCenterOwnership" NOT NULL DEFAULT 'JENAN_OWNED',
  "usagePolicy" TEXT,
  "verificationStatus" "DataCenterVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "confidence" INTEGER,
  "status" "DataCenterPublicationState" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "refreshPolicy" TEXT,
  "expiresAt" TIMESTAMP(3),
  "reviewAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "storageKey" TEXT,
  "mimeType" TEXT,
  "sizeBytes" BIGINT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DataCenterRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterRecordVersion" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeSummary" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterRecordVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterEvidence" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "sourceId" TEXT,
  "source" TEXT NOT NULL,
  "sourceOrganization" TEXT,
  "sourceUrl" TEXT,
  "sourceDate" TIMESTAMP(3),
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "geography" JSONB,
  "license" TEXT,
  "verificationStatus" "DataCenterVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "confidence" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "approvedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterChunk" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterConflict" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "currentValue" JSONB NOT NULL,
  "proposedValue" JSONB NOT NULL,
  "currentSourceId" TEXT,
  "proposedSourceId" TEXT,
  "currentSourceDate" TIMESTAMP(3),
  "proposedSourceDate" TIMESTAMP(3),
  "difference" TEXT NOT NULL,
  "confidence" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolution" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterConflict_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterImport" (
  "id" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "fileName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" BIGINT,
  "checksum" TEXT,
  "createdById" TEXT,
  "recordsFound" INTEGER NOT NULL DEFAULT 0,
  "recordsCreated" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DataCenterImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DataCenterUsage" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "consumer" TEXT NOT NULL,
  "department" TEXT,
  "service" TEXT,
  "missionId" TEXT,
  "projectId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataCenterUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DataCenterSource_name_idx" ON "DataCenterSource"("name");
CREATE INDEX "DataCenterSource_organization_idx" ON "DataCenterSource"("organization");
CREATE INDEX "DataCenterSource_createdAt_idx" ON "DataCenterSource"("createdAt");
CREATE INDEX "DataCenterRecord_kind_status_updatedAt_idx" ON "DataCenterRecord"("kind", "status", "updatedAt");
CREATE INDEX "DataCenterRecord_department_status_idx" ON "DataCenterRecord"("department", "status");
CREATE INDEX "DataCenterRecord_scope_organizationId_ownerId_status_idx" ON "DataCenterRecord"("scope", "organizationId", "ownerId", "status");
CREATE INDEX "DataCenterRecord_sourceId_idx" ON "DataCenterRecord"("sourceId");
CREATE INDEX "DataCenterRecord_verificationStatus_confidence_idx" ON "DataCenterRecord"("verificationStatus", "confidence");
CREATE INDEX "DataCenterRecord_expiresAt_reviewAt_idx" ON "DataCenterRecord"("expiresAt", "reviewAt");
CREATE INDEX "DataCenterRecord_createdById_createdAt_idx" ON "DataCenterRecord"("createdById", "createdAt");
CREATE UNIQUE INDEX "DataCenterRecordVersion_recordId_version_key" ON "DataCenterRecordVersion"("recordId", "version");
CREATE INDEX "DataCenterRecordVersion_recordId_createdAt_idx" ON "DataCenterRecordVersion"("recordId", "createdAt");
CREATE INDEX "DataCenterEvidence_recordId_version_idx" ON "DataCenterEvidence"("recordId", "version");
CREATE INDEX "DataCenterEvidence_sourceId_idx" ON "DataCenterEvidence"("sourceId");
CREATE INDEX "DataCenterEvidence_verificationStatus_sourceDate_idx" ON "DataCenterEvidence"("verificationStatus", "sourceDate");
CREATE UNIQUE INDEX "DataCenterChunk_recordId_version_ordinal_key" ON "DataCenterChunk"("recordId", "version", "ordinal");
CREATE INDEX "DataCenterChunk_recordId_version_idx" ON "DataCenterChunk"("recordId", "version");
CREATE INDEX "DataCenterConflict_status_createdAt_idx" ON "DataCenterConflict"("status", "createdAt");
CREATE INDEX "DataCenterConflict_recordId_createdAt_idx" ON "DataCenterConflict"("recordId", "createdAt");
CREATE INDEX "DataCenterImport_status_createdAt_idx" ON "DataCenterImport"("status", "createdAt");
CREATE INDEX "DataCenterImport_createdById_createdAt_idx" ON "DataCenterImport"("createdById", "createdAt");
CREATE INDEX "DataCenterUsage_recordId_createdAt_idx" ON "DataCenterUsage"("recordId", "createdAt");
CREATE INDEX "DataCenterUsage_consumer_createdAt_idx" ON "DataCenterUsage"("consumer", "createdAt");
CREATE INDEX "DataCenterUsage_department_service_createdAt_idx" ON "DataCenterUsage"("department", "service", "createdAt");

ALTER TABLE "DataCenterRecordVersion"
  ADD CONSTRAINT "DataCenterRecordVersion_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "DataCenterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataCenterEvidence"
  ADD CONSTRAINT "DataCenterEvidence_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "DataCenterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataCenterChunk"
  ADD CONSTRAINT "DataCenterChunk_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "DataCenterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataCenterConflict"
  ADD CONSTRAINT "DataCenterConflict_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "DataCenterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DataCenterUsage"
  ADD CONSTRAINT "DataCenterUsage_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "DataCenterRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
