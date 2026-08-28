import { describe, expect, it } from "vitest";
import { calculateFeasibility, calculateRiskScore, calculateScenarios } from "@/services/projects/project-calculations";

describe("project calculations", () => {
  const inputs = {
    initialInvestment: 10000,
    monthlyFixedCosts: 2000,
    variableCostPerUnit: 10,
    pricePerUnit: 25,
    monthlyUnits: 300,
    months: 12,
  };

  it("calculates break-even, profit, ROI, and payback deterministically", () => {
    const result = calculateFeasibility(inputs);
    expect(result.breakEvenUnits).toBe(134);
    expect(result.monthlyProfit).toBe(2500);
    expect(result.totalProfit).toBe(20000);
    expect(result.roiPercent).toBe(200);
    expect(result.paybackMonths).toBe(4);
  });

  it("returns all controlled scenarios without inventing source data", () => {
    const results = calculateScenarios(inputs);
    expect(results.map((item) => item.scenario)).toEqual(["PESSIMISTIC", "EXPECTED", "OPTIMISTIC"]);
    expect(results[0]?.monthlyProfit).toBeLessThan(results[1]?.monthlyProfit ?? 0);
    expect(results[2]?.monthlyProfit).toBeGreaterThan(results[1]?.monthlyProfit ?? 0);
  });

  it("validates impossible financial inputs and computes risk transparently", () => {
    expect(() => calculateFeasibility({ ...inputs, pricePerUnit: 10 })).toThrow("pricePerUnit");
    expect(calculateRiskScore({ market: 20, financial: 40, operational: 30, technical: 10, compliance: 50 })).toEqual({ score: 30, level: "LOW" });
  });
});
