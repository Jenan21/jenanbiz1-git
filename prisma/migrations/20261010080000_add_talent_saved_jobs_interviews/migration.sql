CREATE TYPE "TalentInterviewMode" AS ENUM ('VIDEO', 'PHONE', 'ON_SITE');
CREATE TYPE "TalentInterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "TalentSavedJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TalentSavedJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "mode" "TalentInterviewMode" NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" "TalentInterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TalentInterview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TalentSavedJob_userId_jobPostingId_key" ON "TalentSavedJob"("userId", "jobPostingId");
CREATE INDEX "TalentSavedJob_userId_createdAt_idx" ON "TalentSavedJob"("userId", "createdAt");
CREATE INDEX "TalentSavedJob_jobPostingId_idx" ON "TalentSavedJob"("jobPostingId");
CREATE INDEX "TalentInterview_applicationId_scheduledAt_idx" ON "TalentInterview"("applicationId", "scheduledAt");
CREATE INDEX "TalentInterview_createdById_status_idx" ON "TalentInterview"("createdById", "status");
CREATE INDEX "TalentInterview_scheduledAt_status_idx" ON "TalentInterview"("scheduledAt", "status");

ALTER TABLE "TalentSavedJob" ADD CONSTRAINT "TalentSavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentSavedJob" ADD CONSTRAINT "TalentSavedJob_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentInterview" ADD CONSTRAINT "TalentInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentInterview" ADD CONSTRAINT "TalentInterview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
