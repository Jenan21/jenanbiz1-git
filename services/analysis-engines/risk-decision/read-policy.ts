import { z } from "zod";
import { canonicalize } from "../shared/canonical";
import { identifierSchema } from "../shared/primitives";
import { riskPolicySchema } from "./policy";
import { riskScopeSchema } from "./semantics";
import { ensureRiskJsonSize, riskRunPinSchema } from "./snapshots";
import type { RunRecord } from "../shared/run-record";
import { riskClaimSelectorSchema } from "./request";
import { riskInterpretationPolicySchema } from "./interpretation-policy";

export const riskCompatibilityDimensions = ["project", "site", "geography", "sector", "time", "scenario", "currency", "unit", "method"] as const;
const pointer = z.string().min(1).max(500).regex(/^(\/(?:[^~/]|~[01])*)+$/)
  .refine((value) => value.split("/").length <= 16 && !value.split("/").some((part) =>
    ["__proto__", "constructor", "prototype"].includes(part.replace(/~1/g, "/").replace(/~0/g, "~"))));
const dimension = z.enum(riskCompatibilityDimensions);
const checkSchema = z.discriminatedUnion("state", [
  z.object({ dimension, state: z.literal("EXACT"), pointer, expected: z.json(), rationale: z.string().min(1).max(500) }).strict(),
  z.object({ dimension, state: z.literal("NOT_APPLICABLE"), rationale: z.string().min(1).max(500) }).strict(),
]);
/**
 * A governed, approved mapping to native coordinates, not a caller assertion of compatibility.
 * Missing native dimensions require explicit, reviewed non-applicability; nothing is inferred.
 */
export const riskReadPolicySchema = z.object({
  contract: z.literal("jenan.risk-decision.read-policy/v1"),
  policy: riskPolicySchema, scope: riskScopeSchema,
  interpretation: riskInterpretationPolicySchema.optional(),
  runs: z.array(z.object({
    pin: riskRunPinSchema,
    checks: z.array(checkSchema).length(riskCompatibilityDimensions.length),
    selections: z.array(riskClaimSelectorSchema.extend({
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
      method: z.object({ pointer: pointer.refine((value) => value.endsWith("/method"), "An explicit native method field is required"),
        expected: z.union([z.string().min(1).max(2000), z.object({ id: identifierSchema, version: identifierSchema }).strict()]) }).strict(),
    }).strict()).max(1000),
  }).strict()).max(24),
}).strict().superRefine((value, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (new Set(value.runs.map((run) => run.pin.runId)).size !== value.runs.length) fail("Duplicate exact run binding");
  if (value.runs.reduce((total, run) => total + run.selections.length, 0) > 1000) fail("At most 1000 retained selections");
  for (const run of value.runs) {
    if (new Set(run.checks.map((check) => check.dimension)).size !== riskCompatibilityDimensions.length) fail("All compatibility dimensions require one explicit mapping");
    if (run.checks.some((check) => ["unit", "method"].includes(check.dimension) && check.state !== "EXACT")) fail("Native units and methodology cannot be waived");
    if (new Set(run.selections.map((selection) => selection.id)).size !== run.selections.length ||
      new Set(run.selections.map((selection) => selection.pointer)).size !== run.selections.length) fail("Duplicate selected evidence identity");
    for (const selection of run.selections) {
      if (selection.runId !== run.pin.runId) fail("Selected evidence must belong to its exact pinned run");
      if (!selection.method.pointer.startsWith(`${selection.pointer}/`)) fail("Method must belong to the selected native evidence");
    }
  }
});
export type RiskReadPolicy = z.infer<typeof riskReadPolicySchema>;
export function readRiskPointer(value: unknown, pointer: string): { found: boolean; value: unknown } {
  for (const part of pointer.split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (["__proto__", "constructor", "prototype"].includes(part) || value === null || typeof value !== "object" ||
      !Object.hasOwn(value, part)) return { found: false, value: null };
    value = Reflect.get(value, part);
  }
  return { found: true, value };
}
export function parseRiskReadPolicy(raw: unknown): RiskReadPolicy {
  ensureRiskJsonSize(raw);
  return riskReadPolicySchema.parse(raw);
}
export function riskReadCompatibility(record: Pick<RunRecord, "subject" | "result">, binding: RiskReadPolicy["runs"][number], scope: RiskReadPolicy["scope"]) {
  if (record.subject !== scope.subject) return false;
  return binding.checks.every((check) => {
    if (check.state === "NOT_APPLICABLE") return true;
    const read = readRiskPointer(record.result, check.pointer);
    return read.found && canonicalize(read.value) === canonicalize(check.expected);
  });
}
export function riskNativeCoordinatesMatch(native: Record<string, unknown>, selection: RiskReadPolicy["runs"][number]["selections"][number]) {
  const unit = typeof native.unit === "string" ? native.unit : null;
  const structuredUnit = z.looseObject({ kind: z.string(), currency: z.string().optional() }).safeParse(native.unit);
  if ((unit ?? (structuredUnit.success ? structuredUnit.data.kind : null)) !== selection.basis.unit) return false;
  if (selection.basis.unit === "MONEY") {
    const basis = z.looseObject({ priceBasis: z.string(), cashFlowBasis: z.string() }).safeParse(native.basis);
    if (!structuredUnit.success || structuredUnit.data.currency !== selection.basis.currency || !basis.success ||
      basis.data.priceBasis !== selection.basis.priceBasis || basis.data.cashFlowBasis !== selection.basis.cashFlowBasis) return false;
  }
  const method = z.object({ id: z.string(), version: z.string() }).safeParse(native.method);
  if (method.success && canonicalize(method.data) !== canonicalize(selection.basis.methodology)) return false;
  return (native.siteId === undefined || native.siteId === selection.scope.siteId) &&
    (native.variant === undefined || native.variant === selection.variant) &&
    (native.entityId === undefined || native.entityId === selection.entityId);
}
