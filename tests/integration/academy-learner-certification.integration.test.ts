import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  completeLearnerLesson,
  enrollLearner,
  getLearnerCourseProgress,
  saveLearnerLessonNote,
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
    const firstQuestion = await db.academyExamQuestion.create({ data: { examId: exam.id, prompt: "Which record proves a controlled operation?", sequence: 1, options: { create: [{ label: "Audited evidence", sequence: 1, isCorrect: true }, { label: "An unsupported claim", sequence: 2 }] } }, include: { options: true } });
    const secondQuestion = await db.academyExamQuestion.create({ data: { examId: exam.id, prompt: "What should happen before execution?", sequence: 2, options: { create: [{ label: "Approval and complete evidence", sequence: 1, isCorrect: true }, { label: "Immediate launch", sequence: 2 }] } }, include: { options: true } });
    await db.certificationRequirement.create({ data: { certificationId: certification.id, examId: exam.id, minimumTheoryScore: 80 } });

    await enrollLearner(course.id, user.id);
    await saveLearnerLessonNote({ content: "Review the operating evidence before approval.", lessonId: lesson.id, userId: user.id });
    await completeLearnerLesson(lesson.id, user.id);
    expect((await getLearnerCourseProgress(course.id, user.id)).certificate).toBeNull();

    const failed = await submitLearnerExamAttempt({ examId: exam.id, userId: user.id, answers: [{ questionId: firstQuestion.id, optionId: firstQuestion.options.find((option) => !option.isCorrect)!.id }, { questionId: secondQuestion.id, optionId: secondQuestion.options.find((option) => !option.isCorrect)!.id }] });
    expect(failed.attempt.outcome).toBe("FAILED");
    expect(failed.attempt.score).toBe(0);
    expect(failed.certificate).toBeNull();

    const passed = await submitLearnerExamAttempt({ examId: exam.id, userId: user.id, answers: [{ questionId: firstQuestion.id, optionId: firstQuestion.options.find((option) => option.isCorrect)!.id }, { questionId: secondQuestion.id, optionId: secondQuestion.options.find((option) => option.isCorrect)!.id }] });
    expect(passed.attempt.outcome).toBe("PASSED");
    expect(passed.attempt.score).toBe(100);
    expect(passed.certificate?.certificationId).toBe(certification.id);

    const progress = await getLearnerCourseProgress(course.id, user.id);
    expect(progress.completedLessonIds).toEqual([lesson.id]);
    expect(progress.examAttempts[0]?.score).toBe(100);
    expect(progress.lessonNotes[0]?.content).toBe("Review the operating evidence before approval.");
    expect(progress.examQuestions[0]?.questions[0]?.options[0]).not.toHaveProperty("isCorrect");
    expect(progress.certificate?.status).toBe("CERTIFIED");
    expect(progress.certificate?.certification?.name).toBe("Operations ready");
  });
});