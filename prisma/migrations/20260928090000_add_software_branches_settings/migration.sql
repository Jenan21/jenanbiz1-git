CREATE TYPE "SoftwareBranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "SoftwareBranch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT,
    "city" TEXT,
    "address" TEXT,
    "status" "SoftwareBranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SoftwareSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "defaultBranchId" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'SAR',
    "taxRateBps" INTEGER NOT NULL DEFAULT 1500,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "allowNegativeInventory" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PosShift" ADD COLUMN "branchId" TEXT;

CREATE UNIQUE INDEX "SoftwareBranch_organizationId_code_key" ON "SoftwareBranch"("organizationId", "code");
CREATE INDEX "SoftwareBranch_organizationId_status_idx" ON "SoftwareBranch"("organizationId", "status");
CREATE UNIQUE INDEX "SoftwareSettings_organizationId_key" ON "SoftwareSettings"("organizationId");
CREATE INDEX "SoftwareSettings_defaultBranchId_idx" ON "SoftwareSettings"("defaultBranchId");
CREATE INDEX "PosShift_branchId_status_idx" ON "PosShift"("branchId", "status");

ALTER TABLE "SoftwareBranch" ADD CONSTRAINT "SoftwareBranch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareSettings" ADD CONSTRAINT "SoftwareSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareSettings" ADD CONSTRAINT "SoftwareSettings_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "SoftwareBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "SoftwareBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;