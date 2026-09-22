import {
  ProjectAssessmentType,
  ProjectDecisionVerdict,
  ProjectMemberRole,
  ProjectPhaseStatus,
  ProjectPhaseType,
  ProjectRiskStatus,
  ProjectStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assessProjectQuality } from "@/services/projects/project-quality";

const phasePlan: Array<{ type: ProjectPhaseType; title: string; sequence: number }> = [
  { type: "ANALYSIS", title: "Project analysis", sequence: 1 },
  { type: "FEASIBILITY", title: "Feasibility study", sequence: 2 },
  { type: "EVALUATION", title: "Project evaluation", sequence: 3 },
  { type: "PLANNING", title: "Delivery planning", sequence: 4 },
  { type: "EXECUTION", title: "Project launch", sequence: 5 },
  { type: "REVIEW", title: "Progress review", sequence: 6 },
  { type: "COMPLETION", title: "Completion", sequence: 7 },
];

const assessmentTypes: ProjectAssessmentType[] = [
  "MARKET",
  "FINANCIAL",
  "OPERATIONAL",
  "RISK",
  "TECHNICAL",
  "COMPLIANCE",
];

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return slug || "project";
}

function projectInclude() {
  return {
    phases: { orderBy: { sequence: "asc" as const } },
    assessments: { orderBy: { type: "asc" as const } },
    decisions: { orderBy: { createdAt: "desc" as const }, take: 1 },
    financialPlans: { orderBy: { version: "desc" as const }, take: 1 },
    risks: { orderBy: [{ score: "desc" as const }, { createdAt: "desc" as const }] },
    evidenceFiles: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, checksum: true, createdAt: true }, orderBy: { createdAt: "desc" as const } },
    members: { include: { user: { include: { profile: true } } }, orderBy: { createdAt: "asc" as const } },
    organization: true,
    createdBy: { include: { profile: true } },
    intelligenceSnapshots: { orderBy: { fetchedAt: "desc" as const }, take: 1 },
  } satisfies Prisma.ProjectInclude;
}

function projectAccessWhere(userId: string, roles?: ProjectMemberRole[]) {
  return {
    OR: [
      { createdById: userId },
      { members: { some: roles ? { userId, role: { in: roles } } : { userId } } },
    ],
  };
}

export async function listUserProjects(userId: string) {
  const projects = await db.project.findMany({
    where: projectAccessWhere(userId),
    include: projectInclude(),
    orderBy: { updatedAt: "desc" },
  });
  return projects.map((project) => ({
    ...project,
    evidenceFiles: project.evidenceFiles.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })),
  }));
}

export async function listUserProjectsPage(
  userId: string,
  input: {
    limit: number;
    offset: number;
    status?: ProjectStatus;
    phase?: ProjectPhaseType;
    search?: string;
  },
) {
  const search = input.search?.trim();
  const where: Prisma.ProjectWhereInput = {
    AND: [
      projectAccessWhere(userId),
      ...(input.status ? [{ status: input.status }] : []),
      ...(input.phase ? [{ currentPhase: input.phase }] : []),
      ...(search
        ? [{
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { sector: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { description: { contains: search, mode: Prisma.QueryMode.insensitive } },
            ],
          }]
        : []),
    ],
  };
  const [projects, total] = await db.$transaction([
    db.project.findMany({ where, include: projectInclude(), orderBy: { updatedAt: "desc" }, skip: input.offset, take: input.limit }),
    db.project.count({ where }),
  ]);
  return {
    projects: projects.map((project) => ({
      ...project,
      evidenceFiles: project.evidenceFiles.map((file) => ({ ...file, sizeBytes: file.sizeBytes.toString() })),
    })),
    page: { total, limit: input.limit, offset: input.offset, hasMore: input.offset + input.limit < total },
  };
}

export async function getUserProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: { id: projectId, ...projectAccessWhere(userId) },
    include: projectInclude(),
  });
}

export async function createProject(
  input: {
    name: string;
    description?: string;
    sector?: string;
    countryCode?: string;
    currency?: string;
  },
  userId: string,
) {
  const name = input.name.trim();
  const baseSlug = slugify(name);
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.create({
      data: {
        name,
        slug,
        description: input.description?.trim() || undefined,
        sector: input.sector?.trim() || undefined,
        countryCode: input.countryCode?.trim().toUpperCase() || undefined,
        currency: input.currency?.trim().toUpperCase() || "SAR",
        status: ProjectStatus.DRAFT,
        currentPhase: ProjectPhaseType.ANALYSIS,
        createdById: userId,
        members: { create: { userId, addedById: userId, role: ProjectMemberRole.OWNER } },
        phases: {
          create: phasePlan.map((phase, index) => ({
            ...phase,
            status: index === 0 ? ProjectPhaseStatus.ACTIVE : ProjectPhaseStatus.PENDING,
            startedAt: index === 0 ? new Date() : undefined,
          })),
        },
        assessments: {
          create: assessmentTypes.map((type) => ({ type, status: ProjectPhaseStatus.PENDING })),
        },
      },
      include: projectInclude(),
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.created",
        entityType: "Project",
        entityId: project.id,
        metadata: { phaseCount: phasePlan.length, assessmentCount: assessmentTypes.length },
      },
    });
    return project;
  });
}

export async function addProjectMember(
  projectId: string,
  input: { email: string; role: "EDITOR" | "REVIEWER" | "VIEWER" },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER]) }, select: { id: true } });
    if (!project) throw new Error("Project owner access required");
    const memberUser = await transaction.user.findUnique({ where: { email: input.email.trim().toLowerCase() }, select: { id: true } });
    if (!memberUser) throw new Error("Project member user not found");
    if (memberUser.id === userId) throw new Error("Project owner is already a member");
    const member = await transaction.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: memberUser.id } },
      create: { projectId, userId: memberUser.id, addedById: userId, role: input.role },
      update: { role: input.role, addedById: userId },
      include: { user: { include: { profile: true } } },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.member.upserted", entityType: "ProjectMember", entityId: member.id, metadata: { projectId, memberUserId: member.userId, role: member.role } },
    });
    return member;
  });
}

export async function updateProjectPhase(
  projectId: string,
  phaseType: ProjectPhaseType,
  status: ProjectPhaseStatus,
  userId: string,
  notes?: string,
) {
  const phase = phasePlan.find((item) => item.type === phaseType);
  if (!phase) throw new Error("Unknown project phase");
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR]) },
      include: { phases: { orderBy: { sequence: "asc" } }, assessments: true },
    });
    if (!project) throw new Error("Project not found");
    const currentPhase = project.phases.find((item) => item.type === phaseType);
    if (!currentPhase) throw new Error("Project phase not found");
    const priorPhase = project.phases.find((item) => item.sequence === currentPhase.sequence - 1);
    const activePhase = project.phases.find((item) => item.status === ProjectPhaseStatus.ACTIVE && item.type !== phaseType);

    if (status === ProjectPhaseStatus.ACTIVE) {
      if (currentPhase.status === ProjectPhaseStatus.COMPLETED) throw new Error("Completed project phases cannot be reactivated");
      if (activePhase) throw new Error("Complete or block the active project phase before activating another");
      const completedOrSkipped: ProjectPhaseStatus[] = [ProjectPhaseStatus.COMPLETED, ProjectPhaseStatus.SKIPPED];
      if (priorPhase && !completedOrSkipped.includes(priorPhase.status)) {
        throw new Error("Complete the preceding project phase before continuing");
      }
    }
    if (status === ProjectPhaseStatus.COMPLETED) {
      if (currentPhase.status !== ProjectPhaseStatus.ACTIVE) throw new Error("Activate the project phase before completing it");
      if (phaseType === ProjectPhaseType.EVALUATION) {
        const quality = assessProjectQuality(project.assessments);
        if (!quality.readyForDecision || quality.verdict !== "APPROVE") {
          throw new Error("Approved evaluation evidence is required before completing the evaluation phase");
        }
        const decision = await transaction.projectDecision.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
        if (!decision || decision.verdict !== ProjectDecisionVerdict.APPROVE) {
          throw new Error("A recorded approval decision is required before completing the evaluation phase");
        }
      }
    }

    const updated = await transaction.projectPhase.update({
      where: { projectId_type: { projectId, type: phaseType } },
      data: {
        status,
        notes: notes?.trim() || undefined,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
    });
    const nextProjectStatus = status === ProjectPhaseStatus.ACTIVE
      ? phaseType === ProjectPhaseType.ANALYSIS
        ? ProjectStatus.ANALYSIS
        : phaseType === ProjectPhaseType.FEASIBILITY
          ? ProjectStatus.FEASIBILITY
          : phaseType === ProjectPhaseType.EVALUATION
            ? ProjectStatus.EVALUATION
            : project.status
      : status === ProjectPhaseStatus.COMPLETED && phaseType === ProjectPhaseType.EVALUATION
        ? ProjectStatus.APPROVED
        : status === ProjectPhaseStatus.COMPLETED && phaseType === ProjectPhaseType.COMPLETION
          ? ProjectStatus.COMPLETED
          : project.status;
    await transaction.project.update({
      where: { id: projectId },
      data: { currentPhase: phaseType, status: nextProjectStatus },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.phase.updated",
        entityType: "ProjectPhase",
        entityId: updated.id,
        metadata: { projectId, phaseType, status },
      },
    });
    return updated;
  });
}

export async function recordProjectAssessment(
  projectId: string,
  input: { type: ProjectAssessmentType; score?: number; summary?: string; source?: string },
  userId: string,
) {
  const score = input.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("Assessment score must be an integer from 0 to 100");
  }
  const summary = input.summary?.trim();
  const source = input.source?.trim();
  if (!summary || !source) throw new Error("Assessment evidence requires a summary and source");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR]) } });
    if (!project) throw new Error("Project not found");
    const assessment = await transaction.projectAssessment.upsert({
      where: { projectId_type: { projectId, type: input.type } },
      update: {
        score,
        summary,
        source,
        status: ProjectPhaseStatus.COMPLETED,
        assessedAt: new Date(),
      },
      create: {
        projectId,
        type: input.type,
        score,
        summary,
        source,
        status: ProjectPhaseStatus.COMPLETED,
        assessedAt: new Date(),
      },
    });
    const revisionCount = await transaction.projectAssessmentRevision.count({ where: { assessmentId: assessment.id } });
    await transaction.projectAssessmentRevision.create({
      data: {
        projectId,
        assessmentId: assessment.id,
        recordedById: userId,
        version: revisionCount + 1,
        score,
        summary,
        source,
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.assessment.recorded",
        entityType: "ProjectAssessment",
        entityId: assessment.id,
        metadata: { projectId, type: input.type, score: input.score ?? null },
      },
    });
        return assessment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (!(["P2002", "P2034"].includes(code) && attempt < 2)) throw error;
    }
  }
  throw new Error("Assessment revision could not be recorded after retry");
}

export async function saveProjectFinancialPlan(
  projectId: string,
  input: { inputs: Prisma.InputJsonValue; baseCase: Prisma.InputJsonValue; scenarios: Prisma.InputJsonValue },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR]) }, select: { id: true } });
    if (!project) throw new Error("Project not found");
    const version = (await transaction.projectFinancialPlan.count({ where: { projectId } })) + 1;
    const plan = await transaction.projectFinancialPlan.create({
      data: { projectId, createdById: userId, version, ...input },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.financial_plan.saved", entityType: "ProjectFinancialPlan", entityId: plan.id, metadata: { projectId, version } },
    });
    return plan;
  });
}

export async function createProjectRisk(
  projectId: string,
  input: { category: string; title: string; likelihood: number; impact: number; mitigation: string; ownerLabel: string; reviewAt?: Date },
  userId: string,
) {
  if (![input.likelihood, input.impact].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) {
    throw new Error("Risk likelihood and impact must be integers from 1 to 5");
  }
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR]) }, select: { id: true } });
    if (!project) throw new Error("Project not found");
    const risk = await transaction.projectRisk.create({
      data: {
        projectId,
        category: input.category.trim(),
        title: input.title.trim(),
        likelihood: input.likelihood,
        impact: input.impact,
        score: input.likelihood * input.impact,
        mitigation: input.mitigation.trim(),
        ownerLabel: input.ownerLabel.trim(),
        reviewAt: input.reviewAt,
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.risk.created", entityType: "ProjectRisk", entityId: risk.id, metadata: { projectId, score: risk.score } },
    });
    return risk;
  });
}

export async function updateProjectRiskStatus(
  projectId: string,
  riskId: string,
  status: ProjectRiskStatus,
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const risk = await transaction.projectRisk.findFirst({ where: { id: riskId, projectId, project: projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.EDITOR]) } });
    if (!risk) throw new Error("Project risk not found");
    const updated = await transaction.projectRisk.update({ where: { id: riskId }, data: { status } });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.risk.updated", entityType: "ProjectRisk", entityId: updated.id, metadata: { projectId, status } },
    });
    return updated;
  });
}

export async function recordProjectDecision(
  projectId: string,
  input: { verdict: ProjectDecisionVerdict; rationale: string },
  userId: string,
) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER, ProjectMemberRole.REVIEWER]) },
      include: {
        assessments: { orderBy: { type: "asc" } },
        phases: { where: { type: ProjectPhaseType.EVALUATION } },
        financialPlans: { orderBy: { version: "desc" }, take: 1 },
      },
    });
    if (!project) throw new Error("Project not found");
    if (project.phases[0]?.status !== ProjectPhaseStatus.ACTIVE) {
      throw new Error("Activate the evaluation phase before recording a decision");
    }
    if (!project.financialPlans[0]) {
      throw new Error("A saved financial plan is required before recording a decision");
    }
    const quality = assessProjectQuality(project.assessments);
    if (input.verdict === ProjectDecisionVerdict.APPROVE && (!quality.readyForDecision || quality.verdict !== "APPROVE")) {
      throw new Error("Complete approved evaluation evidence is required for an approval decision");
    }
    const decision = await transaction.projectDecision.create({
      data: {
        projectId,
        decidedById: userId,
        verdict: input.verdict,
        weightedScore: quality.score,
        rationale: input.rationale.trim(),
        evidenceSnapshot: project.assessments.map((assessment) => ({ type: assessment.type, score: assessment.score, summary: assessment.summary, source: assessment.source, assessedAt: assessment.assessedAt?.toISOString() ?? null })),
      },
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "project.decision.recorded", entityType: "ProjectDecision", entityId: decision.id, metadata: { projectId, verdict: decision.verdict, weightedScore: decision.weightedScore } },
    });
    return decision;
  });
}

export async function startProject(projectId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, ...projectAccessWhere(userId, [ProjectMemberRole.OWNER]) },
      include: { phases: { orderBy: { sequence: "asc" } }, assessments: true, decisions: { orderBy: { createdAt: "desc" }, take: 1 }, financialPlans: { orderBy: { version: "desc" }, take: 1 }, risks: true },
    });
    if (!project) throw new Error("Project not found");
    if (project.status === ProjectStatus.IN_PROGRESS) return project;
    const quality = assessProjectQuality(project.assessments);
    if (!quality.readyForDecision || quality.verdict !== "APPROVE") {
      throw new Error("Approved evaluation evidence is required before starting");
    }
    if (project.decisions[0]?.verdict !== ProjectDecisionVerdict.APPROVE) {
      throw new Error("A recorded approval decision is required before starting");
    }
    if (!project.financialPlans[0]) {
      throw new Error("A saved financial plan is required before starting");
    }
    const openHighRisk = project.risks.find((risk) => risk.score >= 15 && risk.status === ProjectRiskStatus.OPEN);
    if (openHighRisk) {
      throw new Error("Mitigate or accept all high project risks before starting");
    }
    const prerequisitePhases: ProjectPhaseType[] = [
      ProjectPhaseType.ANALYSIS,
      ProjectPhaseType.FEASIBILITY,
      ProjectPhaseType.EVALUATION,
      ProjectPhaseType.PLANNING,
    ];
    const unfinishedPhase = project.phases.find((phase) => prerequisitePhases.includes(phase.type) && phase.status !== ProjectPhaseStatus.COMPLETED);
    if (unfinishedPhase) {
      throw new Error("Complete analysis, feasibility, evaluation, and planning before starting");
    }
    const updated = await transaction.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.IN_PROGRESS, currentPhase: ProjectPhaseType.EXECUTION },
      include: { phases: { orderBy: { sequence: "asc" } } },
    });
    await transaction.projectPhase.update({
      where: { projectId_type: { projectId, type: ProjectPhaseType.EXECUTION } },
      data: { status: ProjectPhaseStatus.ACTIVE, startedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        action: "project.started",
        entityType: "Project",
        entityId: projectId,
        metadata: { qualityScore: quality.score, evaluationVerdict: quality.verdict },
      },
    });
    return updated;
  });
}
