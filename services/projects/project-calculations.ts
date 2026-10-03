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
  modelVersion: "JENAN_FINANCE_V2";
  breakEvenUnits: number | null;
  monthlyRevenue: number;
  monthlyVariableCosts: number;
  monthlyProfit: number;
  totalProfit: number;
  roiPercent: number | null;
  paybackMonths: number | null;
  netPresentValue: number;
  internalRateReturn: number | null;
  discountedPaybackMonths: number | null;
  contributionPerUnit: number;
  marginOfSafetyPercent: number | null;
  cashFlows: Array<{ month: number; revenue: number; costs: number; tax: number; netCashFlow: number; discountedCashFlow: number; cumulativeCashFlow: number }>;
  assumptions: string[];
};

export type Scenario = "PESSIMISTIC" | "EXPECTED" | "OPTIMISTIC";
export const MAX_FEASIBILITY_MONTHS = 600;
export const MAX_FINANCIAL_AMOUNT = 1_000_000_000_000;
export const MAX_MONTHLY_UNITS = 1_000_000_000;

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
  const nonzero = cashFlows.filter((value) => value !== 0);
  const signChanges = nonzero.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(nonzero[index]!)).length;
  if (signChanges !== 1) return null;
  const netPresentValue = (rate: number) => {
    let value = cashFlows.at(-1)!;
    for (let index = cashFlows.length - 2; index >= 0; index--) value = value / (1 + rate) + cashFlows[index]!;
    return value;
  };
  let lower = -0.999999;
  let upper = 1;
  while (netPresentValue(upper) > 0 && upper < 1_000_000) upper *= 2;
  if (netPresentValue(lower) < 0 || netPresentValue(upper) > 0) return null;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (netPresentValue(middle) > 0) lower = middle;
    else upper = middle;
  }
  const annualized = ((1 + (lower + upper) / 2) ** 12 - 1) * 100;
  return Number.isFinite(annualized) ? annualized : null;
}

export function calculateFeasibility(input: FeasibilityInputs): FeasibilityResult {
  for (const field of ["initialInvestment", "monthlyFixedCosts", "variableCostPerUnit", "pricePerUnit", "monthlyUnits", "months"] as const) assertFiniteNonNegative(input[field], field);
  if (input.months < 1 || !Number.isInteger(input.months) || input.months > MAX_FEASIBILITY_MONTHS) throw new Error(`months must be an integer from 1 to ${MAX_FEASIBILITY_MONTHS}`);
  if (input.monthlyUnits < 1 || !Number.isInteger(input.monthlyUnits) || input.monthlyUnits > MAX_MONTHLY_UNITS) throw new Error(`monthlyUnits must be an integer from 1 to ${MAX_MONTHLY_UNITS}`);
  if ([input.initialInvestment, input.monthlyFixedCosts, input.variableCostPerUnit, input.pricePerUnit].some((value) => value > MAX_FINANCIAL_AMOUNT)) throw new Error("Financial amounts exceed the supported model range");

  const annualDiscountRate = input.annualDiscountRate ?? 0;
  const annualInflationRate = input.annualInflationRate ?? 0;
  const taxRate = input.taxRate ?? 0;
  if ([annualDiscountRate, annualInflationRate, taxRate].some((rate) => !Number.isFinite(rate) || rate < 0 || rate > 100)) {
    throw new Error("Financial rates must be between 0 and 100");
  }

  const contributionPerUnit = input.pricePerUnit - input.variableCostPerUnit;
  const breakEvenUnits = contributionPerUnit > 0 ? Math.ceil(input.monthlyFixedCosts / contributionPerUnit) : null;
  const monthlyRevenue = input.pricePerUnit * input.monthlyUnits;
  const monthlyVariableCosts = input.variableCostPerUnit * input.monthlyUnits;
  const preTaxMonthlyProfit = monthlyRevenue - monthlyVariableCosts - input.monthlyFixedCosts;
  const monthlyProfit = preTaxMonthlyProfit - Math.max(preTaxMonthlyProfit, 0) * (taxRate / 100);
  const monthlyInflationRate = (1 + annualInflationRate / 100) ** (1 / 12) - 1;
  const monthlyDiscountRate = (1 + annualDiscountRate / 100) ** (1 / 12) - 1;
  const cashFlows: FeasibilityResult["cashFlows"] = [{
    month: 0, revenue: 0, costs: input.initialInvestment, tax: 0,
    netCashFlow: -input.initialInvestment, discountedCashFlow: -input.initialInvestment, cumulativeCashFlow: -input.initialInvestment,
  }];
  let cumulative = -input.initialInvestment;
  let discountedCumulative = -input.initialInvestment;
  let paybackMonths: number | null = input.initialInvestment === 0 ? 0 : null;
  let discountedPaybackMonths: number | null = input.initialInvestment === 0 ? 0 : null;
  for (let month = 1; month <= input.months; month += 1) {
    const multiplier = (1 + monthlyInflationRate) ** (month - 1);
    const revenue = monthlyRevenue * multiplier;
    const costs = (monthlyVariableCosts + input.monthlyFixedCosts) * multiplier;
    const preTaxProfit = revenue - costs;
    const tax = Math.max(preTaxProfit, 0) * (taxRate / 100);
    const netCashFlow = preTaxProfit - tax;
    const discountedCashFlow = netCashFlow / (1 + monthlyDiscountRate) ** month;
    if (paybackMonths === null && cumulative < 0 && cumulative + netCashFlow >= 0) paybackMonths = month - 1 + (-cumulative / netCashFlow);
    if (discountedPaybackMonths === null && discountedCumulative < 0 && discountedCumulative + discountedCashFlow >= 0) discountedPaybackMonths = month - 1 + (-discountedCumulative / discountedCashFlow);
    cumulative += netCashFlow;
    discountedCumulative += discountedCashFlow;
    cashFlows.push({ month, revenue, costs, tax, netCashFlow, discountedCashFlow, cumulativeCashFlow: cumulative });
  }
  const totalProfit = cumulative;
  const computedRoi = input.initialInvestment === 0 ? NaN : (totalProfit / input.initialInvestment) * 100;
  const roiPercent = Number.isFinite(computedRoi) ? computedRoi : null;
  const netPresentValue = discountedCumulative;
  const internalRateReturn = calculateIrr(cashFlows.map(({ netCashFlow }) => netCashFlow));
  const marginOfSafetyPercent = breakEvenUnits === null ? null : (input.monthlyUnits - breakEvenUnits) / input.monthlyUnits * 100;
  const assumptions = [
    "USER_INPUTS_NOT_INDEPENDENTLY_VERIFIED",
    "EFFECTIVE_ANNUAL_RATES_MONTH_END_CASH_FLOWS",
    "REVENUE_AND_OPERATING_COSTS_ESCALATE_EQUALLY",
    "CONSTANT_DEMAND_NO_SEASONALITY",
    "NO_FINANCING_DEPRECIATION_WORKING_CAPITAL_OR_TERMINAL_VALUE",
    "SCENARIOS_ARE_ASSUMPTIONS_NOT_PROBABILITIES",
    ...(roiPercent === null ? ["ROI_UNDEFINED_WITH_ZERO_INITIAL_INVESTMENT"] : []),
    ...(breakEvenUnits === null ? ["NO_POSITIVE_UNIT_CONTRIBUTION"] : []),
    ...(paybackMonths === null ? ["NO_PAYBACK_WITHIN_MODEL_HORIZON"] : []),
  ];
  const numericResults = [breakEvenUnits, monthlyRevenue, monthlyVariableCosts, monthlyProfit, totalProfit, roiPercent, paybackMonths, netPresentValue, internalRateReturn, discountedPaybackMonths, contributionPerUnit, marginOfSafetyPercent];
  if (numericResults.some((result) => result !== null && !Number.isFinite(result)) || cashFlows.some((flow) => Object.values(flow).some((result) => !Number.isFinite(result)))) {
    throw new Error("Financial inputs exceed the supported numerical precision");
  }

  return { valid: true, modelVersion: "JENAN_FINANCE_V2", breakEvenUnits, monthlyRevenue, monthlyVariableCosts, monthlyProfit, totalProfit, roiPercent, paybackMonths, netPresentValue, internalRateReturn, discountedPaybackMonths, contributionPerUnit, marginOfSafetyPercent, cashFlows, assumptions };
}

export function calculateScenarios(input: FeasibilityInputs) {
  return (Object.keys(scenarioMultipliers) as Scenario[]).map((scenario) => {
    const multiplier = scenarioMultipliers[scenario];
    const scenarioInputs = {
      ...input,
      monthlyUnits: Math.min(MAX_MONTHLY_UNITS, Math.max(1, Math.round(input.monthlyUnits * multiplier.demand))),
      pricePerUnit: input.pricePerUnit * multiplier.price,
      variableCostPerUnit: input.variableCostPerUnit * multiplier.variableCost,
      monthlyFixedCosts: input.monthlyFixedCosts * multiplier.fixedCost,
    };
    const result = calculateFeasibility(scenarioInputs);
    return { scenario, inputs: scenarioInputs, ...result };
  });
}

export function calculateSensitivity(input: FeasibilityInputs) {
  const base = calculateFeasibility(input);
  return (["monthlyUnits", "pricePerUnit", "variableCostPerUnit", "monthlyFixedCosts"] as const).flatMap((driver) =>
    [-10, 10].map((changePercent) => {
      const adjusted = input[driver] * (1 + changePercent / 100);
      const result = calculateFeasibility({ ...input, [driver]: driver === "monthlyUnits" ? Math.min(MAX_MONTHLY_UNITS, Math.max(1, Math.round(adjusted))) : adjusted });
      return { driver, changePercent, actualValue: driver === "monthlyUnits" ? Math.min(MAX_MONTHLY_UNITS, Math.max(1, Math.round(adjusted))) : adjusted, netPresentValue: result.netPresentValue, npvDelta: result.netPresentValue - base.netPresentValue, monthlyProfit: result.monthlyProfit };
    }),
  );
}

export function calculateRiskScore(input: { market: number; financial: number; operational: number; technical: number; compliance: number }) {
  const values = Object.values(input);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 100)) throw new Error("Risk factors must be integers from 0 to 100");
  const score = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return { score, level: score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW" } as const;
}
