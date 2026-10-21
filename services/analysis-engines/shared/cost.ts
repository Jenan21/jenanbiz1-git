import { z } from "zod";
import { compareText, roundTo } from "./canonical";
import { EngineError } from "./errors";

/**
 * Cost estimation shared by the engines. An estimate is computed from the request alone, before any data is read, so an
 * oversized request is refused up front. Units are an abstract, explainable measure of work (not seconds, not money); each
 * engine publishes its own unit weights and calibrates them against measured runs.
 */
export const COST_DECIMALS = 3;

export const costLineSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_.:]{1,79}$/, "Lower-case cost line key"), units: z.number().min(0).max(1_000_000) }).strict();
export type CostLine = z.infer<typeof costLineSchema>;

export function sumCostUnits(lines: readonly Pick<CostLine, "units">[]): number {
  return roundTo(lines.reduce((sum, line) => sum + line.units, 0), COST_DECIMALS);
}

export const costEstimateSchema = z.object({
  policyId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  policyVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  units: z.number().min(0).max(10_000_000),
  budgetUnits: z.number().positive().max(1_000_000),
  lines: z.array(costLineSchema).max(300),
}).strict().superRefine((estimate, context) => {
  if (sumCostUnits(estimate.lines) !== estimate.units) context.addIssue({ code: "custom", message: "units must equal the sum of the lines" });
  const keys = estimate.lines.map((line) => line.key);
  if (keys.join("|") !== [...new Set(keys)].sort(compareText).join("|")) context.addIssue({ code: "custom", message: "Lines must be unique and sorted by key" });
});
export type CostEstimate = z.infer<typeof costEstimateSchema>;

/** Merges lines with the same key, rounds each to a fixed precision, drops empty lines and orders by key. */
export function buildCostEstimate(policy: { id: string; version: string }, lines: readonly CostLine[], budgetUnits: number): CostEstimate {
  const merged = new Map<string, number>();
  for (const line of lines) merged.set(line.key, (merged.get(line.key) ?? 0) + line.units);
  const normalized = [...merged.entries()]
    .map(([key, units]) => ({ key, units: roundTo(units, COST_DECIMALS) }))
    .filter((line) => line.units > 0)
    .sort((first, second) => compareText(first.key, second.key));
  return { policyId: policy.id, policyVersion: policy.version, units: sumCostUnits(normalized), budgetUnits, lines: normalized };
}

/** Refuses a request whose estimate is above the budget. The budget is chosen by the server, never by the caller. */
export function assertWithinBudget(estimate: Pick<CostEstimate, "units" | "budgetUnits">): void {
  if (estimate.units > estimate.budgetUnits) throw new EngineError("REQUEST_TOO_LARGE", { units: estimate.units, budgetUnits: estimate.budgetUnits });
}
