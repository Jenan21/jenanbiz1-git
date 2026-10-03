import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("model and tool governance UI", () => {
  test.setTimeout(120_000);
  const modelIds: string[] = [];
  let toolId = "";

  test.beforeAll(async () => { await cleanE2EIdentities(); await seedE2EAdmin(); });
  test.afterAll(async () => {
    if (toolId) await queryE2E('DELETE FROM "ToolDefinition" WHERE id = $1', [toolId]);
    if (modelIds.length) await queryE2E('DELETE FROM "ModelRegistryEntry" WHERE id = ANY($1::text[])', [modelIds]);
    await cleanE2EIdentities();
  });

  test("routes models and governs approved tool execution", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.admin.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    async function post(data: Record<string, unknown>, status = 200) { const response = await page.request.post("/api/admin/model-tools", { headers: { origin }, data }); expect(response.status()).toBe(status); return response.json(); }
    const primary = (await post({ action: "registerModel", averageLatencyMs: 250, capabilities: ["general", "json"], displayName: "E2E Primary", enabled: true, inputCostPerMillionMinor: 100, modelKey: `primary-${randomUUID()}`, outputCostPerMillionMinor: 200, provider: "internal", qualityScore: 90, status: "ACTIVE" })).result;
    const fallback = (await post({ action: "registerModel", averageLatencyMs: 300, capabilities: ["general", "json"], displayName: "E2E Fallback", enabled: true, modelKey: `fallback-${randomUUID()}`, provider: "internal", qualityScore: 80, status: "ACTIVE" })).result;
    modelIds.push(primary.id, fallback.id);
    const rule = (await post({ action: "setRoutingRule", maximumLatencyMs: 500, minimumQuality: 85, modelId: primary.id, name: "E2E General Rule", priority: 100, requiredCapabilities: ["json"], taskType: "general" })).result;
    await post({ action: "setFallback", fallbackModelId: fallback.id, primaryModelId: primary.id, priority: 1 });
    const routed = (await post({ action: "routeModel", estimatedInputTokens: 1000, estimatedOutputTokens: 500, requiredCapabilities: ["json"], taskType: "general" })).result;
    expect(routed.model.id).toBe(primary.id);
    expect(routed.fallbacks[0].id).toBe(fallback.id);
    await post({ action: "recordModelExecution", inputTokens: 1000, latencyMs: 275, modelId: primary.id, outputTokens: 500, qualityScore: 92, routingRuleId: rule.id, success: true, taskType: "general", traceId: routed.traceId });

    const tool = (await post({ action: "registerTool", enabled: true, handlerId: "task-brief", key: `e2e-tool-${randomUUID()}`, name: "E2E Governed Tool", riskLevel: "HIGH" })).result;
    toolId = tool.id;
    await post({ action: "setToolPermission", allowed: true, approvalRequired: true, role: "ADMIN", scopes: ["mission:write"], toolId: tool.id });
    const execution = (await post({ action: "requestToolExecution", payload: { title: "E2E governed execution" }, toolKey: tool.key })).result;
    expect(execution.status).toBe("PENDING_APPROVAL");
    await post({ action: "decideToolApproval", approve: true, executionId: execution.id, rationale: "E2E approval" });
    const completed = (await post({ action: "executeTool", executionId: execution.id })).result;
    expect(completed.status).toBe("SUCCEEDED");

    await page.goto("/models/router", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mission-engine-console")).toBeVisible();
    await expect(page.getByText("E2E General Rule", { exact: true }).first()).toBeVisible();
    await page.goto("/tools/executions", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".admin-ops-table td", { hasText: "E2E Governed Tool" }).first()).toBeVisible();
    await expect(page.locator(".admin-ops-table td", { hasText: "SUCCEEDED" }).first()).toBeVisible();
  });
});