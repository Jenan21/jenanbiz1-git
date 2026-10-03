import {
  AcademyLifecycleStatus,
  CertificationRecordStatus,
  GenomeCapabilityType,
  GeographicSourceType,
  Prisma,
  SkillProficiencyLevel,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function generateCandidatesForDemand(demandId: string) {
  const demand = await db.workforceDemand.findUnique({
    where: { id: demandId },
    include: { specialization: { include: { field: { include: { academy: true } } } } },
  });
  if (!demand?.specialization) throw new Error("Workforce demand specialization not found");
  const academy = demand.specialization.field.academy;
  const [course, cohort, queue] = await Promise.all([
    db.academyCourse.findFirst({ where: { academyId: academy.id, specializationId: demand.specializationId }, orderBy: { createdAt: "asc" } }),
    db.academyCohort.findFirst({ where: { academyId: academy.id, status: { in: ["OPEN", "PLANNED"] } }, orderBy: { createdAt: "asc" } }),
    db.academyWorkQueue.findFirst({ where: { academyId: academy.id, key: "admission" } }),
  ]);
  if (!course || !cohort || !queue) throw new Error("Academy course, cohort, and admission queue are required");

  const gap = await db.workforceGap.findUnique({ where: { demandId }, select: { availableCount: true } });
  const generated = Math.max(0, demand.requiredCount - (gap?.availableCount ?? 0));
  if (!generated) return { generated: 0, batch: null };

  return db.$transaction(async (transaction) => {
    const batch = await transaction.candidateBatch.create({
      data: { demandId, name: `Candidates for ${demand.title}`, requestedCount: generated, priority: demand.priority, status: "COMPLETED" },
    });
    const profileIds: string[] = [];
    for (let index = 0; index < generated; index += 1) {
      const robot = await transaction.robot.create({
        data: { name: `Candidate ${demand.title} ${index + 1}`, slug: `candidate-${demandId}-${index + 1}-${crypto.randomUUID().slice(0, 6)}`, status: "PENDING" },
      });
      const profile = await transaction.robotAcademicProfile.create({
        data: { robotId: robot.id, primarySpecializationId: demand.specializationId, status: "ENROLLED" },
      });
      profileIds.push(profile.id);
      await transaction.candidateBatchMember.create({ data: { batchId: batch.id, profileId: profile.id } });
      await transaction.courseCompletion.create({ data: { profileId: profile.id, courseId: course.id, status: "ASSIGNED" } });
      await transaction.cohortEnrollment.create({ data: { cohortId: cohort.id, profileId: profile.id } });
      await transaction.academyQueueItem.create({
        data: { queueId: queue.id, profileId: profile.id, kind: "ENROLLMENT", idempotencyKey: `demand-${demandId}-profile-${profile.id}`, payload: { demandId, batchId: batch.id } },
      });
    }
    await transaction.auditLog.create({ data: { action: "DEMAND_CANDIDATES_GENERATED", entityType: "WorkforceDemand", entityId: demandId, metadata: { generated, batchId: batch.id, profileIds } } });
    return { generated, batch: batch.id };
  });
}

const assignableStatuses: AcademyLifecycleStatus[] = ["CERTIFIED", "PROBATION", "OPERATIONAL"];
const trainingStatuses: AcademyLifecycleStatus[] = [
  "ACCEPTED",
  "ENROLLED",
  "STUDYING",
  "THEORY_EXAM",
  "THEORY_QUALIFIED",
  "LAB",
  "PRACTICAL_EXAM",
  "PRACTICAL_QUALIFIED",
  "BLIND_CHALLENGE",
  "SPECIALIZATION_PROJECT",
  "CERTIFICATION_REVIEW",
  "REMEDIAL_TRAINING",
];

const skillLevelRank: Record<SkillProficiencyLevel, number> = {
  TRAINEE: 0,
  JUNIOR: 1,
  QUALIFIED: 2,
  ADVANCED: 3,
  EXPERT: 4,
  ELITE: 5,
};

type AuditInput = {
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAcademyAudit(input: AuditInput) {
  return db.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: {
        domain: "academy",
        reason: input.reason ?? null,
        payload: input.metadata ?? null,
      },
    },
  });
}

export async function refreshWorkforceGap(demandId: string, actorId?: string) {
  const demand = await db.workforceDemand.findUnique({ where: { id: demandId } });
  if (!demand) throw new Error("Workforce demand not found");

  const profileFilter = {
    status: { in: assignableStatuses },
    ...(demand.specializationId ? { primarySpecializationId: demand.specializationId } : {}),
  } satisfies Prisma.RobotAcademicProfileWhereInput;
  const trainingFilter = {
    status: { in: trainingStatuses },
    ...(demand.specializationId ? { primarySpecializationId: demand.specializationId } : {}),
  } satisfies Prisma.RobotAcademicProfileWhereInput;
  const [availableCount, inTrainingCount] = await Promise.all([
    db.robotAcademicProfile.count({ where: profileFilter }),
    db.robotAcademicProfile.count({ where: trainingFilter }),
  ]);
  const gapCount = Math.max(0, demand.requiredCount - availableCount);
  const status = gapCount === 0 ? "FILLED" : demand.status === "PAUSED" ? "PAUSED" : "OPEN";
  const gap = await db.workforceGap.upsert({
    where: { demandId },
    update: { requiredCount: demand.requiredCount, availableCount, inTrainingCount, gapCount, status },
    create: { demandId, requiredCount: demand.requiredCount, availableCount, inTrainingCount, gapCount, status },
  });
  await writeAcademyAudit({ actorId, action: "WORKFORCE_GAP_REFRESHED", entityType: "WorkforceGap", entityId: gap.id, metadata: { demandId, gapCount } });
  return gap;
}

export async function createWorkforceDemand(
  input: { title: string; requiredCount: number; priority: number; specializationId?: string; skillId?: string; expectedGraduationAt?: Date },
  actorId?: string,
) {
  if (!Number.isInteger(input.requiredCount) || input.requiredCount < 0) throw new Error("requiredCount must be a non-negative integer");
  const demand = await db.workforceDemand.create({
    data: {
      title: input.title.trim(),
      requiredCount: input.requiredCount,
      priority: input.priority,
      specializationId: input.specializationId,
      skillId: input.skillId,
      expectedGraduationAt: input.expectedGraduationAt,
    },
  });
  const gap = await refreshWorkforceGap(demand.id, actorId);
  await writeAcademyAudit({ actorId, action: "WORKFORCE_DEMAND_CREATED", entityType: "WorkforceDemand", entityId: demand.id, metadata: { requiredCount: demand.requiredCount } });
  return { demand, gap };
}

export async function createCandidateBatch(
  input: { demandId?: string; name: string; requestedCount: number; priority: number; profileIds?: string[] },
  actorId?: string,
) {
  const profileIds = [...new Set(input.profileIds ?? [])];
  if (!Number.isInteger(input.requestedCount) || input.requestedCount < profileIds.length) {
    throw new Error("requestedCount must cover the selected candidate profiles");
  }
  const batch = await db.$transaction(async (transaction) => {
    const created = await transaction.candidateBatch.create({
      data: { demandId: input.demandId, name: input.name.trim(), requestedCount: input.requestedCount, priority: input.priority, status: "QUEUED" },
    });
    if (profileIds.length) {
      await transaction.candidateBatchMember.createMany({ data: profileIds.map((profileId) => ({ batchId: created.id, profileId })), skipDuplicates: true });
    }
    return created;
  });
  await writeAcademyAudit({ actorId, action: "CANDIDATE_BATCH_CREATED", entityType: "CandidateBatch", entityId: batch.id, metadata: { requestedCount: batch.requestedCount, selectedProfiles: profileIds.length } });
  return batch;
}

export async function listCandidateBatchMembers(input: { batchId: string; cursorProfileId?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const members = await db.candidateBatchMember.findMany({
    where: { batchId: input.batchId },
    orderBy: { profileId: "asc" },
    ...(input.cursorProfileId ? { cursor: { batchId_profileId: { batchId: input.batchId, profileId: input.cursorProfileId } }, skip: 1 } : {}),
    take: limit + 1,
    include: { profile: { include: { robot: true } } },
  });
  const hasMore = members.length > limit;
  const page = hasMore ? members.slice(0, limit) : members;
  return { items: page, nextCursor: hasMore ? page.at(-1)?.profileId ?? null : null };
}

export async function enrollProfileInCohort(profileId: string, cohortId: string, actorId?: string) {
  const cohort = await db.academyCohort.findUnique({ where: { id: cohortId } });
  if (!cohort) throw new Error("Academy cohort not found");
  if (!cohort.capacity) {
    return db.$transaction(async (transaction) => {
      const enrollment = await transaction.cohortEnrollment.upsert({
        where: { cohortId_profileId: { cohortId, profileId } },
        update: {},
        create: { cohortId, profileId },
      });
      await transaction.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "ENROLLED" } });
      return enrollment;
    });
  }

  const enrollment = await db.$transaction(async (transaction) => {
    const existing = await transaction.cohortEnrollment.findUnique({ where: { cohortId_profileId: { cohortId, profileId } } });
    if (existing) return existing;
    const count = await transaction.cohortEnrollment.count({ where: { cohortId } });
    if (count >= cohort.capacity!) throw new Error("Academy cohort capacity reached");
    const created = await transaction.cohortEnrollment.create({ data: { cohortId, profileId } });
    await transaction.robotAcademicProfile.update({ where: { id: profileId }, data: { status: "ENROLLED" } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  await writeAcademyAudit({ actorId, action: "COHORT_ENROLLMENT_CREATED", entityType: "CohortEnrollment", entityId: `${cohortId}:${profileId}` });
  return enrollment;
}

export async function addSkillPrerequisite(skillId: string, prerequisiteId: string, actorId?: string) {
  if (skillId === prerequisiteId) throw new Error("A skill cannot depend on itself");
  const pending = [prerequisiteId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === skillId) throw new Error("Skill prerequisite would create a dependency cycle");
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await db.skillPrerequisite.findMany({ where: { skillId: current }, select: { prerequisiteId: true } });
    pending.push(...edges.map((edge) => edge.prerequisiteId));
  }
  const edge = await db.skillPrerequisite.upsert({
    where: { skillId_prerequisiteId: { skillId, prerequisiteId } },
    update: {},
    create: { skillId, prerequisiteId },
  });
  await writeAcademyAudit({ actorId, action: "SKILL_PREREQUISITE_ADDED", entityType: "SkillPrerequisite", entityId: `${skillId}:${prerequisiteId}` });
  return edge;
}

export async function addSkillRelation(input: { sourceSkillId: string; targetSkillId: string; relationType: "RELATED" | "REQUIRED_TOOL" | "REQUIRED_KNOWLEDGE" | "REQUIRED_CERTIFICATION" }, actorId?: string) {
  if (input.sourceSkillId === input.targetSkillId) throw new Error("A skill cannot relate to itself");
  const relation = await db.skillRelation.upsert({
    where: { sourceSkillId_targetSkillId_relationType: input },
    update: {},
    create: input,
  });
  await writeAcademyAudit({ actorId, action: "SKILL_RELATION_ADDED", entityType: "SkillRelation", entityId: `${input.sourceSkillId}:${input.targetSkillId}` });
  return relation;
}

export async function createGeographyNode(input: { parentId?: string; type: "WORLD" | "COUNTRY" | "STATE" | "REGION" | "CITY" | "DISTRICT" | "TOWN" | "VILLAGE" | "LOCAL_ZONE" | "CUSTOM"; name: string; code?: string; metadata?: Prisma.InputJsonValue }, actorId?: string) {
  if (input.parentId) {
    const parent = await db.geographyNode.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new Error("Geography parent not found");
  }
  const node = await db.geographyNode.create({ data: input });
  await writeAcademyAudit({ actorId, action: "GEOGRAPHY_NODE_CREATED", entityType: "GeographyNode", entityId: node.id, metadata: { type: node.type } });
  return node;
}

export async function recordGeographicKnowledge(
  input: { geographyNodeId: string; title: string; content: string; source: string; sourceType: GeographicSourceType; industry?: string; observedAt?: Date; validUntil?: Date; confidence: number; verificationState: "VERIFIED" | "HIGH_CONFIDENCE" | "ESTIMATED" | "OUTDATED" | "UNKNOWN" },
  actorId?: string,
) {
  if (input.confidence < 0 || input.confidence > 100) throw new Error("Geographic confidence must be between 0 and 100");
  const record = await db.geographicKnowledge.create({ data: input });
  await writeAcademyAudit({ actorId, action: "GEOGRAPHIC_KNOWLEDGE_RECORDED", entityType: "GeographicKnowledge", entityId: record.id, metadata: { state: record.verificationState, sourceType: record.sourceType } });
  return record;
}

export async function refreshGeographicKnowledgeFreshness(actorId?: string) {
  const now = new Date();
  const expired = await db.geographicKnowledge.updateMany({
    where: { validUntil: { lte: now }, verificationState: { not: "OUTDATED" } },
    data: { verificationState: "OUTDATED" },
  });
  const staleThreshold = new Date(now.getTime() - 180 * 86_400_000);
  const stale = await db.geographicKnowledge.updateMany({
    where: { validUntil: null, observedAt: { lte: staleThreshold }, verificationState: { in: ["VERIFIED", "HIGH_CONFIDENCE"] } },
    data: { verificationState: "ESTIMATED" },
  });
  if (expired.count || stale.count) {
    await writeAcademyAudit({ actorId, action: "GEOGRAPHIC_KNOWLEDGE_FRESHNESS_REFRESHED", entityType: "GeographicKnowledge", metadata: { expired: expired.count, stale: stale.count } });
  }
  return { expired: expired.count, stale: stale.count };
}

export async function setAgentLanguage(input: {
  profileId: string;
  languageCode: string;
  proficiency: SkillProficiencyLevel;
  businessLanguage?: boolean;
  localTerminology?: boolean;
}, actorId?: string) {
  const languageCode = input.languageCode.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(languageCode)) throw new Error("Invalid language code");
  const language = await db.agentLanguageProficiency.upsert({
    where: { profileId_languageCode: { profileId: input.profileId, languageCode } },
    update: { proficiency: input.proficiency, businessLanguage: input.businessLanguage ?? false, localTerminology: input.localTerminology ?? false },
    create: { profileId: input.profileId, languageCode, proficiency: input.proficiency, businessLanguage: input.businessLanguage ?? false, localTerminology: input.localTerminology ?? false },
  });
  await writeAcademyAudit({ actorId, action: "AGENT_LANGUAGE_UPDATED", entityType: "AgentLanguageProficiency", entityId: `${language.profileId}:${language.languageCode}` });
  return language;
}

export async function addGenomeCapability(input: { genomeId: string; type: GenomeCapabilityType; key: string; version?: string; metadata?: Prisma.InputJsonValue }, actorId?: string) {
  const capability = await db.agentGenomeCapability.upsert({
    where: { genomeId_type_key: { genomeId: input.genomeId, type: input.type, key: input.key } },
    update: { version: input.version, metadata: input.metadata },
    create: input,
  });
  await writeAcademyAudit({ actorId, action: "GENOME_CAPABILITY_ADDED", entityType: "AgentGenomeCapability", entityId: capability.id, metadata: { type: capability.type, key: capability.key } });
  return capability;
}

export async function promoteValidatedExperienceToKnowledge(experienceId: string, actorId?: string) {
  const experience = await db.academicExperience.findUnique({ where: { id: experienceId } });
  if (!experience) throw new Error("Academic experience not found");
  if (!experience.validated) throw new Error("Raw experience requires validation before knowledge promotion");
  if (experience.knowledgeEntryId) return db.sharedKnowledge.findUniqueOrThrow({ where: { id: experience.knowledgeEntryId } });
  const knowledge = await db.$transaction(async (transaction) => {
    const created = await transaction.sharedKnowledge.create({
      data: {
        title: experience.title,
        content: `Outcome: ${experience.outcome}. Complexity: ${experience.complexity}. Quality: ${experience.qualityScore}.`,
        source: "academic-experience:validated",
        confidence: Math.min(100, Math.max(0, experience.qualityScore)),
        missionId: experience.missionId,
      },
    });
    await transaction.academicExperience.update({ where: { id: experience.id }, data: { knowledgeEntryId: created.id } });
    return created;
  });
  await writeAcademyAudit({ actorId, action: "ACADEMIC_EXPERIENCE_PROMOTED_TO_KNOWLEDGE", entityType: "SharedKnowledge", entityId: knowledge.id, metadata: { experienceId } });
  return knowledge;
}

export async function createCurriculumVersion(input: { programId: string; changeSummary: string; source?: string }, actorId?: string) {
  const latest = await db.curriculumVersion.findFirst({ where: { programId: input.programId }, orderBy: { version: "desc" } });
  const curriculumVersion = await db.curriculumVersion.create({
    data: { programId: input.programId, version: (latest?.version ?? 0) + 1, changeSummary: input.changeSummary, source: input.source, status: "DRAFT" },
  });
  await writeAcademyAudit({ actorId, action: "CURRICULUM_VERSION_CREATED", entityType: "CurriculumVersion", entityId: curriculumVersion.id, metadata: { version: curriculumVersion.version } });
  return curriculumVersion;
}

export async function createCurriculumChangeProposal(input: { academyId: string; curriculumVersionId?: string; sourceExperienceId?: string; title: string; rationale: string }, actorId?: string) {
  const proposal = await db.curriculumChangeProposal.create({ data: input });
  await writeAcademyAudit({ actorId, action: "CURRICULUM_CHANGE_PROPOSED", entityType: "CurriculumChangeProposal", entityId: proposal.id });
  return proposal;
}

export async function allocateAgentRuntime(input: { robotId: string; missionId?: string; robotTaskId?: string; runtimeKey?: string }, actorId?: string) {
  const profile = await db.robotAcademicProfile.findUnique({
    where: { robotId: input.robotId },
    include: { certifications: true },
  });
  const hasValidCertification = profile?.certifications.some((record) => record.status === CertificationRecordStatus.CERTIFIED && (!record.expiresAt || record.expiresAt > new Date()));
  if (!profile || !assignableStatuses.includes(profile.status) || !hasValidCertification) {
    throw new Error("Agent identity is not eligible for runtime allocation");
  }
  const allocation = await db.agentRuntimeAllocation.create({
    data: { robotId: input.robotId, missionId: input.missionId, robotTaskId: input.robotTaskId, runtimeKey: input.runtimeKey ?? crypto.randomUUID() },
  });
  await writeAcademyAudit({ actorId, action: "AGENT_RUNTIME_ALLOCATED", entityType: "AgentRuntimeAllocation", entityId: allocation.id, metadata: { robotId: input.robotId } });
  return allocation;
}

export async function releaseAgentRuntime(allocationId: string, actorId?: string) {
  const allocation = await db.agentRuntimeAllocation.update({ where: { id: allocationId }, data: { status: "RELEASED", releasedAt: new Date() } });
  await writeAcademyAudit({ actorId, action: "AGENT_RUNTIME_RELEASED", entityType: "AgentRuntimeAllocation", entityId: allocation.id });
  return allocation;
}

export async function refreshCertificationExpiry(actorId?: string) {
  const result = await db.robotCertification.updateMany({
    where: { status: "CERTIFIED", expiresAt: { lte: new Date() } },
    data: { status: "RECERTIFICATION_REQUIRED" },
  });
  if (result.count) await writeAcademyAudit({ actorId, action: "CERTIFICATION_EXPIRY_REFRESHED", entityType: "RobotCertification", metadata: { count: result.count } });
  return result.count;
}

export async function selectEligibleAgents(input: {
  specializationId?: string;
  requiredSkillIds?: string[];
  minimumSkillLevel?: SkillProficiencyLevel;
  geographyNodeId?: string;
  limit?: number;
}) {
  const requiredSkillIds = [...new Set(input.requiredSkillIds ?? [])];
  const profiles = await db.robotAcademicProfile.findMany({
    where: {
      status: { in: assignableStatuses },
      ...(input.specializationId ? { primarySpecializationId: input.specializationId } : {}),
      certifications: { some: { status: "CERTIFIED", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } },
      ...(input.geographyNodeId ? { geographyProfiles: { some: { geographyNodeId: input.geographyNodeId } } } : {}),
    },
    include: { robot: true, skills: true, certifications: true, geographyProfiles: true },
  });
  const minimumLevel = input.minimumSkillLevel ?? "QUALIFIED";
  return profiles
    .filter((profile) => requiredSkillIds.every((skillId) => profile.skills.some((skill) => skill.skillId === skillId && skillLevelRank[skill.level] >= skillLevelRank[minimumLevel])))
    .sort((left, right) => {
      const leftScore = left.trustScore + left.reliabilityScore + left.qualityScore + left.realWorldScore;
      const rightScore = right.trustScore + right.reliabilityScore + right.qualityScore + right.realWorldScore;
      return rightScore - leftScore;
    })
    .slice(0, input.limit ?? 10);
}

export async function recordMissionPerformance(input: {
  profileId: string;
  missionId?: string;
  evidenceId?: string;
  title: string;
  outcome: string;
  complexity: number;
  qualityScore: number;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  validated: boolean;
}, actorId?: string) {
  for (const score of [input.complexity, input.qualityScore]) {
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error("Performance scores must be integers from 0 to 100");
  }
  const isSuccess = input.outcome === "SUCCESS";
  const result = await db.$transaction(async (transaction) => {
    const experience = await transaction.academicExperience.create({
      data: {
        profileId: input.profileId,
        missionId: input.missionId,
        evidenceId: input.evidenceId,
        title: input.title,
        outcome: input.outcome,
        complexity: input.complexity,
        qualityScore: input.qualityScore,
        risk: input.risk,
        validated: input.validated,
      },
    });
    const profile = await transaction.robotAcademicProfile.findUnique({ where: { id: input.profileId } });
    if (!profile) throw new Error("Academic profile not found");
    const recentFailures = isSuccess ? 0 : await transaction.academicExperience.count({
      where: { profileId: input.profileId, outcome: { not: "SUCCESS" } },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const shouldSuspend = !isSuccess && input.risk === "CRITICAL" && recentFailures >= 3;
    const updated = await transaction.robotAcademicProfile.update({
      where: { id: input.profileId },
      data: {
        realWorldScore: Math.round((profile.realWorldScore + input.qualityScore) / 2),
        qualityScore: Math.round((profile.qualityScore + input.qualityScore) / 2),
        reliabilityScore: Math.max(0, Math.min(100, profile.reliabilityScore + (isSuccess ? 5 : -10))),
        trustScore: Math.max(0, Math.min(100, profile.trustScore + (isSuccess && input.validated ? 5 : -10))),
        status: shouldSuspend ? "SUSPENDED" : profile.status,
        lastVerifiedAt: input.validated ? new Date() : profile.lastVerifiedAt,
      },
    });
    if (shouldSuspend) {
      await transaction.retrainingEvent.create({ data: { profileId: input.profileId, reason: "Repeated critical mission failures", status: "ASSIGNED" } });
    }
    return { experience, profile: updated, suspended: shouldSuspend };
  });
  await writeAcademyAudit({ actorId, action: "MISSION_PERFORMANCE_RECORDED", entityType: "AcademicExperience", entityId: result.experience.id, metadata: { profileId: input.profileId, outcome: input.outcome, suspended: result.suspended } });
  return result;
}