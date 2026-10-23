import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { riskPolicySchema } from "./policy";
import { ensureRiskJsonSize, riskRunPinSchema } from "./snapshots";
import { riskApprovalSchema, riskBasisSchema, riskEngineKeys, riskScopeSchema, riskTimestampSchema } from "./semantics";

export const riskBounds = {
  engineSlots: 6, scenarios: 4, runs: 24, claims: 1000, rules: 200, conditions: 200,
  edges: 500, findings: 500, actions: 500, lineage: 128, workUnits: 20_000,
  nativeBytes: 8 * 1024 * 1024, resultBytes: 2 * 1024 * 1024,
} as const;
const pointerSchema = z.string().min(1).max(500).regex(/^(\/(?:[^~/]|~[01])*)+$/, "A bounded RFC 6901 pointer without invalid escapes is required")
  .refine((v) => v.split("/").length <= 16 && !v.split("/").some((p) => ["__proto__", "constructor", "prototype"].includes(p)), "Unsafe or over-deep selector");
const slotSchema = z.discriminatedUnion("state", [
  z.object({ engineKey: z.enum(riskEngineKeys), state: z.literal("PINNED"), runs: z.array(riskRunPinSchema).min(1).max(4) }).strict(),
  z.object({ engineKey: z.enum(riskEngineKeys), state: z.literal("MISSING"), reason: identifierSchema }).strict(),
  z.object({ engineKey: z.enum(riskEngineKeys), state: z.literal("NOT_APPLICABLE"), approval: riskApprovalSchema }).strict(),
]);
export const riskClaimSelectorSchema = z.object({
  id: identifierSchema, runId: identifierSchema, pointer: pointerSchema,
  nativeKey: identifierSchema, scope: riskScopeSchema, basis: riskBasisSchema,
  variant: identifierSchema, entityId: identifierSchema,
}).strict();
export const riskRequestSchema = z.object({
  contract: z.literal("jenan.risk-decision.request/v1"), scope: riskScopeSchema,
  policySource: z.object({ inputId: identifierSchema, sourceId: identifierSchema, versionId: identifierSchema, checksum: sha256Schema }).strict(),
  policy: riskPolicySchema, engineSlots: z.array(slotSchema).length(6),
  claims: z.array(riskClaimSelectorSchema).max(1000),
  scenarios: z.array(z.object({
    id: identifierSchema, approval: riskApprovalSchema,
    mappings: z.array(z.object({ engineKey: z.enum(riskEngineKeys), runId: identifierSchema, variant: identifierSchema, assumptionIds: z.array(identifierSchema).max(200) }).strict()).max(6),
  }).strict()).max(4),
}).strict().superRefine((v, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(v.engineSlots.map((s) => s.engineKey)).size !== 6) fail("Exactly one slot for each of the six engines is mandatory");
  const runs = v.engineSlots.flatMap((s) => s.state === "PINNED" ? s.runs : []);
  if (runs.length > riskBounds.runs || new Set(runs.map((r) => r.runId)).size !== runs.length) fail("Distinct exact run pins required within the 24-run bound");
  if (v.engineSlots.some((s) => s.state === "PINNED" && s.runs.some((r) => r.engineKey !== s.engineKey))) fail("Run must belong to its engine slot");
  const claimIds = new Set(v.claims.map((c) => c.id));
  if (claimIds.size !== v.claims.length) fail("Unique claim IDs required");
  if (new Set(v.claims.map((c) => canonicalize([c.runId, c.pointer]))).size !== v.claims.length) fail("Duplicate native claim identity cannot inflate evidence");
  if (v.claims.some((c) => !runs.some((r) => r.runId === c.runId))) fail("Claim references an unpinned run");
  if (v.policy.rules.some((r) => "claimId" in r && !claimIds.has(r.claimId))) fail("Unresolved rule claim");
  if (new Set(v.scenarios.map((s) => s.id)).size !== v.scenarios.length) fail("Unique comparison scenario IDs required");
  for (const scenario of v.scenarios) {
    if (new Set(scenario.mappings.map((m) => m.engineKey)).size !== scenario.mappings.length) fail("One exact mapping per scenario engine");
    for (const slot of v.engineSlots.filter((s) => s.state !== "NOT_APPLICABLE")) {
      if (!scenario.mappings.some((m) => m.engineKey === slot.engineKey)) fail("Scenario mapping must cover each applicable engine role explicitly");
    }
    if (scenario.mappings.some((m) => !runs.some((r) => r.runId === m.runId && r.engineKey === m.engineKey) || new Set(m.assumptionIds).size !== m.assumptionIds.length)) fail("Scenario refers to unpinned run or duplicate assumptions");
  }
});
export type RiskRequest = z.infer<typeof riskRequestSchema>;
export function riskRequestWork(request: RiskRequest): number {
  const rules = new Map(request.policy.rules.map((rule) => [rule.id, rule]));
  const costs = new Map<string, number>();
  const ruleCost = (id: string): number => {
    const cached = costs.get(id); if (cached !== undefined) return cached;
    const rule = rules.get(id); if (!rule) throw new RangeError("Unresolved Risk rule");
    const cost = "ruleIds" in rule ? 1 + rule.ruleIds.reduce((total, child) => {
      const next = total + ruleCost(child);
      if (next > riskBounds.workUnits) throw new RangeError("Risk expanded rule work exceeds 20000 units");
      return next;
    }, 0) : 1;
    costs.set(id, cost); return cost;
  };
  const work = request.claims.length + request.engineSlots.reduce((n, s) => n + (s.state === "PINNED" ? s.runs.length : 0), 0) +
    (1 + request.scenarios.length) * request.policy.conditions.reduce((n, c) => n + ruleCost(c.ruleId), 0) +
    request.policy.dependencyEdges.length + request.policy.actions.length;
  if (work > riskBounds.workUnits) throw new RangeError("Risk interpretation work exceeds 20000 units");
  return work;
}
export function normalizeRiskRequest(raw: unknown, rawEvaluatedAt: string) {
  ensureRiskJsonSize(raw);
  const evaluatedAt = riskTimestampSchema.parse(rawEvaluatedAt); const request = riskRequestSchema.parse(raw);
  if (request.policy.approval.approvedAt > evaluatedAt || evaluatedAt < request.policy.validity.start || evaluatedAt >= request.policy.validity.end) throw new RangeError("Risk policy must be approved and in force at evaluation");
  const approvals = [request.policy.approval, ...request.engineSlots.flatMap((s) => s.state === "NOT_APPLICABLE" ? [s.approval] : []),
    ...request.scenarios.map((s) => s.approval), ...request.policy.conditions.flatMap((c) => c.applicability.state === "NOT_APPLICABLE" ? [c.applicability.approval] : []),
    ...(request.policy.severityMatrix ? [request.policy.severityMatrix.approval] : [])];
  if (approvals.some((a) => a.approvedAt > evaluatedAt)) throw new RangeError("Risk approval is in the future");
  const runs = request.engineSlots.flatMap((s) => s.state === "PINNED" ? s.runs : []);
  if (runs.some((r) => r.evaluatedAt > evaluatedAt)) throw new RangeError("Upstream evaluation is in the future");
  const sort = <T extends { id: string }>(entries: T[]) => entries.sort((a, b) => compareText(a.id, b.id));
  request.engineSlots.sort((a, b) => compareText(a.engineKey, b.engineKey));
  for (const slot of request.engineSlots) if (slot.state === "PINNED") slot.runs.sort((a, b) => compareText(a.runId, b.runId));
  sort(request.claims); sort(request.scenarios); sort(request.policy.rules); sort(request.policy.conditions); sort(request.policy.actions);
  for (const rule of request.policy.rules) {
    if ("ruleIds" in rule) rule.ruleIds.sort(compareText);
    if ("operands" in rule) rule.operands.sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  }
  for (const scenario of request.scenarios) {
    scenario.mappings.sort((a, b) => compareText(a.engineKey, b.engineKey));
    scenario.mappings.forEach((m) => m.assumptionIds.sort(compareText));
  }
  request.policy.actions.forEach((a) => a.conditionIds.sort(compareText));
  request.policy.dependencyEdges.sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  request.policy.confidenceMappings.sort((a, b) => compareText(canonicalize(a.native), canonicalize(b.native)));
  request.policy.confidenceMappings.forEach((m) => m.bands.sort((a, b) => compareText(a.from, b.from)));
  for (const approval of approvals) approval.evidence.sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  for (const edge of request.policy.dependencyEdges) edge.evidence.sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
  if (request.policy.severityMatrix) {
    request.policy.severityMatrix.impactBands.sort(compareText); request.policy.severityMatrix.likelihoodBands.sort(compareText);
    request.policy.severityMatrix.cells.sort((a, b) => compareText(canonicalize([a.impact, a.likelihood]), canonicalize([b.impact, b.likelihood])));
  }
  const workUnits = riskRequestWork(request);
  return { normalized: request, evaluatedAt, workUnits, requestHash: canonicalHash({ normalized: request, evaluatedAt }) };
}
