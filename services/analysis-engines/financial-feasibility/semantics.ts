import { compareText } from "../shared/canonical";
import { compareFinancialDecimals } from "./decimal";
import { type FinancialAnalysis, type FinancialInput, type FinancialSourceRef, financialReasons } from "./model";
import { type FinancialRequest } from "./request";

export type FinancialReason = typeof financialReasons[number];
type ScheduleKind = FinancialRequest["schedules"][number]["kind"];
export function classifyFinancialIrrCashFlows(values: readonly (string | null)[]): FinancialReason[] {
  if (values.length < 2 || values.some((value) => value === null)) return ["MISSING_REQUIRED_INPUT"];
  const signs = values.filter((value): value is string => value !== null).map((value) => compareFinancialDecimals(value, "0")).filter((sign) => sign !== 0);
  let changes = 0;
  for (let index = 1; index < signs.length; index++) if (signs[index] !== signs[index - 1]) changes++;
  if (changes > 1) return ["AMBIGUOUS_IRR", "NON_CONVENTIONAL_CASH_FLOWS"];
  if (compareFinancialDecimals(values[0]!, "0") >= 0 || signs.length < 2 || signs.slice(1).some((sign) => sign < 0)) return ["NON_CONVENTIONAL_CASH_FLOWS"];
  return [];
}
export function assessFinancialPrerequisites(request: FinancialRequest, inputs: readonly FinancialInput[], analysis: FinancialAnalysis) {
  const issues = new Set<FinancialReason>();
  const cash: ScheduleKind[] = request.basis.cashMode === "DIRECT_CASH"
    ? ["OPERATING_COLLECTIONS", "OPERATING_PAYMENTS", "CASH_TAX", "CAPEX", "DISPOSAL_CASH"]
    : ["NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "CASH_TAX", "CAPEX", "WORKING_CAPITAL_CHANGE", "DISPOSAL_CASH"];
  const requirements: Record<FinancialAnalysis, ScheduleKind[]> = {
    CAPEX: ["CAPEX"], OPEX: ["OPERATING_EXPENSE"], REVENUE: ["NET_REVENUE"],
    MARGINS: ["NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "FINANCE_EXPENSE", "TAX_EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"],
    CASH_FLOW: cash, PAYBACK: cash, NPV: cash, IRR: cash, BREAK_EVEN: [],
    CASH_REQUIREMENT: [...cash, ...(request.cashRequirement?.financingBasis === "RESIDUAL_COMMITTED_ONLY" ? ["COMMITTED_FINANCING", "DEBT_PAYMENTS", "DISTRIBUTIONS"] as const : [])],
    SCENARIOS: [], SENSITIVITY: [],
  };
  const ids = new Set<string>(); const refs: FinancialSourceRef[] = [];
  for (const kind of requirements[analysis]) {
    const schedule = request.schedules.find((entry) => entry.kind === kind);
    if (!schedule) { issues.add("MISSING_REQUIRED_INPUT"); continue; }
    refs.push(...schedule.evidence);
    if (schedule.completeness === "MISSING") issues.add("INPUT_NOT_AVAILABLE");
    else if (schedule.completeness !== "COMPLETE") issues.add("INCOMPLETE_SCHEDULE");
    for (const entry of schedule.entries) {
      if (entry.amount.mode === "DECLARED_AMOUNT") ids.add(entry.amount.assumptionId);
      else { ids.add(entry.amount.quantityId); ids.add(entry.amount.priceId); }
    }
  }
  if (analysis === "BREAK_EVEN") {
    if (!request.breakEven) issues.add("MISSING_REQUIRED_INPUT");
    else {
      const spec = request.breakEven;
      [spec.fixedCostId, spec.unitPriceId, spec.variableUnitCostId].forEach((id) => ids.add(id));
      const price = request.assumptions.find((entry) => entry.id === spec.unitPriceId)?.value;
      const variable = request.assumptions.find((entry) => entry.id === spec.variableUnitCostId)?.value;
      if (price !== null && price !== undefined && variable !== null && variable !== undefined
        && (compareFinancialDecimals(price, "0") <= 0 || compareFinancialDecimals(price, variable) <= 0)) issues.add("NONPOSITIVE_CONTRIBUTION");
    }
  }
  if (analysis === "NPV" || analysis === "IRR") {
    if (!request.valuation?.discountRateId) issues.add("MISSING_REQUIRED_INPUT");
    else {
      ids.add(request.valuation.discountRateId);
      const rate = request.assumptions.find((entry) => entry.id === request.valuation?.discountRateId)?.value;
      if (rate !== null && rate !== undefined && compareFinancialDecimals(rate, "-1") <= 0) issues.add("INCOMPATIBLE_BASIS");
    }
    if (analysis === "IRR" && !request.valuation?.solver) issues.add("MISSING_REQUIRED_INPUT");
  }
  if (analysis === "CASH_REQUIREMENT") {
    if (!request.cashRequirement) issues.add("MISSING_REQUIRED_INPUT");
    else [request.cashRequirement.initialCashId, request.cashRequirement.reserveId].forEach((id) => ids.add(id));
  }
  if (analysis === "SCENARIOS" || analysis === "SENSITIVITY") {
    request.assumptions.forEach((entry) => ids.add(entry.id));
    refs.push(...(analysis === "SCENARIOS" ? request.scenarios : request.sensitivity).flatMap((entry) => entry.evidence));
    if (!request.analyses.some((entry) => !["SCENARIOS", "SENSITIVITY"].includes(entry))) issues.add("MISSING_REQUIRED_INPUT");
  }
  const assumptions = request.assumptions.filter((entry) => ids.has(entry.id));
  refs.push(...assumptions.flatMap((entry) => entry.evidence));
  if (assumptions.some((entry) => entry.value === null)) issues.add("MISSING_REQUIRED_INPUT");
  const selectedInputs = inputs.filter((input) => refs.some((ref) => ref.inputId === input.id));
  if (refs.some((ref) => !selectedInputs.some((input) => input.id === ref.inputId))) issues.add("INPUT_NOT_AVAILABLE");
  if (!refs.length) issues.add("MISSING_REQUIRED_INPUT");
  if ((analysis === "NPV" || analysis === "IRR") && assumptions.some((entry) => entry.periodId !== request.basis.t0.id && entry.timingBasis === "PERIOD_START")) issues.add("INCOMPATIBLE_BASIS");
  for (const input of selectedInputs) {
    if (input.freshness.status === "EXPIRED") issues.add("INPUT_NOT_AVAILABLE");
    if (input.completeness !== "INVENTORY") issues.add("INCOMPLETE_SCHEDULE");
  }
  return { ready: issues.size === 0, reasons: [...issues].sort(compareText), assumptionIds: [...ids].sort(compareText), assumptions, inputs: selectedInputs };
}
