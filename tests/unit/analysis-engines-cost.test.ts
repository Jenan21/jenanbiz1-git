import { describe, expect, it } from "vitest";
import { assertWithinBudget, buildCostEstimate, costEstimateSchema, EngineError, sumCostUnits } from "@/services/analysis-engines/shared";

const policy = { id: "test-cost-v1", version: "1.0.0" };

describe("cost estimate", () => {
  it("merges lines with the same key, rounds them, drops empty lines and sorts by key", () => {
    const estimate = buildCostEstimate(policy, [
      { key: "proximity.poi", units: 0.5 }, { key: "catchment.radius", units: 1 }, { key: "proximity.poi", units: 0.25 }, { key: "empty", units: 0 }, { key: "density.grid", units: 4.12345 },
    ], 1000);
    expect(estimate).toEqual({
      policyId: "test-cost-v1", policyVersion: "1.0.0", units: 5.873, budgetUnits: 1000,
      lines: [{ key: "catchment.radius", units: 1 }, { key: "density.grid", units: 4.123 }, { key: "proximity.poi", units: 0.75 }],
    });
    expect(costEstimateSchema.parse(estimate)).toEqual(estimate);
  });

  it("does not drift when fractional units are added", () => {
    expect(sumCostUnits([{ units: 0.1 }, { units: 0.2 }])).toBe(0.3);
    expect(buildCostEstimate(policy, Array.from({ length: 10 }, () => ({ key: "k", units: 0.1 })), 10).units).toBe(1);
    expect(buildCostEstimate(policy, Array.from({ length: 7 }, (_, index) => ({ key: `k${index}`, units: 0.1 })), 10).units).toBe(0.7);
  });

  it("is independent of the order of the lines", () => {
    const lines = [{ key: "b", units: 2 }, { key: "a", units: 1 }, { key: "c", units: 0.5 }];
    expect(buildCostEstimate(policy, [...lines].reverse(), 100)).toEqual(buildCostEstimate(policy, lines, 100));
  });

  it("is a valid estimate with no lines", () => {
    expect(buildCostEstimate(policy, [], 100)).toMatchObject({ units: 0, lines: [] });
  });

  it("rejects an estimate whose units are not the sum of its lines or whose lines are unsorted", () => {
    const estimate = buildCostEstimate(policy, [{ key: "a", units: 1 }, { key: "b", units: 2 }], 100);
    expect(costEstimateSchema.safeParse({ ...estimate, units: 4 }).success).toBe(false);
    expect(costEstimateSchema.safeParse({ ...estimate, lines: [...estimate.lines].reverse() }).success).toBe(false);
    expect(costEstimateSchema.safeParse({ ...estimate, budgetUnits: 0 }).success).toBe(false);
    expect(costEstimateSchema.safeParse({ ...estimate, lines: [{ key: "A", units: 1 }], units: 1 }).success).toBe(false);
  });
});

describe("budget", () => {
  it("allows an estimate up to and including the budget", () => {
    expect(() => assertWithinBudget({ units: 1000, budgetUnits: 1000 })).not.toThrow();
    expect(() => assertWithinBudget({ units: 0, budgetUnits: 1 })).not.toThrow();
  });

  it("refuses an estimate above the budget with a 422 that carries both numbers", () => {
    try { assertWithinBudget({ units: 1000.001, budgetUnits: 1000 }); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect(error).toMatchObject({ code: "REQUEST_TOO_LARGE", status: 422, details: { units: 1000.001, budgetUnits: 1000 } });
    }
  });
});
