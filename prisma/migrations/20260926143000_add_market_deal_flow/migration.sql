CREATE TYPE "MarketViewingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MarketOfferStatus" AS ENUM ('SUBMITTED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CLOSED');
CREATE TYPE "MarketFileVisibility" AS ENUM ('PUBLIC', 'NDA_REQUIRED');

ALTER TABLE "MarketListing"
ADD COLUMN "confidentialDetails" TEXT,
ADD COLUMN "requiresNda" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FileAsset"
ADD COLUMN "marketListingId" TEXT,
ADD COLUMN "marketVisibility" "MarketFileVisibility";

CREATE TABLE "MarketNdaAcceptance" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL DEFAULT 'v1',
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketNdaAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketViewingRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "preferredAt" TIMESTAMP(3) NOT NULL,
    "attendees" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "status" "MarketViewingStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketViewingRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "terms" TEXT NOT NULL,
    "message" TEXT,
    "validUntil" TIMESTAMP(3),
    "status" "MarketOfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketNdaAcceptance_listingId_userId_key" ON "MarketNdaAcceptance"("listingId", "userId");
CREATE INDEX "MarketNdaAcceptance_userId_acceptedAt_idx" ON "MarketNdaAcceptance"("userId", "acceptedAt");
CREATE INDEX "MarketViewingRequest_listingId_status_idx" ON "MarketViewingRequest"("listingId", "status");
CREATE INDEX "MarketViewingRequest_requesterId_status_idx" ON "MarketViewingRequest"("requesterId", "status");
CREATE INDEX "MarketOffer_listingId_status_idx" ON "MarketOffer"("listingId", "status");
CREATE INDEX "MarketOffer_buyerId_status_idx" ON "MarketOffer"("buyerId", "status");
CREATE INDEX "FileAsset_marketListingId_idx" ON "FileAsset"("marketListingId");

ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_marketListingId_fkey" FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketNdaAcceptance" ADD CONSTRAINT "MarketNdaAcceptance_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketNdaAcceptance" ADD CONSTRAINT "MarketNdaAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketViewingRequest" ADD CONSTRAINT "MarketViewingRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketViewingRequest" ADD CONSTRAINT "MarketViewingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;