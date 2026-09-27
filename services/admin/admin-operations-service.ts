import { Prisma, TaskStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AdminOperationRoute } from "@/lib/admin/admin-operations-routes";
import { platformToolRegistry } from "@/lib/tools/tool-registry";

type AdminRow = Record<string, string | number | boolean | null>;
export type AdminPanel = { key: string; title: string; sourceState: "LIVE" | "PARTIAL" | "UNAVAILABLE"; note?: string; rows: AdminRow[] };

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function panel(key: string, title: string, rows: AdminRow[], sourceState: AdminPanel["sourceState"] = "LIVE", note?: string): AdminPanel {
  return { key, title, rows, sourceState, note };
}

async function adminPanels() {
  const [users, plans, subscriptions, roles, audit, programs] = await Promise.all([
    db.user.findMany({ select: { id: true, email: true, status: true, systemRole: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.plan.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.subscription.findMany({ include: { plan: { select: { name: true } }, organization: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.role.findMany({ include: { permissions: { include: { permission: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.auditLog.findMany({ select: { id: true, action: true, entityType: true, entityId: true, actorId: true, organizationId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.organizationProgram.findMany({ include: { organization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return [
    panel("users", "Users", users.map((item) => ({ id: item.id, email: item.email, status: item.status, role: item.systemRole, createdAt: iso(item.createdAt) }))),
    panel("subscriptions", "Plans and subscriptions", subscriptions.map((item) => ({ id: item.id, organization: item.organization.name, plan: item.plan.name, status: item.status, currentEnd: iso(item.currentEnd) }))),
    panel("plans", "Plans", plans.map((item) => ({ id: item.id, code: item.code, name: item.name, priceMinor: item.priceMinor, currency: item.currency, active: item.isActive }))),
    panel("services", "Organization services", programs.map((item) => ({ id: item.id, organization: item.organization.name, service: item.key, status: item.status, updatedAt: iso(item.updatedAt) }))),
    panel("rbac", "Roles and permissions", roles.map((item) => ({ id: item.id, role: item.name, key: item.key, system: item.isSystem, permissions: item.permissions.map((entry) => entry.permission.key).join(", ") || "—" }))),
    panel("audit", "Audit trail", audit.map((item) => ({ id: item.id, action: item.action, entityType: item.entityType, entityId: item.entityId, actorId: item.actorId, organizationId: item.organizationId, createdAt: iso(item.createdAt) }))),
  ];
}

async function factoryPanels() {
  const [robots, batches, profiles, informationRequests] = await Promise.all([
    db.robot.findMany({ select: { id: true, name: true, team: true, status: true, isVisible: true, intelligence: true, skill: true, experience: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.candidateBatch.findMany({ include: { _count: { select: { members: true } }, demand: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.robotAcademicProfile.findMany({ include: { robot: { select: { name: true } }, primarySpecialization: { select: { name: true } }, _count: { select: { skills: true, certifications: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.robotInformationRequest.findMany({ include: { robot: { select: { name: true } }, requester: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return [
    panel("robots", "Robot registry", robots.map((item) => ({ id: item.id, name: item.name, team: item.team, status: item.status, visible: item.isVisible, intelligence: item.intelligence, skill: item.skill, experience: item.experience, createdAt: iso(item.createdAt) }))),
    panel("batches", "Candidate batches", batches.map((item) => ({ id: item.id, name: item.name, status: item.status, requested: item.requestedCount, members: item._count.members, priority: item.priority, demand: item.demand?.title ?? null, createdAt: iso(item.createdAt) }))),
    panel("profiles", "Academic robot profiles", profiles.map((item) => ({ id: item.id, robot: item.robot.name, status: item.status, specialization: item.primarySpecialization?.name ?? null, quality: item.qualityScore, trust: item.trustScore, skills: item._count.skills, certifications: item._count.certifications, verifiedAt: iso(item.lastVerifiedAt) }))),
    panel("information-requests", "Public information requests", informationRequests.map((item) => ({ id: item.id, robot: item.robot.name, requester: item.requester.email, task: item.task, status: item.status, budgetMinor: item.budgetMinor, createdAt: iso(item.createdAt) }))),
    panel("genetics", "Generation policy", [], "PARTIAL", "Agent genomes and capability rules exist; no autonomous generation policy is enabled."),
  ];
}

async function academyPanels() {
  const [academies, programs, batches, profiles, courses, exams, queues, queueItems, sandboxRuns, geography] = await Promise.all([
    db.academy.findMany({ orderBy: { createdAt: "asc" }, take: 50 }),
    db.academyProgram.findMany({ include: { academy: { select: { name: true } }, specialization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.candidateBatch.findMany({ include: { _count: { select: { members: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.robotAcademicProfile.findMany({ include: { robot: { select: { name: true } }, primarySpecialization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.academyCourse.findMany({ include: { academy: { select: { name: true } }, specialization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.academyExam.findMany({ include: { specialization: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.academyWorkQueue.findMany({ include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.academyQueueItem.findMany({ include: { queue: { select: { name: true } }, profile: { include: { robot: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.sandboxLabRun.findMany({ include: { profile: { include: { robot: { select: { name: true } } } }, lab: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.geographyNode.findMany({ include: { _count: { select: { agentProfiles: true, knowledge: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return [
    panel("academies", "Academies", academies.map((item) => ({ id: item.id, name: item.name, slug: item.slug, createdAt: iso(item.createdAt) }))),
    panel("programs", "Curriculum programs", programs.map((item) => ({ id: item.id, academy: item.academy.name, name: item.name, specialization: item.specialization?.name ?? null, status: item.status, mastery: item.minimumMasteryScore }))),
    panel("batches", "Academy batches", batches.map((item) => ({ id: item.id, name: item.name, status: item.status, requested: item.requestedCount, members: item._count.members, priority: item.priority }))),
    panel("profiles", "Learner profiles", profiles.map((item) => ({ id: item.id, robot: item.robot.name, status: item.status, specialization: item.primarySpecialization?.name ?? null, theory: item.theoryScore, practical: item.practicalScore, quality: item.qualityScore, safety: item.safetyScore }))),
    panel("courses", "Theory curriculum", courses.map((item) => ({ id: item.id, academy: item.academy.name, title: item.title, code: item.code, specialization: item.specialization?.name ?? null }))),
    panel("exams", "Exams", exams.map((item) => ({ id: item.id, title: item.title, specialization: item.specialization?.name ?? null, assessmentType: item.assessmentType, passingScore: item.passingScore, critical: item.critical, version: item.version }))),
    panel("queues", "Academy queues", queues.map((item) => ({ id: item.id, name: item.name, concurrency: item.concurrency, paused: item.paused, items: item._count.items }))),
    panel("queue-items", "Queued academy work", queueItems.map((item) => ({ id: item.id, queue: item.queue.name, robot: item.profile?.robot.name ?? null, kind: item.kind, status: item.status, attempts: item.attempts, maxAttempts: item.maxAttempts, lastError: item.lastError }))),
    panel("sandbox", "Practical sandbox", sandboxRuns.map((item) => ({ id: item.id, robot: item.profile.robot.name, lab: item.lab.title, status: item.status, providerState: item.providerState, completedAt: iso(item.completedAt), error: item.error }))),
    panel("geography", "Geography coverage", geography.map((item) => ({ id: item.id, name: item.name, type: item.type, code: item.code, profiles: item._count.agentProfiles, knowledge: item._count.knowledge }))),
  ];
}

async function organizationPanels() {
  const [robots, reviews, requests] = await Promise.all([
    db.robot.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, team: true, intelligence: true, skill: true, experience: true, updatedAt: true }, orderBy: [{ team: "asc" }, { name: "asc" }], take: 200 }),
    db.committeeReview.findMany({ include: { robot: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.robotInformationRequest.findMany({ include: { robot: { select: { name: true } }, requester: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return [
    panel("organization", "Robot organization", robots.map((item) => ({ id: item.id, name: item.name, team: item.team, intelligence: item.intelligence, skill: item.skill, experience: item.experience, updatedAt: iso(item.updatedAt) }))),
    panel("committee", "Committee reviews", reviews.map((item) => ({ id: item.id, robot: item.robot.name, verdict: item.verdict, score: item.score, notes: item.notes, updatedAt: iso(item.updatedAt) }))),
    panel("escalations", "Information request escalations", requests.map((item) => ({ id: item.id, robot: item.robot.name, requester: item.requester.email, status: item.status, task: item.task, createdAt: iso(item.createdAt) }))),
  ];
}

async function missionPanels() {
  const [missions, tasks, evidence, costs] = await Promise.all([
    db.mission.findMany({ include: { _count: { select: { assignedRobots: true, tasks: true, evidence: true, costs: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.robotTask.findMany({ include: { robot: { select: { name: true } }, mission: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.evidence.findMany({ include: { robot: { select: { name: true } }, mission: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.costRecord.findMany({ include: { mission: { select: { name: true } }, robot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return [
    panel("missions", "Missions", missions.map((item) => ({ id: item.id, name: item.name, status: item.status, requiredIntelligence: item.requiredIntelligence, robots: item._count.assignedRobots, tasks: item._count.tasks, evidence: item._count.evidence, costs: item._count.costs, updatedAt: iso(item.updatedAt) }))),
    panel("tasks", "Task queue", tasks.map((item) => ({ id: item.id, title: item.title, robot: item.robot.name, mission: item.mission?.name ?? null, status: item.status, priority: item.priority, dueAt: iso(item.dueAt), updatedAt: iso(item.updatedAt) }))),
    panel("dependencies", "Dependencies", [], "UNAVAILABLE", "No persisted mission dependency graph exists."),
    panel("retry", "Retry and fallback", tasks.filter((item) => item.status === "CANCELLED").map((item) => ({ id: item.id, title: item.title, status: item.status, updatedAt: iso(item.updatedAt) })), "PARTIAL", "Attempts are persisted for academy queues; mission retry policy is not yet modeled."),
    panel("approvals", "Approval gates", [], "UNAVAILABLE", "Mission approval policy is not yet persisted."),
    panel("evidence", "Evidence pack", evidence.map((item) => ({ id: item.id, type: item.type, description: item.description, verified: item.verified, robot: item.robot.name, mission: item.mission?.name ?? null, createdAt: iso(item.createdAt) }))),
    panel("costs", "Mission costs", costs.map((item) => ({ id: item.id, mission: item.mission?.name ?? null, robot: item.robot?.name ?? null, provider: item.provider, model: item.model, inputTokens: item.inputTokens, outputTokens: item.outputTokens, costMinor: item.computeCostMinor, currency: item.currency, createdAt: iso(item.createdAt) }))),
  ];
}

async function intelligencePanels() {
  const [knowledge, learning, evidence, reviews, skills, evolutions] = await Promise.all([
    db.sharedKnowledge.findMany({ include: { mission: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.learningLog.findMany({ include: { robot: { select: { name: true } }, mission: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.evidence.findMany({ include: { robot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.committeeReview.findMany({ include: { robot: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.skill.findMany({ include: { specialization: { select: { name: true } }, _count: { select: { robotSkills: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.robotEvolution.findMany({ include: { robot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return [
    panel("knowledge", "Shared knowledge", knowledge.map((item) => ({ id: item.id, title: item.title, source: item.source, confidence: item.confidence, mission: item.mission?.name ?? null, updatedAt: iso(item.updatedAt) }))),
    panel("experiences", "Validated experiences", knowledge.filter((item) => Boolean(item.missionId)).map((item) => ({ id: item.id, title: item.title, source: item.source, confidence: item.confidence, mission: item.mission?.name ?? null })), "PARTIAL", "Experience records are represented through mission-linked shared knowledge."),
    panel("learning", "Learning logs", learning.map((item) => ({ id: item.id, robot: item.robot.name, mission: item.mission?.name ?? null, signal: item.signal, scoreBefore: item.scoreBefore, scoreAfter: item.scoreAfter, feedback: item.feedback, createdAt: iso(item.createdAt) }))),
    panel("evidence", "Evidence base", evidence.map((item) => ({ id: item.id, robot: item.robot.name, type: item.type, description: item.description, verified: item.verified, createdAt: iso(item.createdAt) }))),
    panel("reviews", "Knowledge reviews", reviews.map((item) => ({ id: item.id, robot: item.robot.name, verdict: item.verdict, score: item.score, notes: item.notes, updatedAt: iso(item.updatedAt) }))),
    panel("versions", "Evolution versions", evolutions.map((item) => ({ id: item.id, robot: item.robot.name, generation: item.generation, intelligenceDelta: item.intelligenceDelta, skillDelta: item.skillDelta, experienceDelta: item.experienceDelta, reason: item.reason, createdAt: iso(item.createdAt) })), "PARTIAL", "Robot evolution is versioned; shared-knowledge rollback is not yet available."),
    panel("skills", "Skill registry", skills.map((item) => ({ id: item.id, name: item.name, key: item.key, specialization: item.specialization?.name ?? null, riskLevel: item.riskLevel, robots: item._count.robotSkills, updatedAt: iso(item.updatedAt) }))),
  ];
}

async function modelPanels() {
  const [executions, costs] = await Promise.all([
    db.modelExecution.findMany({ include: { robot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.costRecord.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const models = new Map<string, { provider: string; model: string; runs: number; success: number; inputTokens: number; outputTokens: number }>();
  for (const execution of executions) {
    const key = `${execution.provider}:${execution.model}`;
    const current = models.get(key) ?? { provider: execution.provider, model: execution.model, runs: 0, success: 0, inputTokens: 0, outputTokens: 0 };
    current.runs += 1; current.success += execution.success ? 1 : 0; current.inputTokens += execution.inputTokens; current.outputTokens += execution.outputTokens; models.set(key, current);
  }
  return [
    panel("models", "Observed model registry", [...models.values()].map((item) => ({ ...item, successRate: item.runs ? Math.round(item.success / item.runs * 100) : 0 })), "PARTIAL", "Registry is derived from observed executions; provider configuration is not persisted here."),
    panel("router", "Model router", [], "UNAVAILABLE", "No persisted model-routing policy is configured."),
    panel("model-executions", "Model executions", executions.map((item) => ({ id: item.id, provider: item.provider, model: item.model, taskType: item.taskType, robot: item.robot?.name ?? null, inputTokens: item.inputTokens, outputTokens: item.outputTokens, latencyMs: item.latencyMs, success: item.success, createdAt: iso(item.createdAt) }))),
    panel("tools", "Registered tools", platformToolRegistry.list().map((item) => ({ id: item.id, name: item.name, description: item.description })), "PARTIAL", "Only tools registered in the current process are visible."),
    panel("tool-permissions", "Tool permissions", [], "UNAVAILABLE", "A persisted per-tool permission matrix is not configured."),
    panel("tool-executions", "Tool execution evidence", costs.map((item) => ({ id: item.id, provider: item.provider, model: item.model, costMinor: item.computeCostMinor, currency: item.currency, createdAt: iso(item.createdAt) })), "PARTIAL", "Cost records provide execution evidence; structured tool-call logs are not yet persisted."),
  ];
}

async function financePanels() {
  const [payments, entries, costs] = await Promise.all([
    db.payment.findMany({ include: { organization: { select: { name: true } }, payerUser: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.financialEntry.findMany({ include: { organization: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 200 }),
    db.costRecord.findMany({ include: { robot: { select: { name: true } }, mission: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return [
    panel("revenue", "Recorded revenue and payments", payments.map((item) => ({ id: item.id, organization: item.organization?.name ?? null, payer: item.payerUser?.email ?? null, amountMinor: item.amountMinor, currency: item.currency, status: item.status, provider: item.provider, paidAt: iso(item.paidAt), createdAt: iso(item.createdAt) }))),
    panel("financial-entries", "Operational financial entries", entries.map((item) => ({ id: item.id, organization: item.organization.name, type: item.type, amountMinor: item.amountMinor, currency: item.currency, description: item.description, occurredAt: iso(item.occurredAt) }))),
    panel("costs", "Traceable costs", costs.map((item) => ({ id: item.id, robot: item.robot?.name ?? null, mission: item.mission?.name ?? null, provider: item.provider, model: item.model, costMinor: item.computeCostMinor, currency: item.currency, inputTokens: item.inputTokens, outputTokens: item.outputTokens, createdAt: iso(item.createdAt) }))),
  ];
}

async function observabilityPanels() {
  const [audit, queues, sessions, failures] = await Promise.all([
    db.auditLog.findMany({ select: { id: true, action: true, entityType: true, entityId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.academyWorkQueue.findMany({ include: { _count: { select: { items: true } } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    db.academyQueueItem.findMany({ where: { status: "FAILED" }, include: { queue: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
  ]);
  return [
    panel("health", "Application health", [{ database: "AVAILABLE", activeSessions: sessions, redis: process.env.REDIS_URL ? "CONFIGURED" : "NOT_CONFIGURED", workerProvider: "NOT_CONNECTED" }]),
    panel("workers", "Workers", [], "UNAVAILABLE", "No external worker heartbeat source is connected."),
    panel("queues", "Queues", queues.map((item) => ({ id: item.id, name: item.name, concurrency: item.concurrency, paused: item.paused, items: item._count.items, updatedAt: iso(item.updatedAt) }))),
    panel("logs", "Central audit events", audit.map((item) => ({ id: item.id, action: item.action, entityType: item.entityType, entityId: item.entityId, createdAt: iso(item.createdAt) })), "PARTIAL", "Audit events are available; application log aggregation is not connected."),
    panel("alerts", "Queue failures", failures.map((item) => ({ id: item.id, queue: item.queue.name, kind: item.kind, status: item.status, attempts: item.attempts, lastError: item.lastError, updatedAt: iso(item.updatedAt) })), "PARTIAL", "Only persisted queue failures are shown; incident management is not connected."),
    panel("backups", "Backup status", [], "UNAVAILABLE", "No backup provider or restore-test feed is connected."),
  ];
}

async function reportPanels() {
  const [robots, profiles, missions, tasks, knowledge, costs, payments, audit] = await Promise.all([
    db.robot.count(), db.robotAcademicProfile.count(), db.mission.count(), db.robotTask.count(), db.sharedKnowledge.count(), db.costRecord.aggregate({ _sum: { computeCostMinor: true } }), db.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountMinor: true } }), db.auditLog.count(),
  ]);
  return [panel("executive", "Executive metrics", [{ robots, academicProfiles: profiles, missions, tasks, knowledgeEntries: knowledge, recordedCostMinor: costs._sum.computeCostMinor ?? 0, successfulPaymentsMinor: payments._sum.amountMinor ?? 0, auditEvents: audit }])];
}

export async function getAdminOperationSnapshot(definition: AdminOperationRoute) {
  const panels = definition.group === "admin" ? await adminPanels()
    : definition.group === "factory" ? await factoryPanels()
    : definition.group === "academy" ? await academyPanels()
    : definition.group === "organization" ? await organizationPanels()
    : definition.group === "missions" ? await missionPanels()
    : definition.group === "intelligence" ? await intelligencePanels()
    : definition.group === "models" ? await modelPanels()
    : definition.group === "finance" ? await financePanels()
    : definition.group === "observability" ? await observabilityPanels()
    : await reportPanels();
  const livePanels = panels.filter((item) => item.sourceState === "LIVE").length;
  const records = panels.reduce((total, item) => total + item.rows.length, 0);
  return { definition, panels, metrics: { panels: panels.length, livePanels, records, unavailablePanels: panels.filter((item) => item.sourceState === "UNAVAILABLE").length }, generatedAt: new Date().toISOString() };
}

export async function createAdminMission(input: { description?: string; name: string; requiredIntelligence?: number }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const mission = await transaction.mission.create({ data: { name: input.name.trim(), description: input.description?.trim() || undefined, requiredIntelligence: input.requiredIntelligence ?? 0, status: TaskStatus.DRAFT } });
    await transaction.auditLog.create({ data: { actorId, action: "admin.mission.created", entityType: "Mission", entityId: mission.id } });
    return mission;
  });
}

export async function createAdminCandidateBatch(input: { name: string; priority?: number; requestedCount: number }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const batch = await transaction.candidateBatch.create({ data: { name: input.name.trim(), requestedCount: input.requestedCount, priority: input.priority ?? 0 } });
    await transaction.auditLog.create({ data: { actorId, action: "admin.robot.batch.created", entityType: "CandidateBatch", entityId: batch.id } });
    return batch;
  });
}

export async function reviewRobotInformationRequest(input: { requestId: string; status: "REVIEWED" | "CLOSED" }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const request = await transaction.robotInformationRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new Error("Robot information request not found");
    const updated = await transaction.robotInformationRequest.update({ where: { id: request.id }, data: { status: input.status } });
    await transaction.auditLog.create({ data: { actorId, action: "admin.robot.information-request.updated", entityType: "RobotInformationRequest", entityId: request.id, metadata: { status: input.status } as Prisma.InputJsonValue } });
    return updated;
  });
}