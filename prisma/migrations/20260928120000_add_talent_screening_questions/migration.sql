ALTER TABLE "JobPosting" ADD COLUMN "benefits" TEXT,
ADD COLUMN "conditions" TEXT;

CREATE TABLE "JobPostingQuestion" (
    "id" TEXT NOT NULL,
    "jobPostingId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobPostingQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "promptSnapshot" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobApplicationAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobPostingQuestion_jobPostingId_sequence_key" ON "JobPostingQuestion"("jobPostingId", "sequence");
CREATE INDEX "JobPostingQuestion_jobPostingId_idx" ON "JobPostingQuestion"("jobPostingId");
CREATE UNIQUE INDEX "JobApplicationAnswer_applicationId_questionId_key" ON "JobApplicationAnswer"("applicationId", "questionId");
CREATE INDEX "JobApplicationAnswer_questionId_idx" ON "JobApplicationAnswer"("questionId");

ALTER TABLE "JobPostingQuestion" ADD CONSTRAINT "JobPostingQuestion_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplicationAnswer" ADD CONSTRAINT "JobApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobApplicationAnswer" ADD CONSTRAINT "JobApplicationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "JobPostingQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;