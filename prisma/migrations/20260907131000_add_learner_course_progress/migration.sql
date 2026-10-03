CREATE TYPE "LearnerEnrollmentStatus" AS ENUM ('ENROLLED', 'COMPLETED');

CREATE TABLE "LearnerEnrollment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "status" "LearnerEnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearnerEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearnerLessonCompletion" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerLessonCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerEnrollment_userId_courseId_key" ON "LearnerEnrollment"("userId", "courseId");
CREATE INDEX "LearnerEnrollment_userId_status_idx" ON "LearnerEnrollment"("userId", "status");
CREATE UNIQUE INDEX "LearnerLessonCompletion_userId_lessonId_key" ON "LearnerLessonCompletion"("userId", "lessonId");
CREATE INDEX "LearnerLessonCompletion_userId_idx" ON "LearnerLessonCompletion"("userId");
ALTER TABLE "LearnerEnrollment" ADD CONSTRAINT "LearnerEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerEnrollment" ADD CONSTRAINT "LearnerEnrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerLessonCompletion" ADD CONSTRAINT "LearnerLessonCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerLessonCompletion" ADD CONSTRAINT "LearnerLessonCompletion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "AcademyLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;