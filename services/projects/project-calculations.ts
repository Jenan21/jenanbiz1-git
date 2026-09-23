export type FeasibilityInputs = {
  initialInvestment: number;
  monthlyFixedCosts: number;
  variableCostPerUnit: number;
  pricePerUnit: number;
  monthlyUnits: number;
  months: number;
  annualDiscountRate?: number;
  annualInflationRate?: number;
  taxRate?: number;
};

export type FeasibilityResult = {
  valid: true;
  breakEvenUnits: number;
  monthlyRevenue: number;
  monthlyVariableCosts: number;
  monthlyProfit: number;
  totalProfit: number;
  roiPercent: number;
  paybackMonths: number | null;
  netPresentValue: number;
  internalRateReturn: number | null;
};

export type Scenario = "PESSIMISTIC" | "EXPECTED" | "OPTIMISTIC";

const scenarioMultipliers: Record<Scenario, { demand: number; price: number; variableCost: number; fixedCost: number }> = {
  PESSIMISTIC: { demand: 0.75, price: 0.95, variableCost: 1.1, fixedCost: 1.1 },
  EXPECTED: { demand: 1, price: 1, variableCost: 1, fixedCost: 1 },
  OPTIMISTIC: { demand: 1.25, price: 1.05, variableCost: 0.95, fixedCost: 0.95 },
};

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
}

function calculateIrr(cashFlows: number[]) {
  if (cashFlows[0] === undefined || cashFlows.length < 2 || cashFlows[0] >= 0) return null;
  const netPresentValue = (rate: number) => cashFlows.reduce((total, cashFlow, index) => total + cashFlow / (1 + rate) ** index, 0);
  let lower = -0.99;
  let upper = 10;
  if (netPresentValue(lower) * netPresentValue(upper) > 0) return null;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (netPresentValue(middle) > 0) lower = middle;
    else upper = middle;
  }
  return ((1 + (lower + upper) / 2) ** 12 - 1) * 100;
}

export function calculateFeasibility(input: FeasibilityInputs): FeasibilityResult {
  for (const [field, value] of Object.entries(input)) assertFiniteNonNegative(value, field);
  if (input.months < 1 || !Number.isInteger(input.months)) throw new Error("months must be a positive integer");
  if (input.monthlyUnits < 1 || !Number.isInteger(input.monthlyUnits)) throw new Error("monthlyUnits must be a positive integer");
  if (input.pricePerUnit <= input.variableCostPerUnit) throw new Error("pricePerUnit must exceed variableCostPerUnit");

  const annualDiscountRate = input.annualDiscountRate ?? 0;
  const annualInflationRate = input.annualInflationRate ?? 0;
  const taxRate = input.taxRate ?? 0;
  if ([annualDiscountRate, annualInflationRate, taxRate].some((rate) => rate > 100)) {
    throw new Error("Financial rates must be between 0 and 100");
  }

  const contributionPerUnit = input.pricePerUnit - input.variableCostPerUnit;
  const breakEvenUnits = Math.ceil(input.monthlyFixedCosts / contributionPerUnit);
  const monthlyRevenue = input.pricePerUnit * input.monthlyUnits;
  const monthlyVariableCosts = input.variableCostPerUnit * input.monthlyUnits;
  const preTaxMonthlyProfit = monthlyRevenue - monthlyVariableCosts - input.monthlyFixedCosts;
  const monthlyProfit = preTaxMonthlyProfit - Math.max(preTaxMonthlyProfit, 0) * (taxRate / 100);
  const monthlyInflationRate = annualInflationRate / 1200;
  const monthlyDiscountRate = annualDiscountRate / 1200;
  const cashFlows = [-input.initialInvestment];
  for (let month = 1; month <= input.months; month += 1) {
    const multiplier = (1 + monthlyInflationRate) ** (month - 1);
    const revenue = monthlyRevenue * multiplier;
    const costs = (monthlyVariableCosts + input.monthlyFixedCosts) * multiplier;
    const preTaxProfit = revenue - costs;
    cashFlows.push(preTaxProfit - Math.max(preTaxProfit, 0) * (taxRate / 100));
  }
  const totalProfit = cashFlows.slice(1).reduce((total, cashFlow) => total + cashFlow, -input.initialInvestment);
  const roiPercent = input.initialInvestment === 0 ? (totalProfit > 0 ? Infinity : 0) : (totalProfit / input.initialInvestment) * 100;
  const paybackMonths = monthlyProfit > 0 ? input.initialInvestment / monthlyProfit : null;
  const netPresentValue = cashFlows.reduce((total, cashFlow, index) => total + cashFlow / (1 + monthlyDiscountRate) ** index, 0);
  const internalRateReturn = calculateIrr(cashFlows);

  return { valid: true, breakEvenUnits, monthlyRevenue, monthlyVariableCosts, monthlyProfit, totalProfit, roiPercent, paybackMonths, netPresentValue, internalRateReturn };
}

export function calculateScenarios(input: FeasibilityInputs) {
  return (Object.keys(scenarioMultipliers) as Scenario[]).map((scenario) => {
    const multiplier = scenarioMultipliers[scenario];
    const result = calculateFeasibility({
      ...input,
      monthlyUnits: Math.max(1, Math.round(input.monthlyUnits * multiplier.demand)),
      pricePerUnit: input.pricePerUnit * multiplier.price,
      variableCostPerUnit: input.variableCostPerUnit * multiplier.variableCost,
      monthlyFixedCosts: input.monthlyFixedCosts * multiplier.fixedCost,
    });
    return { scenario, ...result };
  });
}

export function calculateRiskScore(input: { market: number; financial: number; operational: number; technical: number; compliance: number }) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error("Risk factors must be integers from 0 to 100");
  const score = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return { score, level: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW" } as const;
}
