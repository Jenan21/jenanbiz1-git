import { db } from "@/lib/db";
import { AcademyLifecycleStatus } from "@/generated/prisma/client";

const activeStudentStatuses: AcademyLifecycleStatus[] = [
  "ENROLLED",
  "STUDYING",
  "THEORY_EXAM",
  "LAB",
  "PRACTICAL_EXAM",
  "BLIND_CHALLENGE",
  "CERTIFICATION_REVIEW",
];

export async function getAcademyDashboard() {
  const [candidates, students, graduates, certifiedAgents, failedRejected, courses, exams, certifications, retrainingQueue, labsAwaitingProvider, attempts, profiles, skills, programs, curriculumVersions, cohorts, demands, gaps, geographyNodes, geographicKnowledge, runtimeAllocations, recertificationDue, academyRoles, configuredQueues, queuedWork, leasedWork, localSandboxRuns, deferredSandboxRuns] = await Promise.all([
    db.robotAcademicProfile.count({ where: { status: "CANDIDATE" } }),
    db.robotAcademicProfile.count({ where: { status: { in: activeStudentStatuses } } }),
    db.robotAcademicProfile.count({ where: { status: { in: ["CERTIFIED", "PROBATION", "OPERATIONAL"] } } }),
    db.robotCertification.count({ where: { status: "CERTIFIED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    db.robotAcademicProfile.count({ where: { status: { in: ["REJECTED", "RETIRED"] } } }),
    db.academyCourse.count(),
    db.academyExam.count(),
    db.academyCertification.count(),
    db.retrainingEvent.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    db.academyLab.count({ where: { providerReadiness: "AWAITING_AI_PROVIDER" } }),
    db.examAttempt.findMany({ select: { outcome: true } }),
    db.robotAcademicProfile.findMany({
      include: { robot: true, certifications: { where: { status: "CERTIFIED" } } },
      take: 20,
    }),
    db.skill.findMany({ include: { robotSkills: true }, take: 200 }),
    db.academyProgram.count(),
    db.curriculumVersion.count(),
    db.academyCohort.count({ where: { status: { in: ["OPEN", "ACTIVE"] } } }),
    db.workforceDemand.count({ where: { status: "OPEN" } }),
    db.workforceGap.aggregate({ where: { status: "OPEN" }, _sum: { gapCount: true } }),
    db.geographyNode.count(),
    db.geographicKnowledge.count({ where: { verificationState: { in: ["VERIFIED", "HIGH_CONFIDENCE"] } } }),
    db.agentRuntimeAllocation.count({ where: { status: "ALLOCATED" } }),
    db.robotCertification.count({ where: { status: "RECERTIFICATION_REQUIRED" } }),
    db.academyRole.count(),
    db.academyWorkQueue.count(),
    db.academyQueueItem.count({ where: { status: "PENDING" } }),
    db.academyQueueItem.count({ where: { status: "LEASED" } }),
    db.sandboxLabRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
    db.sandboxLabRun.count({ where: { status: "AWAITING_AI_PROVIDER" } }),
  ]);

  const passRate = attempts.length ? Math.round((attempts.filter((attempt) => attempt.outcome === "PASSED").length / attempts.length) * 100) : 0;
  const bestAgents = profiles
    .map((profile) => ({
      name: profile.robot.name,
      score: Math.round((profile.theoryScore + profile.practicalScore + profile.blindExamScore + profile.realWorldScore) / 4),
      certifications: profile.certifications.length,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const weakestSkills = skills
    .map((skill) => ({
      name: skill.name,
      score: skill.robotSkills.length
        ? Math.round(skill.robotSkills.reduce((sum, item) => sum + item.practicalScore, 0) / skill.robotSkills.length)
        : 0,
      learners: skill.robotSkills.length,
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 5);

  return {
    candidates,
    students,
    graduates,
    certifiedAgents,
    failedRejected,
    courses,
    exams,
    certifications,
    retrainingQueue,
    labsAwaitingProvider,
    programs,
    curriculumVersions,
    activeCohorts: cohorts,
    openDemand: demands,
    workforceGap: gaps._sum.gapCount ?? 0,
    geographyNodes,
    verifiedGeographicKnowledge: geographicKnowledge,
    activeRuntimeAllocations: runtimeAllocations,
    recertificationDue,
    academyRoles,
    configuredQueues,
    queuedWork,
    leasedWork,
    localSandboxRuns,
    deferredSandboxRuns,
    passRate,
    bestAgents,
    weakestSkills,
  };
}