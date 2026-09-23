import {
  AcademicAssessmentOutcome,
  CertificationRecordStatus,
  LearnerEnrollmentStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

async function maybeAwardLearnerCertificate(courseId: string, userId: string, transaction: Prisma.TransactionClient = db) {
  const [course, totalLessons, completedLessons, exams] = await Promise.all([
    transaction.academyCourse.findUnique({
      where: { id: courseId },
      select: { specializationId: true },
    }),
    transaction.academyLesson.count({ where: { courseId } }),
    transaction.learnerLessonCompletion.count({ where: { userId, lesson: { courseId } } }),
    transaction.academyExam.findMany({ where: { courseId }, select: { id: true } }),
  ]);
  if (!course || totalLessons === 0 || completedLessons < totalLessons) return null;

  for (const exam of exams) {
    const passed = await transaction.learnerExamAttempt.findFirst({
      where: { userId, examId: exam.id, outcome: AcademicAssessmentOutcome.PASSED },
      select: { id: true },
    });
    if (!passed) return null;
  }

  const certification = course.specializationId
    ? await transaction.academyCertification.findFirst({
        where: { specializationId: course.specializationId },
        orderBy: { createdAt: "asc" },
        select: { id: true, expiresAfterDays: true },
      })
    : null;
  const expiresAt = certification?.expiresAfterDays
    ? new Date(Date.now() + certification.expiresAfterDays * 24 * 60 * 60 * 1000)
    : null;

  return transaction.learnerCertificate.upsert({
    where: { userId_courseId: { userId, courseId } },
    create: {
      userId,
      courseId,
      certificationId: certification?.id ?? null,
      status: CertificationRecordStatus.CERTIFIED,
      expiresAt,
    },
    update: {
      certificationId: certification?.id ?? null,
      status: CertificationRecordStatus.CERTIFIED,
      awardedAt: new Date(),
      expiresAt,
    },
  });
}

export async function enrollLearner(courseId: string, userId: string) {
  const course = await db.academyCourse.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) throw new Error("Academy course not found");
  return db.$transaction(async (transaction) => {
    const enrollment = await transaction.learnerEnrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
    await transaction.auditLog.create({ data: { actorId: userId, action: "academy.learner.enrolled", entityType: "LearnerEnrollment", entityId: enrollment.id, metadata: { courseId } as Prisma.InputJsonValue } });
    return enrollment;
  });
}

export async function completeLearnerLesson(lessonId: string, userId: string) {
  const lesson = await db.academyLesson.findUnique({ where: { id: lessonId }, select: { id: true, courseId: true } });
  if (!lesson) throw new Error("Academy lesson not found");
  const enrollment = await db.learnerEnrollment.findUnique({ where: { userId_courseId: { userId, courseId: lesson.courseId } }, select: { id: true } });
  if (!enrollment) throw new Error("Course enrollment required");
  return db.$transaction(async (transaction) => {
    const completion = await transaction.learnerLessonCompletion.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId },
      update: {},
    });
    const [totalLessons, completedLessons] = await Promise.all([
      transaction.academyLesson.count({ where: { courseId: lesson.courseId } }),
      transaction.learnerLessonCompletion.count({ where: { userId, lesson: { courseId: lesson.courseId } } }),
    ]);
    if (totalLessons > 0 && totalLessons === completedLessons) {
      await transaction.learnerEnrollment.update({ where: { id: enrollment.id }, data: { status: LearnerEnrollmentStatus.COMPLETED, completedAt: new Date() } });
    }
    const certificate = await maybeAwardLearnerCertificate(lesson.courseId, userId, transaction);
    await transaction.auditLog.create({ data: { actorId: userId, action: "academy.learner.lesson.completed", entityType: "LearnerLessonCompletion", entityId: completion.id, metadata: { lessonId, courseId: lesson.courseId } as Prisma.InputJsonValue } });
    return { completion, totalLessons, completedLessons, certificate };
  });
}

export async function submitLearnerExamAttempt(input: { examId: string; userId: string; score: number; evidence?: Prisma.InputJsonValue }) {
  const exam = await db.academyExam.findUnique({ where: { id: input.examId }, select: { id: true, courseId: true, passingScore: true, maxAttempts: true } });
  if (!exam?.courseId) throw new Error("Academy exam not found");
  const enrollment = await db.learnerEnrollment.findUnique({ where: { userId_courseId: { userId: input.userId, courseId: exam.courseId } }, select: { id: true } });
  if (!enrollment) throw new Error("Course enrollment required");
  const attempts = await db.learnerExamAttempt.count({ where: { userId: input.userId, examId: input.examId } });
  if (exam.maxAttempts && attempts >= exam.maxAttempts) throw new Error("Maximum exam attempts reached");
  const outcome = input.score >= exam.passingScore ? AcademicAssessmentOutcome.PASSED : AcademicAssessmentOutcome.FAILED;

  return db.$transaction(async (transaction) => {
    const attempt = await transaction.learnerExamAttempt.create({
      data: { userId: input.userId, examId: input.examId, score: input.score, outcome, evidence: input.evidence ?? Prisma.JsonNull },
    });
    const certificate = outcome === AcademicAssessmentOutcome.PASSED
      ? await maybeAwardLearnerCertificate(exam.courseId!, input.userId, transaction)
      : null;
    await transaction.auditLog.create({
      data: {
        actorId: input.userId,
        action: "academy.learner.exam.submitted",
        entityType: "LearnerExamAttempt",
        entityId: attempt.id,
        metadata: { examId: input.examId, courseId: exam.courseId, score: input.score, outcome } as Prisma.InputJsonValue,
      },
    });
    return { attempt, certificate };
  });
}

export async function getLearnerCourseProgress(courseId: string, userId: string) {
  const [enrollment, completions, examAttempts, certificate] = await Promise.all([
    db.learnerEnrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
    db.learnerLessonCompletion.findMany({ where: { userId, lesson: { courseId } }, select: { lessonId: true } }),
    db.learnerExamAttempt.findMany({
      where: { userId, exam: { courseId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, examId: true, score: true, outcome: true, createdAt: true },
    }),
    db.learnerCertificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true, status: true, awardedAt: true, expiresAt: true, certification: { select: { name: true } } },
    }),
  ]);
  return { enrollment, completedLessonIds: completions.map((completion) => completion.lessonId), examAttempts, certificate };
}