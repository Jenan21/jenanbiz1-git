import {
  ProjectAssessmentType,
  ProjectPhaseStatus,
  ProjectPhaseType,
  ProjectStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

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
    organization: true,
    createdBy: { include: { profile: true } },
    intelligenceSnapshots: { orderBy: { fetchedAt: "desc" as const }, take: 1 },
  } satisfies Prisma.ProjectInclude;
}

export async function listUserProjects(userId: string) {
  return db.project.findMany({
    where: { createdById: userId },
    include: projectInclude(),
    orderBy: { updatedAt: "desc" },
  });
}

export async function getUserProject(projectId: string, userId: string) {
  return db.project.findFirst({
    where: { id: projectId, createdById: userId },
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
    const project = await transaction.project.findFirst({ where: { id: projectId, createdById: userId } });
    if (!project) throw new Error("Project not found");
    const updated = await transaction.projectPhase.update({
      where: { projectId_type: { projectId, type: phaseType } },
      data: {
        status,
        notes: notes?.trim() || undefined,
        startedAt: status === "ACTIVE" ? new Date() : undefined,
        completedAt: status === "COMPLETED" ? new Date() : undefined,
      },
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
  if (input.score !== undefined && (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)) {
    throw new Error("Assessment score must be an integer from 0 to 100");
  }
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({ where: { id: projectId, createdById: userId } });
    if (!project) throw new Error("Project not found");
    const assessment = await transaction.projectAssessment.upsert({
      where: { projectId_type: { projectId, type: input.type } },
      update: {
        score: input.score,
        summary: input.summary?.trim() || undefined,
        source: input.source?.trim() || undefined,
        status: ProjectPhaseStatus.COMPLETED,
        assessedAt: new Date(),
      },
      create: {
        projectId,
        type: input.type,
        score: input.score,
        summary: input.summary?.trim() || undefined,
        source: input.source?.trim() || undefined,
        status: ProjectPhaseStatus.COMPLETED,
        assessedAt: new Date(),
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
  });
}

export async function startProject(projectId: string, userId: string) {
  return db.$transaction(async (transaction) => {
    const project = await transaction.project.findFirst({
      where: { id: projectId, createdById: userId },
      include: { phases: { orderBy: { sequence: "asc" } } },
    });
    if (!project) throw new Error("Project not found");
    if (project.status === ProjectStatus.IN_PROGRESS) return project;
    const completedAssessments = await transaction.projectAssessment.count({
      where: { projectId, status: ProjectPhaseStatus.COMPLETED },
    });
    if (completedAssessments < assessmentTypes.length) {
      throw new Error("Complete all project assessments before starting");
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
        metadata: { completedAssessments },
      },
    });
    return updated;
  });
}
