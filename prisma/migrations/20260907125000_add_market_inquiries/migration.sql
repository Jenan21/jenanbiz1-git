CREATE TYPE "MarketInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

CREATE TABLE "MarketInquiry" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "MarketInquiryStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketInquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketInquiry_listingId_requesterId_key" ON "MarketInquiry"("listingId", "requesterId");
CREATE INDEX "MarketInquiry_requesterId_status_idx" ON "MarketInquiry"("requesterId", "status");
CREATE INDEX "MarketInquiry_listingId_status_idx" ON "MarketInquiry"("listingId", "status");
ALTER TABLE "MarketInquiry" ADD CONSTRAINT "MarketInquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketInquiry" ADD CONSTRAINT "MarketInquiry_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;