import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { ModelRegistryStatus, SystemRole, ToolRiskLevel, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { TASK_BRIEF_TOOL_ID } from "@/lib/tools/platform-tools";
import { recordRoutedModelExecution, registerModel, routeModel, setModelFallback, setModelRoutingRule } from "@/services/ai/model-routing-service";
import { decideToolApproval, executeGovernedTool, registerGovernedTool, requestToolExecution, setToolPermission } from "@/services/tools/tool-governance-service";

describe("model and tool governance", () => {
  let actorId = "";
  const modelIds: string[] = [];
  let toolId = "";

  it("routes by quality, cost, latency and fallback then records execution", async () => {
    const actor = await db.user.create({ data: { email: `governance.${randomUUID()}@example.test`, status: UserStatus.ACTIVE, systemRole: SystemRole.ADMIN } });
    actorId = actor.id;
    const primary = await registerModel({ averageLatencyMs: 300, capabilities: ["analysis", "json"], displayName: "Primary", enabled: true, inputCostPerMillionMinor: 1000, modelKey: `primary-${randomUUID()}`, outputCostPerMillionMinor: 2000, provider: "internal", qualityScore: 90, status: ModelRegistryStatus.ACTIVE });
    const fallback = await registerModel({ averageLatencyMs: 200, capabilities: ["analysis", "json"], displayName: "Fallback", enabled: true, inputCostPerMillionMinor: 500, modelKey: `fallback-${randomUUID()}`, outputCostPerMillionMinor: 1000, provider: "internal", qualityScore: 80, status: ModelRegistryStatus.ACTIVE });
    modelIds.push(primary.id, fallback.id);
    const rule = await setModelRoutingRule({ maximumCostMinor: 10, maximumLatencyMs: 500, minimumQuality: 85, modelId: primary.id, name: "High-quality analysis", priority: 100, requiredCapabilities: ["analysis"], taskType: "analysis" });
    await setModelRoutingRule({ maximumLatencyMs: 100, minimumQuality: 90, modelId: fallback.id, name: "Ineligible latency rule", priority: 200, taskType: "analysis" });
    await setModelFallback({ fallbackModelId: fallback.id, primaryModelId: primary.id, priority: 1 });

    const route = await routeModel({ estimatedInputTokens: 1000, estimatedOutputTokens: 500, requiredCapabilities: ["json"], taskType: "analysis" });
    expect(route.model.id).toBe(primary.id);
    expect(route.rule.id).toBe(rule.id);
    expect(route.fallbacks[0]?.id).toBe(fallback.id);
    const execution = await recordRoutedModelExecution({ inputTokens: 1000, latencyMs: 320, modelId: primary.id, outputTokens: 500, qualityScore: 92, routingRuleId: rule.id, success: true, taskType: "analysis", traceId: route.traceId });
    expect(execution).toMatchObject({ registryModelId: primary.id, routingRuleId: rule.id, success: true, traceId: route.traceId });
  });

  it("enforces least privilege and approval before running a registered tool", async () => {
    const tool = await registerGovernedTool({ enabled: true, handlerId: TASK_BRIEF_TOOL_ID, key: `brief-${randomUUID()}`, name: "Governed brief", riskLevel: ToolRiskLevel.HIGH });
    toolId = tool.id;
    await setToolPermission({ allowed: false, role: SystemRole.USER, toolId: tool.id });
    await setToolPermission({ allowed: true, approvalRequired: true, role: SystemRole.ADMIN, scopes: ["mission:write"], toolId: tool.id });

    const denied = await requestToolExecution({ actorId, payload: { title: "Denied" }, role: SystemRole.USER, toolKey: tool.key });
    expect(denied.status).toBe("DENIED");
    const pending = await requestToolExecution({ actorId, payload: { title: "Approved brief", description: "Governed execution" }, role: SystemRole.ADMIN, toolKey: tool.key });
    expect(pending.status).toBe("PENDING_APPROVAL");
    await decideToolApproval({ approve: true, executionId: pending.id, rationale: "Least-privilege review passed" }, actorId);
    const completed = await executeGovernedTool(pending.id, actorId);
    expect(completed.status).toBe("SUCCEEDED");
    expect(completed.output).toMatchObject({ category: "general" });
    expect(completed.traceId).toBeTruthy();
  });

  afterAll(async () => {
    if (toolId) await db.toolDefinition.delete({ where: { id: toolId } }).catch(() => undefined);
    if (modelIds.length) await db.modelRegistryEntry.deleteMany({ where: { id: { in: modelIds } } });
    if (actorId) {
      await db.auditLog.deleteMany({ where: { actorId } });
      await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });
});