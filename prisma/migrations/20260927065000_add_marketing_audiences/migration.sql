ALTER TABLE "MarketingCampaign" ADD COLUMN "contentBrief" TEXT;
ALTER TABLE "MarketingLead" ADD COLUMN "notes" TEXT;

CREATE TABLE "MarketingAudienceSegment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "interests" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingAudienceSegment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingAudienceSegment_campaignId_createdAt_idx" ON "MarketingAudienceSegment"("campaignId", "createdAt");
ALTER TABLE "MarketingAudienceSegment" ADD CONSTRAINT "MarketingAudienceSegment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;