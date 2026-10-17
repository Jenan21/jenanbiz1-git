CREATE TYPE "MapAvailabilityStatus" AS ENUM ('ONLINE', 'MAINTENANCE', 'DISABLED');
CREATE TYPE "MapReleaseStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'FAILED');
CREATE TYPE "MapLayerVisibility" AS ENUM ('PUBLIC', 'INTERNAL');
CREATE TYPE "MapDatasetOwnership" AS ENUM ('JENAN_OWNED', 'LICENSED', 'OPEN_SOURCE_DERIVED', 'THIRD_PARTY_RESTRICTED');
CREATE TYPE "MapUpdateStatus" AS ENUM ('PROCESSING', 'READY_FOR_REVIEW', 'FAILED');
CREATE TYPE "MapBackupStatus" AS ENUM ('PROCESSING', 'READY', 'INCOMPLETE', 'FAILED');

CREATE TABLE "MapControlSettings" (
  "id" TEXT NOT NULL DEFAULT 'primary',
  "status" "MapAvailabilityStatus" NOT NULL DEFAULT 'DISABLED',
  "currentReleaseId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MapControlSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MapRelease" (
  "id" TEXT NOT NULL,
  "regionCode" TEXT NOT NULL DEFAULT 'SA',
  "version" TEXT NOT NULL,
  "status" "MapReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "source" TEXT NOT NULL,
  "dataDate" TIMESTAMP(3),
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "artifactKey" TEXT,
  "artifactFormat" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MapRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MapDataset" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "dataDate" TIMESTAMP(3),
  "ownership" "MapDatasetOwnership" NOT NULL,
  "licenseName" TEXT NOT NULL,
  "licenseUrl" TEXT,
  "internalUseAllowed" BOOLEAN,
  "internalBackupAllowed" BOOLEAN,
  "redistributionAllowed" BOOLEAN,
  "licenseReviewedById" TEXT,
  "licenseReviewedAt" TIMESTAMP(3),
  "originalFilename" TEXT NOT NULL,
  "rawArtifactKey" TEXT NOT NULL,
  "processedArtifactKey" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "comparisonStatus" TEXT NOT NULL,
  "comparison" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MapDataset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MapLayer" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "visibility" "MapLayerVisibility" NOT NULL DEFAULT 'INTERNAL',
  "datasetKey" TEXT,
  "dataSource" TEXT,
  "version" TEXT,
  "confidence" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,
  CONSTRAINT "MapLayer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MapUpdate" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "datasetKey" TEXT NOT NULL,
  "status" "MapUpdateStatus" NOT NULL DEFAULT 'PROCESSING',
  "stage" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB,
  "logs" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MapUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MapBackup" (
  "id" TEXT NOT NULL,
  "backupId" TEXT NOT NULL,
  "mapVersion" TEXT,
  "dataVersion" TEXT,
  "size" INTEGER NOT NULL DEFAULT 0,
  "checksum" TEXT,
  "status" "MapBackupStatus" NOT NULL DEFAULT 'PROCESSING',
  "artifactKey" TEXT,
  "manifest" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "MapBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MapRelease_regionCode_version_key" ON "MapRelease"("regionCode", "version");
CREATE INDEX "MapRelease_status_createdAt_idx" ON "MapRelease"("status", "createdAt");
CREATE INDEX "MapRelease_regionCode_publishedAt_idx" ON "MapRelease"("regionCode", "publishedAt");
CREATE UNIQUE INDEX "MapDataset_releaseId_key_key" ON "MapDataset"("releaseId", "key");
CREATE INDEX "MapDataset_key_createdAt_idx" ON "MapDataset"("key", "createdAt");
CREATE INDEX "MapDataset_releaseId_createdAt_idx" ON "MapDataset"("releaseId", "createdAt");
CREATE UNIQUE INDEX "MapLayer_key_key" ON "MapLayer"("key");
CREATE INDEX "MapLayer_enabled_visibility_idx" ON "MapLayer"("enabled", "visibility");
CREATE INDEX "MapUpdate_releaseId_createdAt_idx" ON "MapUpdate"("releaseId", "createdAt");
CREATE INDEX "MapUpdate_status_createdAt_idx" ON "MapUpdate"("status", "createdAt");
CREATE UNIQUE INDEX "MapBackup_backupId_key" ON "MapBackup"("backupId");
CREATE INDEX "MapBackup_status_createdAt_idx" ON "MapBackup"("status", "createdAt");

ALTER TABLE "MapDataset" ADD CONSTRAINT "MapDataset_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "MapRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MapUpdate" ADD CONSTRAINT "MapUpdate_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "MapRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
