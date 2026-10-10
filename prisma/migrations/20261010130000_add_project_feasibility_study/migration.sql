-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "feasibilityStudy" JSONB,
ADD COLUMN "feasibilityStudyUpdatedAt" TIMESTAMP(3);
