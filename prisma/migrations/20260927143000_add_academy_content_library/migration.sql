CREATE TYPE "AcademyResourceKind" AS ENUM ('COURSE', 'WEBINAR', 'STUDY', 'RESEARCH', 'LEARNING_PATH', 'CERTIFICATE');
CREATE TYPE "AcademyResourceApprovalState" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

CREATE TABLE "AcademyResource" (
    "id" TEXT NOT NULL,
    "academyId" TEXT,
    "courseId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "kind" "AcademyResourceKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "approvalState" "AcademyResourceApprovalState" NOT NULL DEFAULT 'DRAFT',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourcePublishedAt" TIMESTAMP(3),
    "authorName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AcademyResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyResourceVersion" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdById" TEXT,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" JSONB NOT NULL,
    "references" JSONB,
    "changeSummary" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "sourcePublishedAt" TIMESTAMP(3),
    "authorName" TEXT,
    "approvalState" "AcademyResourceApprovalState" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyResourceVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademyResourceAttachment" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "versionId" TEXT,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "storageKey" TEXT,
    "externalUrl" TEXT,
    "checksum" TEXT,
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademyResourceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademyResource_slug_key" ON "AcademyResource"("slug");
CREATE INDEX "AcademyResource_kind_approvalState_category_idx" ON "AcademyResource"("kind", "approvalState", "category");
CREATE INDEX "AcademyResource_academyId_kind_idx" ON "AcademyResource"("academyId", "kind");
CREATE INDEX "AcademyResource_courseId_idx" ON "AcademyResource"("courseId");
CREATE UNIQUE INDEX "AcademyResourceVersion_resourceId_version_key" ON "AcademyResourceVersion"("resourceId", "version");
CREATE INDEX "AcademyResourceVersion_resourceId_createdAt_idx" ON "AcademyResourceVersion"("resourceId", "createdAt");
CREATE INDEX "AcademyResourceVersion_approvalState_idx" ON "AcademyResourceVersion"("approvalState");
CREATE INDEX "AcademyResourceAttachment_resourceId_createdAt_idx" ON "AcademyResourceAttachment"("resourceId", "createdAt");
CREATE INDEX "AcademyResourceAttachment_versionId_idx" ON "AcademyResourceAttachment"("versionId");

ALTER TABLE "AcademyResource" ADD CONSTRAINT "AcademyResource_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademyResource" ADD CONSTRAINT "AcademyResource_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademyResource" ADD CONSTRAINT "AcademyResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademyResource" ADD CONSTRAINT "AcademyResource_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademyResourceVersion" ADD CONSTRAINT "AcademyResourceVersion_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "AcademyResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyResourceVersion" ADD CONSTRAINT "AcademyResourceVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AcademyResourceAttachment" ADD CONSTRAINT "AcademyResourceAttachment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "AcademyResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademyResourceAttachment" ADD CONSTRAINT "AcademyResourceAttachment_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AcademyResourceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;