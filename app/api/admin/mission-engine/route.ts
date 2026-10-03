import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { MissionDependencyType, MissionRetryBackoff, Prisma, SystemRole } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addMissionDependency,
  addMissionFallbackPolicy,
  addMissionSubtask,
  completeMissionRun,
  configureMissionRetryPolicy,
  createMissionRun,
  decideMissionApproval,
  escalateMissionRun,
  failMissionAttempt,
  getMissionRunSnapshot,
  queueMissionRun,
  recordMissionRunCost,
  recordMissionRunEvidence,
  requestMissionApproval,
  startMissionRun,
} from "@/services/orchestration/mission-engine";

const jsonObject = z.record(z.string(), z.unknown());
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createRun"), missionId: z.string().cuid() }),
  z.object({ action: z.literal("addSubtask"), description: z.string().trim().max(4000).optional(), key: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), maxAttempts: z.number().int().min(1).max(20).optional(), parentId: z.string().cuid().optional(), priority: z.number().int().min(0).max(100).optional(), runId: z.string().cuid(), sequence: z.number().int().min(0).max(10_000).optional(), title: z.string().trim().min(2).max(240) }),
  z.object({ action: z.literal("addDependency"), condition: jsonObject.optional(), predecessorId: z.string().cuid(), runId: z.string().cuid(), successorId: z.string().cuid(), type: z.nativeEnum(MissionDependencyType).optional() }),
  z.object({ action: z.literal("configureRetry"), backoff: z.nativeEnum(MissionRetryBackoff), baseDelaySeconds: z.number().int().min(0).max(86_400), maximumDelaySeconds: z.number().int().min(0).max(604_800), maxAttempts: z.number().int().min(1).max(20), missionId: z.string().cuid(), retryableErrors: z.array(z.string().trim().min(1).max(160)).max(100).optional() }),
  z.object({ action: z.literal("addFallback"), condition: jsonObject.optional(), missionId: z.string().cuid(), model: z.string().trim().max(240).optional(), name: z.string().trim().min(2).max(240), priority: z.number().int().min(0).max(100), provider: z.string().trim().max(240).optional(), toolId: z.string().trim().max(240).optional() }),
  z.object({ action: z.literal("queueRun"), runId: z.string().cuid() }),
  z.object({ action: z.literal("startRun"), runId: z.string().cuid() }),
  z.object({ action: z.literal("requestApproval"), gate: z.string().trim().min(2).max(160), runId: z.string().cuid() }),
  z.object({ action: z.literal("decideApproval"), approvalId: z.string().cuid(), approve: z.boolean(), rationale: z.string().trim().min(3).max(4000) }),
  z.object({ action: z.literal("escalate"), approvalId: z.string().cuid().optional(), assignedRole: z.nativeEnum(SystemRole).optional(), level: z.number().int().min(1).max(10).optional(), reason: z.string().trim().min(3).max(4000), runId: z.string().cuid() }),
  z.object({ action: z.literal("failAttempt"), error: z.string().trim().min(2).max(4000), runId: z.string().cuid() }),
  z.object({ action: z.literal("completeRun"), output: jsonObject.optional(), runId: z.string().cuid() }),
  z.object({ action: z.literal("recordEvidence"), attemptId: z.string().cuid().optional(), description: z.string().trim().min(2).max(20_000), metadata: jsonObject.optional(), robotId: z.string().cuid(), runId: z.string().cuid(), type: z.string().trim().min(2).max(120), verified: z.boolean().optional() }),
  z.object({ action: z.literal("recordCost"), actualDuration: z.number().int().nonnegative().optional(), attemptId: z.string().cuid().optional(), computeCostMinor: z.number().int().nonnegative(), currency: z.string().trim().length(3).optional(), estimatedDuration: z.number().int().nonnegative().optional(), inputTokens: z.number().int().nonnegative().optional(), model: z.string().trim().max(240).optional(), outputTokens: z.number().int().nonnegative().optional(), provider: z.string().trim().min(2).max(240), robotId: z.string().cuid().optional(), runId: z.string().cuid() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId || !z.string().cuid().safeParse(runId).success) return NextResponse.json({ success: false, message: "Valid runId is required" }, { status: 400 });
  const run = await getMissionRunSnapshot(runId);
  return run ? NextResponse.json({ success: true, run }) : NextResponse.json({ success: false, message: "Mission run not found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid mission engine command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createRun" ? await createMissionRun(input.missionId, user.id)
      : input.action === "addSubtask" ? await addMissionSubtask({ description: input.description, key: input.key, maxAttempts: input.maxAttempts, parentId: input.parentId, priority: input.priority, runId: input.runId, sequence: input.sequence, title: input.title }, user.id)
      : input.action === "addDependency" ? await addMissionDependency({ condition: input.condition as Prisma.InputJsonValue | undefined, predecessorId: input.predecessorId, runId: input.runId, successorId: input.successorId, type: input.type }, user.id)
      : input.action === "configureRetry" ? await configureMissionRetryPolicy({ backoff: input.backoff, baseDelaySeconds: input.baseDelaySeconds, maximumDelaySeconds: input.maximumDelaySeconds, maxAttempts: input.maxAttempts, missionId: input.missionId, retryableErrors: input.retryableErrors }, user.id)
      : input.action === "addFallback" ? await addMissionFallbackPolicy({ condition: input.condition as Prisma.InputJsonValue | undefined, missionId: input.missionId, model: input.model, name: input.name, priority: input.priority, provider: input.provider, toolId: input.toolId }, user.id)
      : input.action === "queueRun" ? await queueMissionRun(input.runId, user.id)
      : input.action === "startRun" ? await startMissionRun(input.runId, user.id)
      : input.action === "requestApproval" ? await requestMissionApproval(input.runId, input.gate, user.id)
      : input.action === "decideApproval" ? await decideMissionApproval(input, user.id)
      : input.action === "escalate" ? await escalateMissionRun({ approvalId: input.approvalId, assignedRole: input.assignedRole, level: input.level, reason: input.reason, runId: input.runId }, user.id)
      : input.action === "failAttempt" ? await failMissionAttempt(input.runId, input.error, user.id)
      : input.action === "completeRun" ? await completeMissionRun(input.runId, input.output as Prisma.InputJsonValue | undefined, user.id)
      : input.action === "recordEvidence" ? await recordMissionRunEvidence({ attemptId: input.attemptId, description: input.description, metadata: input.metadata as Prisma.InputJsonValue | undefined, robotId: input.robotId, runId: input.runId, type: input.type, verified: input.verified }, user.id)
      : await recordMissionRunCost({ actualDuration: input.actualDuration, attemptId: input.attemptId, computeCostMinor: input.computeCostMinor, currency: input.currency, estimatedDuration: input.estimatedDuration, inputTokens: input.inputTokens, model: input.model, outputTokens: input.outputTokens, provider: input.provider, robotId: input.robotId, runId: input.runId }, user.id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mission engine command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}