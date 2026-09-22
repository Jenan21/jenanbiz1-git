ALTER TABLE "CommitteeReview" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CommitteeReview_projectId_key" ON "CommitteeReview"("projectId");