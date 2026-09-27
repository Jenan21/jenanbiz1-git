import { randomUUID } from "node:crypto";

import { ModelRegistryStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

function stringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function estimatedCostMinor(model: { inputCostPerMillionMinor: number; outputCostPerMillionMinor: number }, inputTokens: number, outputTokens: number) {
  return Math.ceil((inputTokens * model.inputCostPerMillionMinor + outputTokens * model.outputCostPerMillionMinor) / 1_000_000);
}

export async function registerModel(input: { averageLatencyMs?: number; capabilities?: string[]; contextWindow?: number; currency?: string; displayName: string; enabled?: boolean; inputCostPerMillionMinor?: number; modelKey: string; outputCostPerMillionMinor?: number; provider: string; qualityScore?: number; status?: ModelRegistryStatus }) {
  return db.modelRegistryEntry.upsert({
    where: { provider_modelKey: { provider: input.provider, modelKey: input.modelKey } },
    create: { ...input, capabilities: input.capabilities, enabled: input.enabled ?? false, status: input.status ?? ModelRegistryStatus.DISABLED },
    update: { ...input, capabilities: input.capabilities },
  });
}

export async function setModelRoutingRule(input: { enabled?: boolean; maximumCostMinor?: number; maximumLatencyMs?: number; minimumQuality?: number; modelId: string; name: string; priority?: number; requiredCapabilities?: string[]; taskType: string }) {
  return db.modelRoutingRule.create({ data: { ...input, requiredCapabilities: input.requiredCapabilities } });
}

export async function setModelFallback(input: { condition?: Prisma.InputJsonValue; fallbackModelId: string; primaryModelId: string; priority?: number }) {
  if (input.primaryModelId === input.fallbackModelId) throw new Error("Fallback model must differ from primary model");
  return db.modelFallbackLink.upsert({ where: { primaryModelId_fallbackModelId: { primaryModelId: input.primaryModelId, fallbackModelId: input.fallbackModelId } }, create: input, update: { ...input, enabled: true } });
}

export async function routeModel(input: { estimatedInputTokens?: number; estimatedOutputTokens?: number; requiredCapabilities?: string[]; taskType: string }) {
  const inputTokens = input.estimatedInputTokens ?? 0;
  const outputTokens = input.estimatedOutputTokens ?? 0;
  const rules = await db.modelRoutingRule.findMany({ where: { enabled: true, taskType: input.taskType, model: { enabled: true, status: { in: [ModelRegistryStatus.ACTIVE, ModelRegistryStatus.DEGRADED] } } }, include: { model: true }, orderBy: { priority: "desc" } });
  const eligible = rules.map((rule) => ({ rule, costMinor: estimatedCostMinor(rule.model, inputTokens, outputTokens) })).filter(({ rule, costMinor }) => {
    const capabilities = new Set(stringArray(rule.model.capabilities));
    const required = [...(input.requiredCapabilities ?? []), ...stringArray(rule.requiredCapabilities)];
    return rule.model.qualityScore >= rule.minimumQuality && (rule.maximumLatencyMs === null || rule.model.averageLatencyMs <= rule.maximumLatencyMs) && (rule.maximumCostMinor === null || costMinor <= rule.maximumCostMinor) && required.every((item) => capabilities.has(item));
  }).sort((left, right) => right.rule.priority - left.rule.priority || right.rule.model.qualityScore - left.rule.model.qualityScore || left.costMinor - right.costMinor || left.rule.model.averageLatencyMs - right.rule.model.averageLatencyMs);
  const selected = eligible[0];
  if (!selected) throw new Error("No eligible model routing rule");
  const fallbacks = await db.modelFallbackLink.findMany({ where: { primaryModelId: selected.rule.modelId, enabled: true, fallbackModel: { enabled: true, status: { in: [ModelRegistryStatus.ACTIVE, ModelRegistryStatus.DEGRADED] } } }, include: { fallbackModel: true }, orderBy: { priority: "asc" } });
  return { traceId: randomUUID(), model: selected.rule.model, rule: selected.rule, estimatedCostMinor: selected.costMinor, fallbacks: fallbacks.map((item) => item.fallbackModel) };
}

export async function recordRoutedModelExecution(input: { costMinor?: number; error?: string; fallbackFromId?: string; inputTokens?: number; latencyMs: number; modelId: string; outputTokens?: number; qualityScore?: number; robotId?: string; routingRuleId: string; success: boolean; taskType: string; traceId: string }) {
  const model = await db.modelRegistryEntry.findUnique({ where: { id: input.modelId } });
  if (!model) throw new Error("Registered model not found");
  const execution = await db.modelExecution.create({ data: { costMinor: input.costMinor ?? estimatedCostMinor(model, input.inputTokens ?? 0, input.outputTokens ?? 0), error: input.error, fallbackFromId: input.fallbackFromId, inputTokens: input.inputTokens ?? 0, latencyMs: input.latencyMs, model: model.modelKey, outputTokens: input.outputTokens ?? 0, provider: model.provider, qualityScore: input.qualityScore, registryModelId: model.id, robotId: input.robotId, routingRuleId: input.routingRuleId, success: input.success, taskType: input.taskType, traceId: input.traceId } });
  await db.modelRegistryEntry.update({ where: { id: model.id }, data: { averageLatencyMs: Math.round((model.averageLatencyMs + input.latencyMs) / 2), status: input.success ? model.status : ModelRegistryStatus.DEGRADED } });
  return execution;
}