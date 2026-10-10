-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "analysisStudy" JSONB,
ADD COLUMN "analysisStudyUpdatedAt" TIMESTAMP(3);
