import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  completeLearnerLesson,
  enrollLearner,
  getLearnerCourseProgress,
  submitLearnerExamAttempt,
} from "@/services/academy/learner-progress-service";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
let userId: string | undefined;

afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("academy learner certification", () => {
  it("awards a learner certificate only after lessons and assessments are complete", async () => {
    const academy = await db.academy.create({ data: { name: `Learner academy ${suffix}`, slug: `learner-academy-${suffix}` } });
    academyId = academy.id;
    const user = await db.user.create({ data: { email: `learner-${suffix}@example.test`, status: "ACTIVE" } });
    userId = user.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Business", key: `business-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Operations", key: `operations-${suffix}` } });
    const certification = await db.academyCertification.create({ data: { specializationId: specialization.id, name: "Operations ready", key: `operations-ready-${suffix}`, expiresAfterDays: 365 } });
    const course = await db.academyCourse.create({ data: { academyId: academy.id, fieldId: field.id, specializationId: specialization.id, title: "Operational foundations", code: `OPS-${suffix}` } });
    const lesson = await db.academyLesson.create({ data: { courseId: course.id, title: "Operating model", sequence: 1 } });
    const exam = await db.academyExam.create({ data: { courseId: course.id, specializationId: specialization.id, title: "Readiness assessment", assessmentType: "THEORY", passingScore: 80 } });
    await db.certificationRequirement.create({ data: { certificationId: certification.id, examId: exam.id, minimumTheoryScore: 80 } });

    await enrollLearner(course.id, user.id);
    await completeLearnerLesson(lesson.id, user.id);
    expect((await getLearnerCourseProgress(course.id, user.id)).certificate).toBeNull();

    const failed = await submitLearnerExamAttempt({ examId: exam.id, score: 70, userId: user.id });
    expect(failed.attempt.outcome).toBe("FAILED");
    expect(failed.certificate).toBeNull();

    const passed = await submitLearnerExamAttempt({ examId: exam.id, score: 92, userId: user.id });
    expect(passed.attempt.outcome).toBe("PASSED");
    expect(passed.certificate?.certificationId).toBe(certification.id);

    const progress = await getLearnerCourseProgress(course.id, user.id);
    expect(progress.completedLessonIds).toEqual([lesson.id]);
    expect(progress.examAttempts[0]?.score).toBe(92);
    expect(progress.certificate?.status).toBe("CERTIFIED");
    expect(progress.certificate?.certification?.name).toBe("Operations ready");
  });
});