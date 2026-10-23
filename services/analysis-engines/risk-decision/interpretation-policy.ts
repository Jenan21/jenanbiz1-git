import { z } from "zod";
import { identifierSchema, shortTextSchema } from "../shared/primitives";
import { riskCategories, riskImpactSchema, riskLikelihoodSchema, riskMethodSchema } from "./semantics";
import { riskRequestSchema } from "./request";

export const riskInterpretationPolicySchema = z.object({
  contract: z.literal("jenan.risk-decision.interpretation-policy/v1"),
  method: riskMethodSchema,
  engineSlots: riskRequestSchema.shape.engineSlots,
  declaredScenarios: riskRequestSchema.shape.scenarios,
  projections: z.array(z.object({
    claimId: identifierSchema,
    value: z.enum(["value", "exactValue"]),
    kind: z.enum(["DECIMAL", "TEXT", "BOOLEAN"]),
    estimated: z.enum(["UNKNOWN", "ALLOW_CONDITIONAL"]),
    rationale: shortTextSchema,
  }).strict()).max(1000),
  findings: z.array(z.object({
    id: identifierSchema, conditionId: identifierSchema, category: z.enum(riskCategories),
    rationale: shortTextSchema,
    impact: riskImpactSchema.nullable(), likelihood: riskLikelihoodSchema.nullable(),
  }).strict()).max(500),
  conflicts: z.array(z.object({
    id: identifierSchema, leftClaimId: identifierSchema, rightClaimId: identifierSchema,
    measureId: identifierSchema, relation: z.literal("MUST_EQUAL"),
    conditionIds: z.array(identifierSchema).min(1).max(200), rationale: shortTextSchema,
  }).strict()).max(500),
  scenarios: z.array(z.object({
    scenarioId: identifierSchema,
    claims: z.array(z.object({
      baseClaimId: identifierSchema, claimId: identifierSchema,
      invariantRationale: shortTextSchema.nullable(),
    }).strict()).max(1000),
  }).strict()).max(4),
}).strict().superRefine((value, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  for (const entries of [value.findings, value.conflicts]) {
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) fail("Unique interpretation IDs required");
  }
  if (new Set(value.projections.map((entry) => entry.claimId)).size !== value.projections.length) fail("Duplicate native projection");
  if (new Set(value.scenarios.map((entry) => entry.scenarioId)).size !== value.scenarios.length) fail("Duplicate scenario interpretation");
  for (const conflict of value.conflicts) {
    if (conflict.leftClaimId === conflict.rightClaimId || new Set(conflict.conditionIds).size !== conflict.conditionIds.length) fail("Distinct conflict claims and conditions required");
  }
  for (const scenario of value.scenarios) {
    if (new Set(scenario.claims.map((entry) => entry.baseClaimId)).size !== scenario.claims.length) fail("Duplicate scenario claim mapping");
    if (scenario.claims.some((entry) => entry.baseClaimId === entry.claimId && entry.invariantRationale === null)) fail("Invariant reuse requires an explicit rationale");
  }
});
export type RiskInterpretationPolicy = z.infer<typeof riskInterpretationPolicySchema>;
