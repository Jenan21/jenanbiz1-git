import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addSkillPrerequisite,
  addGenomeCapability,
  allocateAgentRuntime,
  createCandidateBatch,
  createCurriculumChangeProposal,
  createCurriculumVersion,
  createGeographyNode,
  createWorkforceDemand,
  enrollProfileInCohort,
  recordMissionPerformance,
  recordGeographicKnowledge,
  refreshCertificationExpiry,
  refreshGeographicKnowledgeFreshness,
  releaseAgentRuntime,
  selectEligibleAgents,
  setAgentLanguage,
  promoteValidatedExperienceToKnowledge,
} from "@/services/academy/workforce-service";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
const robotIds: string[] = [];

afterAll(async () => {
  if (robotIds.length) await db.robot.deleteMany({ where: { id: { in: robotIds } } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("Jenan digital workforce architecture", () => {
  it("builds demand-driven intake, protects skill dependencies, and allocates runtime separately", async () => {
    const academy = await db.academy.create({ data: { name: `Workforce ${suffix}`, slug: `workforce-${suffix}` } });
    academyId = academy.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Engineering", key: `engineering-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Backend", key: `backend-${suffix}` } });
    const program = await db.academyProgram.create({ data: { academyId: academy.id, specializationId: specialization.id, name: "Backend program", key: `backend-program-${suffix}`, status: "ACTIVE", minimumMasteryScore: 70 } });
    const curriculumV1 = await createCurriculumVersion({ programId: program.id, changeSummary: "Initial approved curriculum" });
    const curriculumV2 = await createCurriculumVersion({ programId: program.id, changeSummary: "Improved review rubric" });
    expect([curriculumV1.version, curriculumV2.version]).toEqual([1, 2]);
    const cohort = await db.academyCohort.create({ data: { academyId: academy.id, programId: program.id, name: "Cohort A", key: `cohort-${suffix}`, status: "OPEN", capacity: 2 } });
    const prerequisite = await db.skill.create({ data: { specializationId: specialization.id, name: "Programming", key: `programming-${suffix}` } });
    const advanced = await db.skill.create({ data: { specializationId: specialization.id, name: "Distributed systems", key: `distributed-${suffix}` } });
    await addSkillPrerequisite(advanced.id, prerequisite.id);
    await expect(addSkillPrerequisite(prerequisite.id, advanced.id)).rejects.toThrow("dependency cycle");

    const robot = await db.robot.create({ data: { name: `Operational agent ${suffix}`, slug: `operational-agent-${suffix}` } });
    robotIds.push(robot.id);
    const genome = await db.agentGenome.create({ data: { name: `Genome ${suffix}`, key: `genome-${suffix}` } });
    await db.robot.update({ where: { id: robot.id }, data: { genomeId: genome.id } });
    const profile = await db.robotAcademicProfile.create({ data: { robotId: robot.id, primarySpecializationId: specialization.id, status: "OPERATIONAL" } });
    expect((await setAgentLanguage({ profileId: profile.id, languageCode: "ar-sa", proficiency: "ADVANCED", businessLanguage: true, localTerminology: true })).languageCode).toBe("ar-sa");
    expect((await addGenomeCapability({ genomeId: genome.id, type: "TOOL", key: "postgresql", version: "17" })).type).toBe("TOOL");
    const certification = await db.academyCertification.create({ data: { specializationId: specialization.id, name: "Backend certificate", key: `backend-certificate-${suffix}`, expiresAfterDays: 1 } });
    await db.robotCertification.create({ data: { profileId: profile.id, certificationId: certification.id, status: "CERTIFIED", awardedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) } });

    const demand = await createWorkforceDemand({ title: "Qualified backend workforce", requiredCount: 3, priority: 80, specializationId: specialization.id });
    expect(demand.gap.gapCount).toBe(2);
    const candidateRobot = await db.robot.create({ data: { name: `Training candidate ${suffix}`, slug: `training-candidate-${suffix}` } });
    robotIds.push(candidateRobot.id);
    const candidateProfile = await db.robotAcademicProfile.create({ data: { robotId: candidateRobot.id, primarySpecializationId: specialization.id, status: "CANDIDATE" } });
    const batch = await createCandidateBatch({ demandId: demand.demand.id, name: "Backend intake", requestedCount: 1, priority: 80, profileIds: [candidateProfile.id] });
    expect(batch.status).toBe("QUEUED");
    await enrollProfileInCohort(candidateProfile.id, cohort.id);
    expect(await db.cohortEnrollment.count({ where: { cohortId: cohort.id, profileId: candidateProfile.id } })).toBe(1);

    const allocation = await allocateAgentRuntime({ robotId: robot.id, runtimeKey: `runtime-${suffix}` });
    expect(allocation.status).toBe("ALLOCATED");
    expect(allocation.robotId).toBe(robot.id);
    expect((await releaseAgentRuntime(allocation.id)).status).toBe("RELEASED");

    const world = await createGeographyNode({ type: "WORLD", name: `World ${suffix}` });
    const country = await createGeographyNode({ parentId: world.id, type: "COUNTRY", name: `Country ${suffix}` });
    const city = await createGeographyNode({ parentId: country.id, type: "CITY", name: `City ${suffix}` });
    await db.agentGeographyProfile.create({ data: { profileId: profile.id, geographyNodeId: city.id, proficiency: "QUALIFIED", knowledgeFreshness: 90 } });
    await db.robotSkill.create({ data: { profileId: profile.id, skillId: prerequisite.id, level: "QUALIFIED", theoryScore: 80, practicalScore: 80, blindScore: 80 } });
    const selected = await selectEligibleAgents({ specializationId: specialization.id, requiredSkillIds: [prerequisite.id], geographyNodeId: city.id, limit: 1 });
    expect(selected.map((item) => item.id)).toEqual([profile.id]);
    const knowledge = await recordGeographicKnowledge({ geographyNodeId: city.id, title: "Public market record", content: "Aggregated market information.", source: "Public source", sourceType: "PUBLIC", confidence: 80, verificationState: "HIGH_CONFIDENCE" });
    expect(knowledge.geographyNodeId).toBe(city.id);
    const expiringKnowledge = await recordGeographicKnowledge({ geographyNodeId: city.id, title: "Expiring market record", content: "Historical market information.", source: "Public source", sourceType: "PUBLIC", confidence: 70, verificationState: "VERIFIED", validUntil: new Date(Date.now() - 1_000) });
    expect((await refreshGeographicKnowledgeFreshness()).expired).toBeGreaterThanOrEqual(1);
    expect((await db.geographicKnowledge.findUniqueOrThrow({ where: { id: expiringKnowledge.id } })).verificationState).toBe("OUTDATED");

    const firstFailure = await recordMissionPerformance({ profileId: profile.id, title: "Critical run one", outcome: "FAILED", complexity: 90, qualityScore: 20, risk: "CRITICAL", validated: true });
    const knowledgeEntry = await promoteValidatedExperienceToKnowledge(firstFailure.experience.id);
    expect(knowledgeEntry.source).toBe("academic-experience:validated");
    const rawExperience = await db.academicExperience.create({ data: { profileId: profile.id, title: "Unvalidated", outcome: "OBSERVED", complexity: 10, qualityScore: 10, validated: false } });
    await expect(promoteValidatedExperienceToKnowledge(rawExperience.id)).rejects.toThrow("requires validation");
    const proposal = await createCurriculumChangeProposal({ academyId: academy.id, curriculumVersionId: curriculumV2.id, sourceExperienceId: firstFailure.experience.id, title: "Improve critical delivery training", rationale: "Validated critical failure pattern requires a revised rubric." });
    expect(proposal.status).toBe("PROPOSED");
    await recordMissionPerformance({ profileId: profile.id, title: "Critical run two", outcome: "FAILED", complexity: 90, qualityScore: 20, risk: "CRITICAL", validated: true });
    expect((await recordMissionPerformance({ profileId: profile.id, title: "Critical run three", outcome: "FAILED", complexity: 90, qualityScore: 20, risk: "CRITICAL", validated: true })).suspended).toBe(true);
    expect((await db.robotAcademicProfile.findUniqueOrThrow({ where: { id: profile.id } })).status).toBe("SUSPENDED");

    await db.robotCertification.update({ where: { profileId_certificationId: { profileId: profile.id, certificationId: certification.id } }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect(await refreshCertificationExpiry()).toBe(1);
    await expect(allocateAgentRuntime({ robotId: robot.id })).rejects.toThrow("not eligible");
    expect(await db.auditLog.count({ where: { entityType: { in: ["WorkforceDemand", "AgentRuntimeAllocation", "GeographyNode"] } } })).toBeGreaterThanOrEqual(3);
  });
});