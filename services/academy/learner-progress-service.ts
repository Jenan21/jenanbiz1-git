import { LearnerEnrollmentStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

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
    await transaction.auditLog.create({ data: { actorId: userId, action: "academy.learner.lesson.completed", entityType: "LearnerLessonCompletion", entityId: completion.id, metadata: { lessonId, courseId: lesson.courseId } as Prisma.InputJsonValue } });
    return { completion, totalLessons, completedLessons };
  });
}

export async function getLearnerCourseProgress(courseId: string, userId: string) {
  const [enrollment, completions] = await Promise.all([
    db.learnerEnrollment.findUnique({ where: { userId_courseId: { userId, courseId } } }),
    db.learnerLessonCompletion.findMany({ where: { userId, lesson: { courseId } }, select: { lessonId: true } }),
  ]);
  return { enrollment, completedLessonIds: completions.map((completion) => completion.lessonId) };
}