DO $$
BEGIN
  CREATE TYPE "MapProviderReviewStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MapProviderReview" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "providerLabel" TEXT NOT NULL,
  "status" "MapProviderReviewStatus" NOT NULL DEFAULT 'DRAFT',
  "contractReference" TEXT,
  "operationalOwner" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MapProviderReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MapProviderReview_key_key" ON "MapProviderReview"("key");
CREATE INDEX IF NOT EXISTS "MapProviderReview_status_updatedAt_idx" ON "MapProviderReview"("status", "updatedAt");

DO $$
BEGIN
  ALTER TABLE "MapProviderReview" ADD CONSTRAINT "MapProviderReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;