CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "MarketingChannel" AS ENUM ('CONTENT', 'EMAIL', 'SOCIAL', 'PAID_SEARCH', 'DIRECT');
CREATE TYPE "MarketingLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'CONVERTED', 'LOST');

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "channel" "MarketingChannel" NOT NULL,
    "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budgetMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketingLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT,
    "status" "MarketingLeadStatus" NOT NULL DEFAULT 'NEW',
    "valueMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingCampaign_slug_key" ON "MarketingCampaign"("slug");
CREATE INDEX "MarketingCampaign_createdById_status_idx" ON "MarketingCampaign"("createdById", "status");
CREATE INDEX "MarketingCampaign_status_channel_createdAt_idx" ON "MarketingCampaign"("status", "channel", "createdAt");
CREATE INDEX "MarketingLead_campaignId_status_idx" ON "MarketingLead"("campaignId", "status");
CREATE INDEX "MarketingLead_status_createdAt_idx" ON "MarketingLead"("status", "createdAt");

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingLead" ADD CONSTRAINT "MarketingLead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;