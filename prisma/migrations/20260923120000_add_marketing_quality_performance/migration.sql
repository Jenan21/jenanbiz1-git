ALTER TABLE "MarketingCampaign" ADD COLUMN "targetAudience" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "callToAction" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "kpiTarget" INTEGER;
ALTER TABLE "MarketingCampaign" ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingCampaign" ADD COLUMN "qualitySignals" JSONB;
ALTER TABLE "MarketingCampaign" ADD COLUMN "performanceSnapshot" JSONB;

CREATE INDEX "MarketingCampaign_qualityScore_status_idx" ON "MarketingCampaign"("qualityScore", "status");