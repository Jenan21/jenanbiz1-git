import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  assignAcademicCourse,
  completeAcademicCourse,
  completeAcademicLab,
  completeRemedialTraining,
  createAcademicCandidate,
  enrollAcademicCandidate,
  isEligibleForTeamAssignment,
  recordAcademicExam,
  reviewAcademicCertification,
} from "@/lib/academy/academy-engine";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
const robotIds: string[] = [];

afterAll(async () => {
  if (robotIds.length) await db.robot.deleteMany({ where: { id: { in: robotIds } } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("JENAN AGENT ACADEMY FOUNDATION V1", () => {
  it("certifies proven skills and routes repeat critical failures to rejection", async () => {
    const academy = await db.academy.create({ data: { name: `Academy ${suffix}`, slug: `academy-${suffix}` } });
    academyId = academy.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Engineering", key: `engineering-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Software", key: `software-${suffix}` } });
    const skill = await db.skill.create({ data: { specializationId: specialization.id, name: "Secure delivery", key: `secure-delivery-${suffix}` } });
    const course = await db.academyCourse.create({ data: { academyId: academy.id, specializationId: specialization.id, title: "Delivery foundations", code: `DELIVERY-${suffix}` } });
    await db.courseSkill.create({ data: { courseId: course.id, skillId: skill.id } });
    const lab = await db.academyLab.create({ data: { courseId: course.id, title: "Local delivery lab", sequence: 1 } });
    const theory = await db.academyExam.create({ data: { courseId: course.id, specializationId: specialization.id, title: "Theory", assessmentType: "THEORY", passingScore: 70 } });
    const practical = await db.academyExam.create({ data: { courseId: course.id, specializationId: specialization.id, title: "Critical practical", assessmentType: "PRACTICAL", passingScore: 70, critical: true } });
    const blind = await db.academyExam.create({ data: { courseId: course.id, specializationId: specialization.id, title: "Blind challenge", assessmentType: "BLIND", passingScore: 70 } });
    const certification = await db.academyCertification.create({ data: { specializationId: specialization.id, name: "Qualified delivery", key: `qualified-delivery-${suffix}` } });
    await db.certificationRequirement.createMany({
      data: [
        { certificationId: certification.id, skillId: skill.id, minimumLevel: "QUALIFIED", minimumTheoryScore: 70, minimumPracticalScore: 70, minimumBlindScore: 70 },
        { certificationId: certification.id, examId: practical.id, hardFailureGate: true },
      ],
    });

    const successfulRobot = await db.robot.create({ data: { name: `Candidate success ${suffix}`, slug: `candidate-success-${suffix}` } });
    robotIds.push(successfulRobot.id);
    const successfulProfile = await createAcademicCandidate({ robotId: successfulRobot.id, primarySpecializationId: specialization.id });
    await enrollAcademicCandidate(successfulProfile.id);
    await assignAcademicCourse(successfulProfile.id, course.id);
    await completeAcademicCourse(successfulProfile.id, course.id);
    await expect(recordAcademicExam({ profileId: successfulProfile.id, examId: theory.id, score: 92, evaluatorIdentity: "instructor-a", reviewerIdentity: "instructor-a" })).rejects.toThrow("independent");
    expect((await recordAcademicExam({ profileId: successfulProfile.id, examId: theory.id, score: 92 })).profile.status).toBe("LAB");
    await completeAcademicLab(successfulProfile.id, lab.id);
    expect((await recordAcademicExam({ profileId: successfulProfile.id, examId: practical.id, score: 91 })).profile.status).toBe("BLIND_CHALLENGE");
    expect((await recordAcademicExam({ profileId: successfulProfile.id, examId: blind.id, score: 90 })).profile.status).toBe("CERTIFICATION_REVIEW");
    expect(await reviewAcademicCertification(successfulProfile.id, certification.id)).toEqual({ certified: true, reasons: [] });
    expect(await isEligibleForTeamAssignment(successfulProfile.id)).toBe(true);

    const failedRobot = await db.robot.create({ data: { name: `Candidate retry ${suffix}`, slug: `candidate-retry-${suffix}` } });
    robotIds.push(failedRobot.id);
    const failedProfile = await createAcademicCandidate({ robotId: failedRobot.id, primarySpecializationId: specialization.id });
    await enrollAcademicCandidate(failedProfile.id);
    await assignAcademicCourse(failedProfile.id, course.id);
    await completeAcademicCourse(failedProfile.id, course.id);
    await recordAcademicExam({ profileId: failedProfile.id, examId: theory.id, score: 80 });
    await completeAcademicLab(failedProfile.id, lab.id);
    expect((await recordAcademicExam({ profileId: failedProfile.id, examId: practical.id, score: 20 })).profile.status).toBe("REMEDIAL_TRAINING");
    await completeRemedialTraining(failedProfile.id, "PRACTICAL");
    expect((await recordAcademicExam({ profileId: failedProfile.id, examId: practical.id, score: 30 })).profile.status).toBe("REJECTED");
    expect(await db.retrainingEvent.count({ where: { profileId: failedProfile.id } })).toBe(2);
  });
});