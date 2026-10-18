-- CreateEnum
CREATE TYPE "DataCenterOwnership" AS ENUM ('PLATFORM_OWNED', 'USER_OWNED', 'THIRD_PARTY', 'AI_GENERATED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DataCenterLayer" ADD VALUE 'ASSET';
ALTER TYPE "DataCenterLayer" ADD VALUE 'EVIDENCE';

-- AlterEnum
ALTER TYPE "DataCenterLifecycle" ADD VALUE 'DEPRECATED';

-- AlterTable
ALTER TABLE "DataCenterSource" ADD COLUMN     "ownership" "DataCenterOwnership" NOT NULL DEFAULT 'THIRD_PARTY',
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "usagePolicy" TEXT NOT NULL DEFAULT 'Internal use; redistribution requires explicit permission';

-- AlterTable
ALTER TABLE "DataCenterVersion" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "committeeRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "geography" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "license" TEXT NOT NULL DEFAULT 'Unspecified; export prohibited',
ADD COLUMN     "ownership" "DataCenterOwnership" NOT NULL DEFAULT 'THIRD_PARTY',
ADD COLUMN     "preview" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "robotId" TEXT,
ADD COLUMN     "sourceDate" TIMESTAMP(3),
ADD COLUMN     "sourceOrganization" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "upstreamVersionIds" TEXT[],
ADD COLUMN     "usagePolicy" TEXT NOT NULL DEFAULT 'Internal use; redistribution requires explicit permission';

-- AlterTable
ALTER TABLE "DataCenterAcademyRelease" ADD COLUMN     "classification" TEXT NOT NULL DEFAULT 'SOURCE_KNOWLEDGE',
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'REFERENCE',
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validTo" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataCenterRobotGrant" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataCenterRobotGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataCenterProposalReview" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataCenterProposalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataCenterRobotGrant_principalId_robotId_missionId_revokedA_idx" ON "DataCenterRobotGrant"("principalId", "robotId", "missionId", "revokedAt");

-- CreateIndex
CREATE INDEX "DataCenterRobotGrant_sourceId_idx" ON "DataCenterRobotGrant"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "DataCenterProposalReview_versionId_stage_key" ON "DataCenterProposalReview"("versionId", "stage");

-- CreateIndex
CREATE INDEX "DataCenterVersion_isPublished_sourceDate_idx" ON "DataCenterVersion"("isPublished", "sourceDate");

-- AddForeignKey
ALTER TABLE "DataCenterRobotGrant" ADD CONSTRAINT "DataCenterRobotGrant_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataCenterSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataCenterProposalReview" ADD CONSTRAINT "DataCenterProposalReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DataCenterVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

