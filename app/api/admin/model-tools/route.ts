import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ModelRegistryStatus, Prisma, SystemRole, ToolRiskLevel } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { recordRoutedModelExecution, registerModel, routeModel, setModelFallback, setModelRoutingRule } from "@/services/ai/model-routing-service";
import { decideToolApproval, executeGovernedTool, registerGovernedTool, requestToolExecution, setToolPermission } from "@/services/tools/tool-governance-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("registerModel"), averageLatencyMs: z.number().int().nonnegative().optional(), capabilities: z.array(z.string().trim().min(1).max(120)).max(100).optional(), contextWindow: z.number().int().positive().optional(), currency: z.string().trim().length(3).optional(), displayName: z.string().trim().min(2).max(240), enabled: z.boolean().optional(), inputCostPerMillionMinor: z.number().int().nonnegative().optional(), modelKey: z.string().trim().min(1).max(240), outputCostPerMillionMinor: z.number().int().nonnegative().optional(), provider: z.string().trim().min(2).max(120), qualityScore: z.number().int().min(0).max(100).optional(), status: z.nativeEnum(ModelRegistryStatus).optional() }),
  z.object({ action: z.literal("setRoutingRule"), enabled: z.boolean().optional(), maximumCostMinor: z.number().int().nonnegative().optional(), maximumLatencyMs: z.number().int().nonnegative().optional(), minimumQuality: z.number().int().min(0).max(100).optional(), modelId: z.string().cuid(), name: z.string().trim().min(2).max(240), priority: z.number().int().min(0).max(1000).optional(), requiredCapabilities: z.array(z.string().trim().min(1).max(120)).max(100).optional(), taskType: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("setFallback"), condition: z.record(z.string(), z.unknown()).optional(), fallbackModelId: z.string().cuid(), primaryModelId: z.string().cuid(), priority: z.number().int().min(0).max(1000).optional() }),
  z.object({ action: z.literal("routeModel"), estimatedInputTokens: z.number().int().nonnegative().optional(), estimatedOutputTokens: z.number().int().nonnegative().optional(), requiredCapabilities: z.array(z.string().trim().min(1).max(120)).max(100).optional(), taskType: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("recordModelExecution"), costMinor: z.number().int().nonnegative().optional(), error: z.string().trim().max(4000).optional(), fallbackFromId: z.string().cuid().optional(), inputTokens: z.number().int().nonnegative().optional(), latencyMs: z.number().int().nonnegative(), modelId: z.string().cuid(), outputTokens: z.number().int().nonnegative().optional(), qualityScore: z.number().int().min(0).max(100).optional(), robotId: z.string().cuid().optional(), routingRuleId: z.string().cuid(), success: z.boolean(), taskType: z.string().trim().min(1).max(120), traceId: z.string().uuid() }),
  z.object({ action: z.literal("registerTool"), description: z.string().trim().max(1000).optional(), enabled: z.boolean().optional(), handlerId: z.string().trim().min(1).max(240), key: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160), name: z.string().trim().min(2).max(240), riskLevel: z.nativeEnum(ToolRiskLevel).optional() }),
  z.object({ action: z.literal("setToolPermission"), allowed: z.boolean(), approvalRequired: z.boolean().optional(), role: z.nativeEnum(SystemRole), scopes: z.array(z.string().trim().min(1).max(160)).max(100).optional(), toolId: z.string().cuid() }),
  z.object({ action: z.literal("requestToolExecution"), payload: z.record(z.string(), z.unknown()), toolKey: z.string().trim().min(1).max(160) }),
  z.object({ action: z.literal("decideToolApproval"), approve: z.boolean(), executionId: z.string().cuid(), rationale: z.string().trim().min(3).max(4000) }),
  z.object({ action: z.literal("executeTool"), executionId: z.string().cuid() }),
]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid model/tool command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "registerModel" ? await registerModel({ averageLatencyMs: input.averageLatencyMs, capabilities: input.capabilities, contextWindow: input.contextWindow, currency: input.currency, displayName: input.displayName, enabled: input.enabled, inputCostPerMillionMinor: input.inputCostPerMillionMinor, modelKey: input.modelKey, outputCostPerMillionMinor: input.outputCostPerMillionMinor, provider: input.provider, qualityScore: input.qualityScore, status: input.status })
      : input.action === "setRoutingRule" ? await setModelRoutingRule({ enabled: input.enabled, maximumCostMinor: input.maximumCostMinor, maximumLatencyMs: input.maximumLatencyMs, minimumQuality: input.minimumQuality, modelId: input.modelId, name: input.name, priority: input.priority, requiredCapabilities: input.requiredCapabilities, taskType: input.taskType })
      : input.action === "setFallback" ? await setModelFallback({ condition: input.condition as Prisma.InputJsonValue | undefined, fallbackModelId: input.fallbackModelId, primaryModelId: input.primaryModelId, priority: input.priority })
      : input.action === "routeModel" ? await routeModel({ estimatedInputTokens: input.estimatedInputTokens, estimatedOutputTokens: input.estimatedOutputTokens, requiredCapabilities: input.requiredCapabilities, taskType: input.taskType })
      : input.action === "recordModelExecution" ? await recordRoutedModelExecution({ costMinor: input.costMinor, error: input.error, fallbackFromId: input.fallbackFromId, inputTokens: input.inputTokens, latencyMs: input.latencyMs, modelId: input.modelId, outputTokens: input.outputTokens, qualityScore: input.qualityScore, robotId: input.robotId, routingRuleId: input.routingRuleId, success: input.success, taskType: input.taskType, traceId: input.traceId })
      : input.action === "registerTool" ? await registerGovernedTool({ description: input.description, enabled: input.enabled, handlerId: input.handlerId, key: input.key, name: input.name, riskLevel: input.riskLevel })
      : input.action === "setToolPermission" ? await setToolPermission({ allowed: input.allowed, approvalRequired: input.approvalRequired, role: input.role, scopes: input.scopes as Prisma.InputJsonValue | undefined, toolId: input.toolId })
      : input.action === "requestToolExecution" ? await requestToolExecution({ actorId: user.id, payload: input.payload as Prisma.InputJsonValue, role: user.systemRole, toolKey: input.toolKey })
      : input.action === "decideToolApproval" ? await decideToolApproval(input, user.id)
      : await executeGovernedTool(input.executionId, user.id);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model/tool command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}