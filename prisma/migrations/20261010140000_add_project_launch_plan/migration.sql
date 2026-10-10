-- AlterTable
ALTER TABLE "Project"
ADD COLUMN "launchPlan" JSONB,
ADD COLUMN "launchPlanUpdatedAt" TIMESTAMP(3);
