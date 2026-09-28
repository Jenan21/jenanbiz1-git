-- CreateTable
CREATE TABLE "LearnerLessonNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerLessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyExamQuestion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "explanation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyExamOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyExamOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnerLessonNote_userId_lessonId_key" ON "LearnerLessonNote"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "LearnerLessonNote_lessonId_updatedAt_idx" ON "LearnerLessonNote"("lessonId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyExamQuestion_examId_sequence_key" ON "AcademyExamQuestion"("examId", "sequence");

-- CreateIndex
CREATE INDEX "AcademyExamQuestion_examId_isActive_idx" ON "AcademyExamQuestion"("examId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyExamOption_questionId_sequence_key" ON "AcademyExamOption"("questionId", "sequence");

-- CreateIndex
CREATE INDEX "AcademyExamOption_questionId_isCorrect_idx" ON "AcademyExamOption"("questionId", "isCorrect");

-- AddForeignKey
ALTER TABLE "LearnerLessonNote" ADD CONSTRAINT "LearnerLessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerLessonNote" ADD CONSTRAINT "LearnerLessonNote_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "AcademyLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExamQuestion" ADD CONSTRAINT "AcademyExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "AcademyExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExamOption" ADD CONSTRAINT "AcademyExamOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "AcademyExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;