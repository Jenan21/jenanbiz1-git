CREATE TABLE "LearnerExamAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "outcome" "AcademicAssessmentOutcome" NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerExamAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearnerCertificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "certificationId" TEXT,
    "status" "CertificationRecordStatus" NOT NULL DEFAULT 'CERTIFIED',
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerCertificate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearnerExamAttempt_userId_examId_createdAt_idx" ON "LearnerExamAttempt"("userId", "examId", "createdAt");
CREATE UNIQUE INDEX "LearnerCertificate_userId_courseId_key" ON "LearnerCertificate"("userId", "courseId");
CREATE INDEX "LearnerCertificate_status_expiresAt_idx" ON "LearnerCertificate"("status", "expiresAt");

ALTER TABLE "LearnerExamAttempt" ADD CONSTRAINT "LearnerExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerExamAttempt" ADD CONSTRAINT "LearnerExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "AcademyExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerCertificate" ADD CONSTRAINT "LearnerCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerCertificate" ADD CONSTRAINT "LearnerCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerCertificate" ADD CONSTRAINT "LearnerCertificate_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "AcademyCertification"("id") ON DELETE SET NULL ON UPDATE CASCADE;