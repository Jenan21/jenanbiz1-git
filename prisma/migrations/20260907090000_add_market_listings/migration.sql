CREATE TYPE "MarketListingKind" AS ENUM ('PROJECT', 'BUSINESS');
CREATE TYPE "MarketListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

CREATE TABLE "MarketListing" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "projectId" TEXT,
    "organizationId" TEXT,
    "kind" "MarketListingKind" NOT NULL,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sector" TEXT,
    "countryCode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketListing_slug_key" ON "MarketListing"("slug");
CREATE INDEX "MarketListing_status_kind_createdAt_idx" ON "MarketListing"("status", "kind", "createdAt");
CREATE INDEX "MarketListing_createdById_status_idx" ON "MarketListing"("createdById", "status");
CREATE INDEX "MarketListing_countryCode_sector_idx" ON "MarketListing"("countryCode", "sector");

ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;