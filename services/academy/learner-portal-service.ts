import { AcademyResourceApprovalState } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function getLearnerAcademySnapshot(userId: string) {
  const [enrollments, certificates, attempts, engagements, completedLessons] = await Promise.all([
    db.learnerEnrollment.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        completedAt: true,
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            description: true,
            field: { select: { key: true, name: true } },
            lessons: {
              orderBy: { sequence: "asc" },
              select: {
                id: true,
                title: true,
                sequence: true,
                learnerCompletions: {
                  where: { userId },
                  select: { id: true },
                },
              },
            },
            exams: {
              select: { id: true, title: true, passingScore: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    db.learnerCertificate.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        awardedAt: true,
        expiresAt: true,
        course: { select: { id: true, code: true, title: true } },
        certification: { select: { name: true } },
      },
      orderBy: { awardedAt: "desc" },
      take: 50,
    }),
    db.learnerExamAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        score: true,
        outcome: true,
        createdAt: true,
        exam: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            course: { select: { id: true, code: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.academyResourceEngagement.findMany({
      where: {
        userId,
        resource: { approvalState: AcademyResourceApprovalState.APPROVED },
      },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        updatedAt: true,
        resource: {
          select: {
            id: true,
            kind: true,
            slug: true,
            title: true,
            summary: true,
            category: true,
            attachments: {
              select: {
                id: true,
                title: true,
                fileName: true,
                mimeType: true,
                externalUrl: true,
                storageKey: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.learnerLessonCompletion.count({ where: { userId } }),
  ]);

  return {
    attempts,
    certificates,
    completedLessons,
    engagements,
    enrollments: enrollments.map((enrollment) => {
      const completed = enrollment.course.lessons.filter(
        (lesson) => lesson.learnerCompletions.length > 0,
      ).length;
      const total = enrollment.course.lessons.length;
      return {
        ...enrollment,
        completedLessonCount: completed,
        progressPercent: total ? Math.round((completed / total) * 100) : 0,
      };
    }),
  };
}
