ALTER TABLE "MarketListing" ADD COLUMN "askingPriceMinor" INTEGER;
ALTER TABLE "MarketListing" ADD COLUMN "valuationNote" TEXT;
ALTER TABLE "MarketListing" ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketListing" ADD COLUMN "qualitySignals" JSONB;
ALTER TABLE "MarketListing" ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "MarketListing_qualityScore_status_idx" ON "MarketListing"("qualityScore", "status");