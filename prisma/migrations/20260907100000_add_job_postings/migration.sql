CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');
CREATE TYPE "JobWorkMode" AS ENUM ('ON_SITE', 'HYBRID', 'REMOTE');
CREATE TYPE "JobApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'WITHDRAWN', 'REJECTED', 'ACCEPTED');

CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "department" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "workMode" "JobWorkMode" NOT NULL DEFAULT 'ON_SITE',
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "message" TEXT,
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobPosting_slug_key" ON "JobPosting"("slug");
CREATE INDEX "JobPosting_status_workMode_createdAt_idx" ON "JobPosting"("status", "workMode", "createdAt");
CREATE INDEX "JobPosting_createdById_status_idx" ON "JobPosting"("createdById", "status");
CREATE INDEX "JobPosting_countryCode_city_idx" ON "JobPosting"("countryCode", "city");
CREATE UNIQUE INDEX "JobApplication_jobPostingId_applicantId_key" ON "JobApplication"("jobPostingId", "applicantId");
CREATE INDEX "JobApplication_applicantId_status_idx" ON "JobApplication"("applicantId", "status");
CREATE INDEX "JobApplication_jobPostingId_status_idx" ON "JobApplication"("jobPostingId", "status");

ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;