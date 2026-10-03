-- CreateEnum
CREATE TYPE "ProjectComplianceKind" AS ENUM ('LICENSE', 'PROCEDURE');

-- CreateEnum
CREATE TYPE "ProjectComplianceStatus" AS ENUM ('REQUIRED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ProjectVendorKind" AS ENUM ('VENDOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "ProjectVendorStatus" AS ENUM ('PROSPECT', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ProjectComplianceItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectComplianceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "authority" TEXT,
    "status" "ProjectComplianceStatus" NOT NULL DEFAULT 'REQUIRED',
    "reference" TEXT,
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVendor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ProjectVendorKind" NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "contactEmail" TEXT,
    "status" "ProjectVendorStatus" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectVendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectComplianceItem_projectId_kind_status_idx" ON "ProjectComplianceItem"("projectId", "kind", "status");

-- CreateIndex
CREATE INDEX "ProjectComplianceItem_projectId_dueAt_idx" ON "ProjectComplianceItem"("projectId", "dueAt");

-- CreateIndex
CREATE INDEX "ProjectVendor_projectId_kind_status_idx" ON "ProjectVendor"("projectId", "kind", "status");

-- CreateIndex
CREATE INDEX "ProjectVendor_projectId_name_idx" ON "ProjectVendor"("projectId", "name");

-- AddForeignKey
ALTER TABLE "ProjectComplianceItem" ADD CONSTRAINT "ProjectComplianceItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVendor" ADD CONSTRAINT "ProjectVendor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;