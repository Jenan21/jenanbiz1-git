import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

const levelRank = {
  TRAINEE: 0,
  JUNIOR: 1,
  QUALIFIED: 2,
  ADVANCED: 3,
  EXPERT: 4,
  ELITE: 5,
} as const;

type ScoreSet = {
  theoryScore: number;
  practicalScore: number;
  blindScore: number;
  realWorldScore: number;
};

function requireScore(score: number) {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("Academic scores must be integers from 0 to 100");
  }
}

function deriveLevel(scores: ScoreSet) {
  if (scores.theoryScore >= 95 && scores.practicalScore >= 95 && scores.blindScore >= 95 && scores.realWorldScore >= 90) return "ELITE";
  if (scores.theoryScore >= 85 && scores.practicalScore >= 85 && scores.blindScore >= 85 && scores.realWorldScore >= 75) return "EXPERT";
  if (scores.theoryScore >= 85 && scores.practicalScore >= 85 && scores.blindScore >= 85) return "ADVANCED";
  if (scores.theoryScore >= 70 && scores.practicalScore >= 70 && scores.blindScore >= 70) return "QUALIFIED";
  if (scores.theoryScore >= 50 && scores.practicalScore >= 50) return "JUNIOR";
  return "TRAINEE";
}

function statusAfterRemedial(assessmentType: "THEORY" | "PRACTICAL" | "BLIND" | "REAL_WORLD") {
  if (assessmentType === "THEORY") return "THEORY_EXAM" as const;
  if (assessmentType === "PRACTICAL") return "PRACTICAL_EXAM" as const;
  if (assessmentType === "BLIND") return "BLIND_CHALLENGE" as const;
  return "CERTIFICATION_REVIEW" as const;
}

async function auditAcademy(action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  await db.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      metadata: { domain: "academy", ...metadata },
    },
  });
}

export async function createAcademicCandidate(input: {
  robotId: string;
  primarySpecializationId: string;
  secondarySpecializationIds?: string[];
}) {
  const [robot, specialization] = await Promise.all([
    db.robot.findUnique({ where: { id: input.robotId } }),
    db.specialization.findUnique({ where: { id: input.primarySpecializationId } }),
  ]);
  if (!robot) throw new Error("Robot candidate not found");
  if (!specialization) throw new Error("Primary specialization not found");

  return db.$transaction(async (transaction) => {
    const profile = await transaction.robotAcademicProfile.upsert({
      where: { robotId: input.robotId },
      update: {
        primarySpecializationId: input.primarySpecializationId,
        status: "CANDIDATE",
      },
      create: {
        robotId: input.robotId,
        primarySpecializationId: input.primarySpecializationId,
        status: "CANDIDATE",
      },
    });

    if (input.secondarySpecializationIds?.length) {
      await transaction.robotSecondarySpecialization.createMany({
        data: input.secondarySpecializationIds.map((specializationId) => ({ profileId: profile.id, specializationId })),
        skipDuplicates: true,
      });
    }

    await auditAcademy("ACADEMIC_CANDIDATE_CREATED", "RobotAcademicProfile", profile.id, { robotId: input.robotId });
    return profile;
  });
}

export async function enrollAcademicCandidate(profileId: string) {
  const profile = await db.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "ENROLLED" } });
  await auditAcademy("ACADEMIC_CANDIDATE_ENROLLED", "RobotAcademicProfile", profile.id);
  return profile;
}

export async function assignAcademicCourse(profileId: string, courseId: string) {
  const course = await db.academyCourse.findUnique({ where: { id: courseId } });
  if (!course) throw new Error("Academy course not found");

  return db.$transaction(async (transaction) => {
    await transaction.courseCompletion.upsert({
      where: { profileId_courseId: { profileId, courseId } },
      update: { status: "ASSIGNED", completedAt: null },
      create: { profileId, courseId, status: "ASSIGNED" },
    });
    return transaction.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "STUDYING" } });
  });
}

export async function completeAcademicCourse(profileId: string, courseId: string) {
  return db.$transaction(async (transaction) => {
    await transaction.courseCompletion.update({
      where: { profileId_courseId: { profileId, courseId } },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return transaction.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "THEORY_EXAM" } });
  });
}

export async function completeAcademicLab(profileId: string, labId: string) {
  const [profile, lab] = await Promise.all([
    db.robotAcademicProfile.findUnique({ where: { id: profileId } }),
    db.academyLab.findUnique({ where: { id: labId } }),
  ]);
  if (!profile || !lab) throw new Error("Academic profile or lab not found");
  if (profile.status !== "LAB") throw new Error("Candidate is not ready for a lab");
  if (lab.providerReadiness === "AWAITING_AI_PROVIDER") {
    throw new Error("Lab awaits AI provider");
  }
  return db.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "PRACTICAL_EXAM" } });
}

async function updateSkillPassport(profileId: string, examId: string) {
  const [profile, exam] = await Promise.all([
    db.robotAcademicProfile.findUnique({ where: { id: profileId } }),
    db.academyExam.findUnique({
      where: { id: examId },
      include: { course: { include: { skills: true } }, specialization: true },
    }),
  ]);
  if (!profile || !exam) return;

  const skills = await db.skill.findMany({
    where: {
      OR: [
        ...(exam.course ? [{ id: { in: exam.course.skills.map((link) => link.skillId) } }] : []),
        ...(exam.specializationId ? [{ specializationId: exam.specializationId }] : []),
      ],
    },
  });
  const scores = {
    theoryScore: profile.theoryScore,
    practicalScore: profile.practicalScore,
    blindScore: profile.blindExamScore,
    realWorldScore: profile.realWorldScore,
  };
  const level = deriveLevel(scores);

  const prerequisites = await db.skillPrerequisite.findMany({
    where: { skillId: { in: skills.map((skill) => skill.id) } },
  });
  const passports = await db.robotSkill.findMany({ where: { profileId } });
  const passportBySkill = new Map(passports.map((passport) => [passport.skillId, passport]));
  await db.$transaction(
    skills.map((skill) => {
      const dependencies = prerequisites.filter((edge) => edge.skillId === skill.id);
      const dependenciesMet = dependencies.every((edge) => {
        const passport = passportBySkill.get(edge.prerequisiteId);
        return passport && levelRank[passport.level] >= levelRank.QUALIFIED;
      });
      const grantedLevel = dependencies.length && !dependenciesMet && levelRank[level] >= levelRank.QUALIFIED ? "JUNIOR" : level;
      return db.robotSkill.upsert({
        where: { profileId_skillId: { profileId, skillId: skill.id } },
        update: { ...scores, level: grantedLevel },
        create: { profileId, skillId: skill.id, ...scores, level: grantedLevel },
      });
    }),
  );
}

export async function recordAcademicExam(input: {
  profileId: string;
  examId: string;
  score: number;
  evaluatorIdentity?: string;
  reviewerIdentity?: string;
  rubricVersion?: string;
  evidence?: Prisma.InputJsonValue;
}) {
  requireScore(input.score);
  const [profile, exam] = await Promise.all([
    db.robotAcademicProfile.findUnique({ where: { id: input.profileId } }),
    db.academyExam.findUnique({ where: { id: input.examId } }),
  ]);
  if (!profile || !exam) throw new Error("Academic profile or exam not found");
  if (input.evaluatorIdentity && input.reviewerIdentity && input.evaluatorIdentity === input.reviewerIdentity) {
    throw new Error("Exam evaluator and reviewer must be independent");
  }

  const outcome = input.score >= exam.passingScore ? "PASSED" : "FAILED";
  const scoreUpdate =
    exam.assessmentType === "THEORY"
      ? { theoryScore: input.score }
      : exam.assessmentType === "PRACTICAL"
        ? { practicalScore: input.score }
        : exam.assessmentType === "BLIND"
          ? { blindExamScore: input.score }
          : { realWorldScore: input.score, projectScore: input.score };

  const result = await db.$transaction(async (transaction) => {
    const attemptCount = await transaction.examAttempt.count({ where: { profileId: input.profileId, examId: input.examId } });
    if (exam.maxAttempts && attemptCount >= exam.maxAttempts) throw new Error("Exam attempt limit reached");
    const attempt = await transaction.examAttempt.create({
      data: {
        profileId: input.profileId,
        examId: input.examId,
        score: input.score,
        outcome,
        evaluatorIdentity: input.evaluatorIdentity,
        reviewerIdentity: input.reviewerIdentity,
        rubricVersion: input.rubricVersion ?? exam.rubricVersion,
        evidence: input.evidence,
      },
    });

    if (outcome === "FAILED") {
      const failedAttempts = await transaction.examAttempt.count({
        where: { profileId: input.profileId, examId: input.examId, outcome: "FAILED" },
      });
      const rejected = exam.critical && failedAttempts >= 2;
      await transaction.retrainingEvent.create({
        data: {
          profileId: input.profileId,
          reason: `Failed ${exam.assessmentType.toLowerCase()} exam: ${exam.title}`,
          status: "ASSIGNED",
        },
      });
      const updatedProfile = await transaction.robotAcademicProfile.update({
        where: { id: input.profileId },
        data: { ...scoreUpdate, status: rejected ? "REJECTED" : "REMEDIAL_TRAINING" },
      });
      return { attempt, profile: updatedProfile, outcome, rejected };
    }

    const nextStatus =
      exam.assessmentType === "THEORY"
        ? "LAB"
        : exam.assessmentType === "PRACTICAL"
          ? "BLIND_CHALLENGE"
          : "CERTIFICATION_REVIEW";
    const updatedProfile = await transaction.robotAcademicProfile.update({
      where: { id: input.profileId },
      data: { ...scoreUpdate, status: nextStatus },
    });
    return { attempt, profile: updatedProfile, outcome, rejected: false };
  });

  if (outcome === "PASSED") await updateSkillPassport(input.profileId, input.examId);
  await auditAcademy("ACADEMIC_EXAM_RECORDED", "ExamAttempt", result.attempt.id, { profileId: input.profileId, examId: input.examId, outcome });
  return result;
}

export async function completeRemedialTraining(profileId: string, assessmentType: "THEORY" | "PRACTICAL" | "BLIND" | "REAL_WORLD") {
  return db.$transaction(async (transaction) => {
    const event = await transaction.retrainingEvent.findFirst({
      where: { profileId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!event) throw new Error("No retraining assignment found");
    await transaction.retrainingEvent.update({
      where: { id: event.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    return transaction.robotAcademicProfile.update({
      where: { id: profileId },
      data: { status: statusAfterRemedial(assessmentType) },
    });
  });
}

export async function reviewAcademicCertification(profileId: string, certificationId: string) {
  const [profile, certification] = await Promise.all([
    db.robotAcademicProfile.findUnique({ where: { id: profileId }, include: { skills: true } }),
    db.academyCertification.findUnique({
      where: { id: certificationId },
      include: { requirements: true },
    }),
  ]);
  if (!profile || !certification) throw new Error("Academic profile or certification not found");
  if (!certification.requirements.length) throw new Error("Certification must define at least one requirement");

  const reasons: string[] = [];
  for (const requirement of certification.requirements) {
    if (requirement.skillId) {
      const skill = profile.skills.find((item) => item.skillId === requirement.skillId);
      if (!skill ||
        levelRank[skill.level] < levelRank[requirement.minimumLevel] ||
        skill.theoryScore < requirement.minimumTheoryScore ||
        skill.practicalScore < requirement.minimumPracticalScore ||
        skill.blindScore < requirement.minimumBlindScore ||
        skill.realWorldScore < requirement.minimumRealWorldScore) {
        reasons.push("Skill passport does not meet certification requirements");
      }
    }
    if (requirement.examId) {
      const latestAttempt = await db.examAttempt.findFirst({
        where: { profileId, examId: requirement.examId },
        orderBy: { createdAt: "desc" },
      });
      if (!latestAttempt || latestAttempt.outcome !== "PASSED") {
        reasons.push(requirement.hardFailureGate ? "Critical exam gate has not been passed" : "Exam requirement has not been passed");
      }
    }
  }

  if (reasons.length) {
    await db.robotCertification.upsert({
      where: { profileId_certificationId: { profileId, certificationId } },
      update: { status: "PENDING", awardedAt: null, expiresAt: null },
      create: { profileId, certificationId, status: "PENDING" },
    });
    return { certified: false, reasons: [...new Set(reasons)] };
  }

  const awardedAt = new Date();
  const expiresAt = certification.expiresAfterDays
    ? new Date(awardedAt.getTime() + certification.expiresAfterDays * 86_400_000)
    : null;
  await db.$transaction([
    db.robotCertification.upsert({
      where: { profileId_certificationId: { profileId, certificationId } },
      update: { status: "CERTIFIED", awardedAt, expiresAt },
      create: { profileId, certificationId, status: "CERTIFIED", awardedAt, expiresAt },
    }),
    db.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "CERTIFIED" } }),
  ]);
  await auditAcademy("ACADEMIC_CERTIFICATION_AWARDED", "RobotCertification", `${profileId}:${certificationId}`);
  return { certified: true, reasons: [] };
}

export async function isEligibleForTeamAssignment(profileId: string) {
  const certification = await db.robotCertification.findFirst({
    where: {
      profileId,
      status: "CERTIFIED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return Boolean(certification);
}