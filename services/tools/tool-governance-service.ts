import { randomUUID } from "node:crypto";

import { Prisma, SystemRole, ToolExecutionStatus, ToolRiskLevel } from "@/generated/prisma/client";
import { registerPlatformTools } from "@/lib/tools/platform-tools";
import { db } from "@/lib/db";

export async function registerGovernedTool(input: { description?: string; enabled?: boolean; handlerId: string; key: string; name: string; riskLevel?: ToolRiskLevel }) {
  registerPlatformTools();
  if (!registerPlatformTools().get(input.handlerId)) throw new Error("Tool handler is not registered in this process");
  return db.toolDefinition.upsert({ where: { key: input.key }, create: { ...input, enabled: input.enabled ?? false }, update: input });
}

export function setToolPermission(input: { allowed: boolean; approvalRequired?: boolean; role: SystemRole; scopes?: Prisma.InputJsonValue; toolId: string }) {
  return db.toolPermission.upsert({ where: { toolId_role: { role: input.role, toolId: input.toolId } }, create: input, update: input });
}

export async function requestToolExecution(input: { actorId: string; payload: Prisma.InputJsonValue; role: SystemRole; toolKey: string }) {
  const tool = await db.toolDefinition.findUnique({ where: { key: input.toolKey }, include: { permissions: { where: { role: input.role } } } });
  if (!tool || !tool.enabled) throw new Error("Tool is not enabled");
  const permission = tool.permissions[0];
  const traceId = randomUUID();
  if (!permission?.allowed) {
    const denied = await db.toolExecution.create({ data: { actorId: input.actorId, completedAt: new Date(), error: "Least-privilege policy denied execution", input: input.payload, status: ToolExecutionStatus.DENIED, toolId: tool.id, traceId } });
    await db.auditLog.create({ data: { actorId: input.actorId, action: "tool.execution.denied", entityType: "ToolExecution", entityId: denied.id, metadata: { role: input.role, toolKey: input.toolKey, traceId } } });
    return denied;
  }
  const execution = await db.toolExecution.create({ data: { actorId: input.actorId, input: input.payload, status: permission.approvalRequired ? ToolExecutionStatus.PENDING_APPROVAL : ToolExecutionStatus.RUNNING, toolId: tool.id, traceId, approval: permission.approvalRequired ? { create: { requestedById: input.actorId } } : undefined }, include: { approval: true, tool: true } });
  await db.auditLog.create({ data: { actorId: input.actorId, action: permission.approvalRequired ? "tool.approval.requested" : "tool.execution.started", entityType: "ToolExecution", entityId: execution.id, metadata: { role: input.role, toolKey: input.toolKey, traceId } } });
  return permission.approvalRequired ? execution : executeGovernedTool(execution.id, input.actorId);
}

export async function decideToolApproval(input: { approve: boolean; executionId: string; rationale: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const execution = await transaction.toolExecution.findUnique({ where: { id: input.executionId }, include: { approval: true } });
    if (!execution?.approval || execution.status !== ToolExecutionStatus.PENDING_APPROVAL) throw new Error("Pending tool approval not found");
    await transaction.toolApproval.update({ where: { executionId: execution.id }, data: { decidedAt: new Date(), decidedById: actorId, rationale: input.rationale, status: input.approve ? "APPROVED" : "REJECTED" } });
    const updated = await transaction.toolExecution.update({ where: { id: execution.id }, data: { completedAt: input.approve ? null : new Date(), error: input.approve ? null : input.rationale, status: input.approve ? ToolExecutionStatus.RUNNING : ToolExecutionStatus.DENIED } });
    await transaction.auditLog.create({ data: { actorId, action: input.approve ? "tool.approval.approved" : "tool.approval.rejected", entityType: "ToolExecution", entityId: execution.id, metadata: { rationale: input.rationale, traceId: execution.traceId } } });
    return updated;
  });
}

export async function executeGovernedTool(executionId: string, actorId: string) {
  const execution = await db.toolExecution.findUnique({ where: { id: executionId }, include: { approval: true, tool: true } });
  if (!execution || execution.status !== ToolExecutionStatus.RUNNING) throw new Error("Tool execution is not runnable");
  if (execution.approval && execution.approval.status !== "APPROVED") throw new Error("Tool execution approval is required");
  try {
    const registry = registerPlatformTools();
    const output = await registry.execute(execution.tool.handlerId, execution.input);
    const completed = await db.toolExecution.update({ where: { id: execution.id }, data: { completedAt: new Date(), output: output as Prisma.InputJsonValue, startedAt: execution.startedAt ?? new Date(), status: ToolExecutionStatus.SUCCEEDED } });
    await db.auditLog.create({ data: { actorId, action: "tool.execution.succeeded", entityType: "ToolExecution", entityId: execution.id, metadata: { toolKey: execution.tool.key, traceId: execution.traceId } } });
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool execution failed";
    const failed = await db.toolExecution.update({ where: { id: execution.id }, data: { completedAt: new Date(), error: message, startedAt: execution.startedAt ?? new Date(), status: ToolExecutionStatus.FAILED } });
    await db.auditLog.create({ data: { actorId, action: "tool.execution.failed", entityType: "ToolExecution", entityId: execution.id, metadata: { message, traceId: execution.traceId } } });
    return failed;
  }
}