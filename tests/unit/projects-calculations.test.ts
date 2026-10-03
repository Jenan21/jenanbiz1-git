import { describe, expect, it } from "vitest";
import { calculateFeasibility, calculateRiskScore, calculateScenarios, calculateSensitivity, MAX_FEASIBILITY_MONTHS } from "@/services/projects/project-calculations";

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
    expect(result.netPresentValue).toBe(20000);
    expect(result.internalRateReturn).not.toBeNull();
  });

  it("returns all controlled scenarios without inventing source data", () => {
    const results = calculateScenarios(inputs);
    expect(results.map((item) => item.scenario)).toEqual(["PESSIMISTIC", "EXPECTED", "OPTIMISTIC"]);
    expect(results[0]?.monthlyProfit).toBeLessThan(results[1]?.monthlyProfit ?? 0);
    expect(results[2]?.monthlyProfit).toBeGreaterThan(results[1]?.monthlyProfit ?? 0);
  });

  it("reports unprofitable inputs honestly and computes risk transparently", () => {
    const loss = calculateFeasibility({ ...inputs, pricePerUnit: 10 });
    expect(loss.breakEvenUnits).toBeNull();
    expect(loss.paybackMonths).toBeNull();
    expect(loss.internalRateReturn).toBeNull();
    expect(loss.monthlyProfit).toBe(-2000);
    expect(calculateRiskScore({ market: 20, financial: 40, operational: 30, technical: 10, compliance: 50 })).toEqual({ score: 30, level: "LOW" });
  });

  it("accounts for tax, inflation, and discounting when they are explicitly supplied", () => {
    const result = calculateFeasibility({ ...inputs, taxRate: 15, annualInflationRate: 2, annualDiscountRate: 10 });
    expect(result.monthlyProfit).toBe(2125);
    expect(result.netPresentValue).toBeLessThan(20000);
    expect(result.internalRateReturn).not.toBeNull();
  });

  it("converts effective annual rates and reconciles every monthly cash flow", () => {
    const result = calculateFeasibility({ ...inputs, annualDiscountRate: 12, annualInflationRate: 12, taxRate: 20 });
    expect(result.cashFlows).toHaveLength(13);
    expect(result.cashFlows[0]?.netCashFlow).toBe(-inputs.initialInvestment);
    expect(result.cashFlows[12]?.discountedCashFlow).toBeCloseTo(result.cashFlows[12]!.netCashFlow / 1.12, 8);
    expect(result.cashFlows[12]?.revenue).toBeCloseTo(7500 * 1.12 ** (11 / 12), 8);
    expect(result.cashFlows.reduce((sum, row) => sum + row.netCashFlow, 0)).toBeCloseTo(result.totalProfit, 8);
    expect(result.cashFlows.reduce((sum, row) => sum + row.discountedCashFlow, 0)).toBeCloseTo(result.netPresentValue, 8);
  });

  it("returns undefined ROI as null rather than Infinity when investment is zero", () => {
    const result = calculateFeasibility({ ...inputs, initialInvestment: 0 });
    expect(result.roiPercent).toBeNull();
    expect(result.internalRateReturn).toBeNull();
    expect(result.paybackMonths).toBe(0);
    expect(JSON.parse(JSON.stringify(result)).roiPercent).toBeNull();
  });

  it("bounds payback to the modeled horizon and interpolates inflated cash flows", () => {
    expect(calculateFeasibility({ ...inputs, months: 3 }).paybackMonths).toBeNull();
    const result = calculateFeasibility({ ...inputs, annualInflationRate: 12, annualDiscountRate: 12 });
    expect(result.paybackMonths).toBeLessThan(4);
    expect(result.discountedPaybackMonths).toBeGreaterThan(result.paybackMonths!);
  });

  it.each([0, -1, 1.5, MAX_FEASIBILITY_MONTHS + 1, 1e12, NaN, Infinity])("rejects an invalid or unbounded horizon %s", (months) => {
    expect(() => calculateFeasibility({ ...inputs, months })).toThrow("months");
  });

  it("rejects missing required values and invalid rates at the service boundary", () => {
    expect(() => calculateFeasibility({ ...inputs, pricePerUnit: undefined } as never)).toThrow("pricePerUnit");
    expect(() => calculateFeasibility({ ...inputs, taxRate: NaN })).toThrow("rates");
  });

  it("calculates one-factor sensitivity and supports stress scenarios with negative margins", () => {
    const sensitivity = calculateSensitivity(inputs);
    expect(sensitivity).toHaveLength(8);
    expect(sensitivity.find((item) => item.driver === "pricePerUnit" && item.changePercent === -10)!.npvDelta).toBeLessThan(0);
    expect(sensitivity.find((item) => item.driver === "monthlyFixedCosts" && item.changePercent === 10)!.npvDelta).toBeLessThan(0);
    const scenarios = calculateScenarios({ ...inputs, pricePerUnit: 11 });
    expect(scenarios[0]?.breakEvenUnits).toBeNull();
    expect(scenarios[0]?.inputs.pricePerUnit).toBeCloseTo(10.45);
    expect(scenarios[0]?.monthlyProfit).toBeLessThan(0);
  });
});
