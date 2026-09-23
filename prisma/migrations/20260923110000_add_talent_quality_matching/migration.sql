ALTER TABLE "JobPosting" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'SAR';
ALTER TABLE "JobPosting" ADD COLUMN "salaryMinMinor" INTEGER;
ALTER TABLE "JobPosting" ADD COLUMN "salaryMaxMinor" INTEGER;
ALTER TABLE "JobPosting" ADD COLUMN "requiredSkills" JSONB;
ALTER TABLE "JobPosting" ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobPosting" ADD COLUMN "qualitySignals" JSONB;

ALTER TABLE "JobApplication" ADD COLUMN "matchScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobApplication" ADD COLUMN "matchSignals" JSONB;

CREATE INDEX "JobPosting_qualityScore_status_idx" ON "JobPosting"("qualityScore", "status");
CREATE INDEX "JobApplication_matchScore_status_idx" ON "JobApplication"("matchScore", "status");