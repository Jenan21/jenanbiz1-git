import { randomUUID } from "node:crypto";

import {
  MissionAttemptStatus,
  MissionRunStatus,
  MissionSubtaskStatus,
  type MissionDependencyType,
  type MissionRetryBackoff,
  type Prisma,
  type SystemRole,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

type Transaction = Prisma.TransactionClient;

const runInclude = {
  mission: { select: { id: true, name: true, description: true } },
  subtasks: { orderBy: [{ sequence: "asc" as const }, { createdAt: "asc" as const }] },
  dependencies: true,
  attempts: { orderBy: { attempt: "asc" as const } },
  approvals: { orderBy: { requestedAt: "desc" as const } },
  escalations: { orderBy: { createdAt: "desc" as const } },
  history: { orderBy: { createdAt: "asc" as const } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  costs: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.MissionRunInclude;

async function addHistory(transaction: Transaction, input: {
  actorId?: string;
  event: string;
  fromStatus?: MissionRunStatus;
  metadata?: Prisma.InputJsonValue;
  missionId: string;
  runId: string;
  toStatus?: MissionRunStatus;
  traceId: string;
}) {
  return transaction.missionHistory.create({ data: input });
}

function requireStatus(current: MissionRunStatus, allowed: MissionRunStatus[]) {
  if (!allowed.includes(current)) throw new Error(`Mission run cannot transition from ${current}`);
}

export function retryDelaySeconds(input: { attempt: number; backoff: MissionRetryBackoff; baseDelaySeconds: number; maximumDelaySeconds: number }) {
  const multiplier = input.backoff === "FIXED" ? 1 : input.backoff === "LINEAR" ? input.attempt : 2 ** Math.max(0, input.attempt - 1);
  return Math.min(input.maximumDelaySeconds, input.baseDelaySeconds * multiplier);
}

export async function getMissionRunSnapshot(runId: string) {
  return db.missionRun.findUnique({ where: { id: runId }, include: runInclude });
}

export async function createMissionRun(missionId: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const mission = await transaction.mission.findUnique({ where: { id: missionId } });
    if (!mission) throw new Error("Mission not found");
    const traceId = randomUUID();
    const run = await transaction.missionRun.create({ data: { missionId, createdById: actorId, traceId } });
    await addHistory(transaction, { actorId, event: "RUN_CREATED", missionId, runId: run.id, toStatus: MissionRunStatus.CREATED, traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export async function addMissionSubtask(input: { description?: string; key: string; maxAttempts?: number; parentId?: string; priority?: number; runId: string; sequence?: number; title: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: input.runId } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.CREATED]);
    if (input.parentId) {
      const parent = await transaction.missionSubtask.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.runId !== run.id) throw new Error("Parent subtask does not belong to this run");
    }
    const subtask = await transaction.missionSubtask.create({ data: { ...input, maxAttempts: input.maxAttempts ?? 3, priority: input.priority ?? 0, sequence: input.sequence ?? 0 } });
    await addHistory(transaction, { actorId, event: "SUBTASK_ADDED", metadata: { key: subtask.key, subtaskId: subtask.id }, missionId: run.missionId, runId: run.id, traceId: run.traceId });
    return subtask;
  });
}

export async function addMissionDependency(input: { condition?: Prisma.InputJsonValue; predecessorId: string; runId: string; successorId: string; type?: MissionDependencyType }, actorId: string) {
  if (input.predecessorId === input.successorId) throw new Error("A subtask cannot depend on itself");
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: input.runId }, include: { subtasks: { select: { id: true } }, dependencies: true } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.CREATED]);
    const ids = new Set(run.subtasks.map((item) => item.id));
    if (!ids.has(input.predecessorId) || !ids.has(input.successorId)) throw new Error("Dependency subtasks must belong to the same run");
    const adjacency = new Map<string, string[]>();
    for (const dependency of run.dependencies) adjacency.set(dependency.predecessorId, [...(adjacency.get(dependency.predecessorId) ?? []), dependency.successorId]);
    const stack = [input.successorId];
    const visited = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      if (current === input.predecessorId) throw new Error("Mission dependency would create a cycle");
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(adjacency.get(current) ?? []));
    }
    const dependency = await transaction.missionDependency.create({ data: { ...input, type: input.type ?? "REQUIRES" } });
    await addHistory(transaction, { actorId, event: "DEPENDENCY_ADDED", metadata: { predecessorId: input.predecessorId, successorId: input.successorId }, missionId: run.missionId, runId: run.id, traceId: run.traceId });
    return dependency;
  });
}

export async function configureMissionRetryPolicy(input: { backoff: MissionRetryBackoff; baseDelaySeconds: number; maximumDelaySeconds: number; maxAttempts: number; missionId: string; retryableErrors?: string[] }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const policy = await transaction.missionRetryPolicy.upsert({
      where: { missionId: input.missionId },
      create: { ...input, retryableErrors: input.retryableErrors },
      update: { ...input, retryableErrors: input.retryableErrors, active: true },
    });
    await transaction.missionHistory.create({ data: { actorId, event: "RETRY_POLICY_CONFIGURED", missionId: input.missionId, metadata: { maxAttempts: input.maxAttempts, backoff: input.backoff } } });
    return policy;
  });
}

export async function addMissionFallbackPolicy(input: { condition?: Prisma.InputJsonValue; missionId: string; model?: string; name: string; priority: number; provider?: string; toolId?: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const policy = await transaction.missionFallbackPolicy.upsert({ where: { missionId_priority: { missionId: input.missionId, priority: input.priority } }, create: input, update: { ...input, active: true } });
    await transaction.missionHistory.create({ data: { actorId, event: "FALLBACK_POLICY_CONFIGURED", missionId: input.missionId, metadata: { fallbackPolicyId: policy.id, priority: policy.priority } } });
    return policy;
  });
}

async function transitionRun(runId: string, actorId: string, allowed: MissionRunStatus[], toStatus: MissionRunStatus, event: string, data: Prisma.MissionRunUpdateInput = {}) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, allowed);
    await transaction.missionRun.update({ where: { id: run.id }, data: { ...data, status: toStatus } });
    await addHistory(transaction, { actorId, event, fromStatus: run.status, missionId: run.missionId, runId: run.id, toStatus, traceId: run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export function queueMissionRun(runId: string, actorId: string) {
  return transitionRun(runId, actorId, [MissionRunStatus.CREATED], MissionRunStatus.QUEUED, "RUN_QUEUED", { queuedAt: new Date() });
}

export async function startMissionRun(runId: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: runId }, include: { attempts: true, mission: { include: { fallbackPolicies: { where: { active: true }, orderBy: { priority: "asc" } } } } } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.QUEUED, MissionRunStatus.RETRY, MissionRunStatus.FALLBACK]);
    const fallbackPolicy = run.status === MissionRunStatus.FALLBACK ? run.mission.fallbackPolicies.find((policy) => !run.attempts.some((attempt) => attempt.fallbackPolicyId === policy.id)) : undefined;
    if (run.status === MissionRunStatus.FALLBACK && !fallbackPolicy) throw new Error("No unused fallback policy is available");
    const attemptNumber = run.currentAttempt + 1;
    await transaction.missionAttempt.create({ data: { attempt: attemptNumber, attemptKey: `${run.id}:${attemptNumber}`, fallbackPolicyId: fallbackPolicy?.id, model: fallbackPolicy?.model, provider: fallbackPolicy?.provider, runId: run.id } });
    await transaction.missionRun.update({ where: { id: run.id }, data: { currentAttempt: attemptNumber, lastError: null, startedAt: run.startedAt ?? new Date(), status: MissionRunStatus.RUNNING } });
    await transaction.missionSubtask.updateMany({ where: { runId: run.id, status: MissionSubtaskStatus.PENDING }, data: { status: MissionSubtaskStatus.READY } });
    await addHistory(transaction, { actorId, event: fallbackPolicy ? "FALLBACK_STARTED" : attemptNumber > 1 ? "RETRY_STARTED" : "RUN_STARTED", fromStatus: run.status, metadata: fallbackPolicy ? { fallbackPolicyId: fallbackPolicy.id } : { attempt: attemptNumber }, missionId: run.missionId, runId: run.id, toStatus: MissionRunStatus.RUNNING, traceId: run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export async function requestMissionApproval(runId: string, gate: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.RUNNING]);
    const approval = await transaction.missionApproval.create({ data: { gate, requestedById: actorId, runId: run.id } });
    await transaction.missionRun.update({ where: { id: run.id }, data: { status: MissionRunStatus.WAITING_APPROVAL } });
    await addHistory(transaction, { actorId, event: "APPROVAL_REQUESTED", fromStatus: run.status, metadata: { approvalId: approval.id, gate }, missionId: run.missionId, runId: run.id, toStatus: MissionRunStatus.WAITING_APPROVAL, traceId: run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export async function decideMissionApproval(input: { approvalId: string; approve: boolean; rationale: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const approval = await transaction.missionApproval.findUnique({ where: { id: input.approvalId }, include: { run: true } });
    if (!approval) throw new Error("Mission approval not found");
    if (approval.status !== "PENDING" && approval.status !== "ESCALATED") throw new Error("Mission approval is already decided");
    requireStatus(approval.run.status, [MissionRunStatus.WAITING_APPROVAL]);
    const nextStatus = input.approve ? MissionRunStatus.RUNNING : MissionRunStatus.FAILED;
    await transaction.missionApproval.update({ where: { id: approval.id }, data: { decidedAt: new Date(), decidedById: actorId, rationale: input.rationale, status: input.approve ? "APPROVED" : "REJECTED" } });
    await transaction.missionRun.update({ where: { id: approval.run.id }, data: { failedAt: input.approve ? null : new Date(), lastError: input.approve ? null : input.rationale, status: nextStatus } });
    await addHistory(transaction, { actorId, event: input.approve ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED", fromStatus: approval.run.status, metadata: { approvalId: approval.id, rationale: input.rationale }, missionId: approval.run.missionId, runId: approval.run.id, toStatus: nextStatus, traceId: approval.run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: approval.run.id }, include: runInclude });
  });
}

export async function escalateMissionRun(input: { approvalId?: string; assignedRole?: SystemRole; level?: number; reason: string; runId: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: input.runId } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.RUNNING, MissionRunStatus.WAITING_APPROVAL, MissionRunStatus.RETRY, MissionRunStatus.FALLBACK]);
    if (input.approvalId) await transaction.missionApproval.update({ where: { id: input.approvalId }, data: { status: "ESCALATED" } });
    const escalation = await transaction.missionEscalation.create({ data: { ...input, actorId, level: input.level ?? 1 } });
    await addHistory(transaction, { actorId, event: "RUN_ESCALATED", metadata: { escalationId: escalation.id, level: escalation.level, reason: escalation.reason }, missionId: run.missionId, runId: run.id, traceId: run.traceId });
    return escalation;
  });
}

export async function failMissionAttempt(runId: string, error: string, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: runId }, include: { attempts: { orderBy: { attempt: "desc" } }, mission: { include: { retryPolicy: true, fallbackPolicies: { where: { active: true }, orderBy: { priority: "asc" } } } } } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.RUNNING]);
    const attempt = run.attempts.find((item) => item.status === MissionAttemptStatus.RUNNING);
    if (!attempt) throw new Error("No running mission attempt found");
    await transaction.missionAttempt.update({ where: { id: attempt.id }, data: { completedAt: new Date(), error, status: MissionAttemptStatus.FAILED } });
    const policy = run.mission.retryPolicy;
    const retryable = policy?.active && run.currentAttempt < policy.maxAttempts;
    const unusedFallback = run.mission.fallbackPolicies.find((fallback) => !run.attempts.some((item) => item.fallbackPolicyId === fallback.id));
    const nextStatus = retryable ? MissionRunStatus.RETRY : unusedFallback ? MissionRunStatus.FALLBACK : MissionRunStatus.FAILED;
    const delaySeconds = retryable && policy ? retryDelaySeconds({ attempt: run.currentAttempt, backoff: policy.backoff, baseDelaySeconds: policy.baseDelaySeconds, maximumDelaySeconds: policy.maximumDelaySeconds }) : null;
    await transaction.missionRun.update({ where: { id: run.id }, data: { failedAt: nextStatus === MissionRunStatus.FAILED ? new Date() : null, lastError: error, status: nextStatus } });
    await addHistory(transaction, { actorId, event: retryable ? "RETRY_SCHEDULED" : unusedFallback ? "FALLBACK_SELECTED" : "RUN_FAILED", fromStatus: run.status, metadata: { attemptId: attempt.id, delaySeconds, error, fallbackPolicyId: unusedFallback?.id }, missionId: run.missionId, runId: run.id, toStatus: nextStatus, traceId: run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export async function completeMissionRun(runId: string, output: Prisma.InputJsonValue | undefined, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: runId }, include: { attempts: { orderBy: { attempt: "desc" } } } });
    if (!run) throw new Error("Mission run not found");
    requireStatus(run.status, [MissionRunStatus.RUNNING]);
    const attempt = run.attempts.find((item) => item.status === MissionAttemptStatus.RUNNING);
    if (!attempt) throw new Error("No running mission attempt found");
    await transaction.missionAttempt.update({ where: { id: attempt.id }, data: { completedAt: new Date(), output, status: MissionAttemptStatus.SUCCEEDED } });
    await transaction.missionSubtask.updateMany({ where: { runId: run.id, status: { in: [MissionSubtaskStatus.READY, MissionSubtaskStatus.RUNNING] } }, data: { status: MissionSubtaskStatus.COMPLETED } });
    await transaction.missionRun.update({ where: { id: run.id }, data: { completedAt: new Date(), lastError: null, status: MissionRunStatus.COMPLETED } });
    await addHistory(transaction, { actorId, event: "RUN_COMPLETED", fromStatus: run.status, metadata: { attemptId: attempt.id }, missionId: run.missionId, runId: run.id, toStatus: MissionRunStatus.COMPLETED, traceId: run.traceId });
    return transaction.missionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  });
}

export async function recordMissionRunEvidence(input: { attemptId?: string; description: string; metadata?: Prisma.InputJsonValue; robotId: string; runId: string; type: string; verified?: boolean }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: input.runId } });
    if (!run) throw new Error("Mission run not found");
    const { runId: _runId, ...evidenceInput } = input;
    void _runId;
    const evidence = await transaction.evidence.create({ data: { ...evidenceInput, missionId: run.missionId, missionRunId: run.id, verified: input.verified ?? false } });
    await addHistory(transaction, { actorId, event: "EVIDENCE_RECORDED", metadata: { evidenceId: evidence.id, verified: evidence.verified }, missionId: run.missionId, runId: run.id, traceId: run.traceId });
    return evidence;
  });
}

export async function recordMissionRunCost(input: { actualDuration?: number; attemptId?: string; computeCostMinor: number; currency?: string; estimatedDuration?: number; inputTokens?: number; model?: string; outputTokens?: number; provider: string; robotId?: string; runId: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const run = await transaction.missionRun.findUnique({ where: { id: input.runId } });
    if (!run) throw new Error("Mission run not found");
    const { runId: _runId, ...costInput } = input;
    void _runId;
    const cost = await transaction.costRecord.create({ data: { ...costInput, currency: input.currency ?? "USD", inputTokens: input.inputTokens ?? 0, missionId: run.missionId, missionRunId: run.id, outputTokens: input.outputTokens ?? 0 } });
    await addHistory(transaction, { actorId, event: "COST_RECORDED", metadata: { costId: cost.id, amountMinor: cost.computeCostMinor, currency: cost.currency }, missionId: run.missionId, runId: run.id, traceId: run.traceId });
    return cost;
  });
}