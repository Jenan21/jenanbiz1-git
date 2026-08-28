export type FeasibilityInputs = {
  initialInvestment: number;
  monthlyFixedCosts: number;
  variableCostPerUnit: number;
  pricePerUnit: number;
  monthlyUnits: number;
  months: number;
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

export function calculateFeasibility(input: FeasibilityInputs): FeasibilityResult {
  for (const [field, value] of Object.entries(input)) assertFiniteNonNegative(value, field);
  if (input.months < 1 || !Number.isInteger(input.months)) throw new Error("months must be a positive integer");
  if (input.monthlyUnits < 1 || !Number.isInteger(input.monthlyUnits)) throw new Error("monthlyUnits must be a positive integer");
  if (input.pricePerUnit <= input.variableCostPerUnit) throw new Error("pricePerUnit must exceed variableCostPerUnit");

  const contributionPerUnit = input.pricePerUnit - input.variableCostPerUnit;
  const breakEvenUnits = Math.ceil(input.monthlyFixedCosts / contributionPerUnit);
  const monthlyRevenue = input.pricePerUnit * input.monthlyUnits;
  const monthlyVariableCosts = input.variableCostPerUnit * input.monthlyUnits;
  const monthlyProfit = monthlyRevenue - monthlyVariableCosts - input.monthlyFixedCosts;
  const totalProfit = monthlyProfit * input.months - input.initialInvestment;
  const roiPercent = input.initialInvestment === 0 ? (totalProfit > 0 ? Infinity : 0) : (totalProfit / input.initialInvestment) * 100;
  const paybackMonths = monthlyProfit > 0 ? input.initialInvestment / monthlyProfit : null;

  return { valid: true, breakEvenUnits, monthlyRevenue, monthlyVariableCosts, monthlyProfit, totalProfit, roiPercent, paybackMonths };
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
