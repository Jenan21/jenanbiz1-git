-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "HubLayer" AS ENUM ('DATA', 'KNOWLEDGE', 'ASSET', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "HubScope" AS ENUM ('PLATFORM', 'ORGANIZATION', 'PRIVATE');

-- CreateEnum
CREATE TYPE "HubState" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED', 'REJECTED');

-- CreateTable
CREATE TABLE "HubSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "quality" DOUBLE PRECISION NOT NULL,
    "license" TEXT NOT NULL,
    "allowRedistribution" BOOLEAN NOT NULL DEFAULT false,
    "scope" "HubScope" NOT NULL,
    "organizationId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubItem" (
    "id" TEXT NOT NULL,
    "layer" "HubLayer" NOT NULL,
    "scope" "HubScope" NOT NULL,
    "organizationId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tags" TEXT[],
    "state" "HubState" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "sourceId" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verification" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "originalStorageKey" TEXT,
    "originalMimeType" TEXT,
    "originalBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubChunk" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,

    CONSTRAINT "HubChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubReview" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromState" "HubState" NOT NULL,
    "toState" "HubState" NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubConflict" (
    "id" TEXT NOT NULL,
    "leftVersionId" TEXT NOT NULL,
    "rightVersionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "leftValue" TEXT NOT NULL,
    "rightValue" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAccessGrant" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "missionId" TEXT,
    "grantedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAcademyRelease" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "state" "HubState" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "lastReviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAcademyRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubUsage" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "robotId" TEXT,
    "missionId" TEXT,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubSource_scope_organizationId_ownerId_idx" ON "HubSource"("scope", "organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "HubItem_scope_organizationId_ownerId_state_idx" ON "HubItem"("scope", "organizationId", "ownerId", "state");

-- CreateIndex
CREATE INDEX "HubItem_layer_state_idx" ON "HubItem"("layer", "state");

-- CreateIndex
CREATE INDEX "HubVersion_sourceId_idx" ON "HubVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "HubVersion_itemId_version_key" ON "HubVersion"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "HubChunk_versionId_ordinal_key" ON "HubChunk"("versionId", "ordinal");

-- CreateIndex
CREATE INDEX "HubReview_itemId_createdAt_idx" ON "HubReview"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "HubConflict_leftVersionId_rightVersionId_idx" ON "HubConflict"("leftVersionId", "rightVersionId");

-- CreateIndex
CREATE INDEX "HubAccessGrant_robotId_missionId_expiresAt_idx" ON "HubAccessGrant"("robotId", "missionId", "expiresAt");

-- CreateIndex
CREATE INDEX "HubAcademyRelease_state_specialty_level_idx" ON "HubAcademyRelease"("state", "specialty", "level");

-- CreateIndex
CREATE INDEX "HubUsage_actorId_createdAt_idx" ON "HubUsage"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "HubUsage_versionId_createdAt_idx" ON "HubUsage"("versionId", "createdAt");

-- AddForeignKey
ALTER TABLE "HubVersion" ADD CONSTRAINT "HubVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubVersion" ADD CONSTRAINT "HubVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "HubSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubChunk" ADD CONSTRAINT "HubChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubReview" ADD CONSTRAINT "HubReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubReview" ADD CONSTRAINT "HubReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubConflict" ADD CONSTRAINT "HubConflict_leftVersionId_fkey" FOREIGN KEY ("leftVersionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubConflict" ADD CONSTRAINT "HubConflict_rightVersionId_fkey" FOREIGN KEY ("rightVersionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAccessGrant" ADD CONSTRAINT "HubAccessGrant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAcademyRelease" ADD CONSTRAINT "HubAcademyRelease_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAcademyRelease" ADD CONSTRAINT "HubAcademyRelease_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubUsage" ADD CONSTRAINT "HubUsage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HubVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

