import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys } from "../shared/canonical";
import { attributionEntrySchema, deriveAttribution, deriveRights, rightsSchema } from "../shared/contracts";
import { assessFinancialConfidence, financialConfidenceSchema } from "./confidence";
import {
  addFinancialDecimals, ceilFinancialDecimal, compareFinancialDecimals, divideFinancialDecimals,
  financialNpv, financialSign, multiplyFinancialDecimals, roundFinancialDecimal, subtractFinancialDecimals,
  solveFinancialIrrBisection,
} from "./decimal";
import {
  financialAnalyses, financialInputSchema, financialSourceRefSchema, financialUnitSchema,
  financialTimestamp, roundFinancialMoney, type FinancialAnalysis, type FinancialAssumption,
  type FinancialInput, type FinancialSourceRef,
} from "./model";
import {
  ensureFinancialSize, financialBounds, financialRequestSchema, financialWorkUnits,
  normalizeFinancialInputs, normalizeFinancialRequest, type FinancialRequest,
} from "./request";
import { assessFinancialPrerequisites, classifyFinancialIrrCashFlows } from "./semantics";
import { financialContextSchema, financialMetricSchema, type FinancialContext } from "./contracts";
import { identifierSchema, shortTextSchema } from "../shared/primitives";

export const FINANCIAL_CALCULATION_VERSION = "1.0.0-m3";
export const financialCalculationPolicy = {
  id: "financial-calculation-v1", version: "1.0.0",
  monetaryRounding: "currency-minor-units/HALF_EVEN",
  percentageRounding: "6-decimal-places/HALF_EVEN",
  quantityRounding: "6-decimal-places/HALF_EVEN",
  payback: "first-period-end-crossing/no-interpolation",
  cashFlows: "unlevered/t0-plus-equally-spaced-end-periods",
  scenarios: "explicit-one-at-a-time-overrides/no-ranking",
  sensitivity: "explicit-low-base-high/one-at-a-time/no-causal-claim",
} as const;
type ScheduleKind = FinancialRequest["schedules"][number]["kind"];
const detailSchema = z.object({
  key: z.string().min(1).max(100), value: z.string().max(128),
  unit: z.enum(["MONEY", "PERCENT", "PERIOD_RATE", "QUANTITY", "PERIODS", "ITERATIONS", "TEXT"]),
}).strict();
export const financialCalculationMetricSchema = financialMetricSchema.extend({
  details: z.array(detailSchema).max(24),
}).strict();
type MetricUnit = z.infer<typeof financialMetricSchema>["unit"];
type CalculationMetric = z.infer<typeof financialCalculationMetricSchema>;
const scenarioResultSchema = z.object({
  id: identifierSchema, label: shortTextSchema,
  method: z.object({ id: z.literal("financial-explicit-scenario"), version: z.literal("1.0.0") }).strict(),
  assumptionIds: z.array(identifierSchema).max(1000),
  evidence: z.array(financialSourceRefSchema).max(10_000),
  confidence: financialConfidenceSchema.nullable(),
  rights: rightsSchema,
  limitations: z.array(z.string().min(1).max(500)).min(1).max(10),
  metrics: z.array(financialCalculationMetricSchema).max(500),
}).strict();
const sensitivityPointSchema = z.object({
  label: z.enum(["LOW", "BASE", "HIGH"]), value: z.string(), unit: financialUnitSchema, metrics: z.array(financialCalculationMetricSchema).max(500),
}).strict();
const sensitivityDeltaSchema = z.object({
  metricKey: identifierSchema, comparison: z.literal("HIGH_MINUS_LOW"),
  value: z.string().nullable(), unit: z.enum(["MONEY", "PERCENT", "QUANTITY", "PERIODS"]),
}).strict();
const sensitivityResultSchema = z.object({
  id: identifierSchema, assumptionId: identifierSchema, target: z.enum(financialAnalyses).exclude(["SCENARIOS", "SENSITIVITY"]),
  method: z.object({ id: z.literal("financial-one-at-a-time-sensitivity"), version: z.literal("1.0.0") }).strict(),
  assumptionIds: z.array(identifierSchema).max(1000),
  evidence: z.array(financialSourceRefSchema).max(10_000),
  confidence: financialConfidenceSchema.nullable(),
  rights: rightsSchema,
  limitations: z.array(z.string().min(1).max(500)).min(1).max(10),
  points: z.array(sensitivityPointSchema).length(3), deltas: z.array(sensitivityDeltaSchema).max(500),
}).strict();
export const financialCalculationResultSchema = z.object({
  contract: z.literal("jenan.financial-feasibility.result/v1"), phase: z.literal("M3_CALCULATIONS"),
  runId: identifierSchema, evaluatedAt: financialTimestamp,
  engine: z.object({ key: z.literal("financial-feasibility"), version: z.literal(FINANCIAL_CALCULATION_VERSION), environment: z.enum(["development", "test", "production"]) }).strict(),
  request: z.object({ normalized: financialRequestSchema, evaluatedAt: financialTimestamp }).strict(),
  policies: z.object({
    decimal: z.literal("financial-decimal-v1/1.0.0"), confidence: z.literal("financial-confidence-v1/1.0.0"),
    calculations: z.object({ id: z.literal(financialCalculationPolicy.id), version: z.literal(financialCalculationPolicy.version) }).strict(),
  }).strict(),
  inputs: z.array(financialInputSchema).max(32), metrics: z.array(financialCalculationMetricSchema).max(500),
  scenarios: z.array(scenarioResultSchema).max(9), sensitivities: z.array(sensitivityResultSchema).max(200),
  rights: rightsSchema,
  attribution: z.array(attributionEntrySchema).max(32), status: z.enum(["COMPLETED", "COMPLETED_WITH_GAPS"]),
  realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
  determinism: z.object({ requestHash: z.string().regex(/^[a-f0-9]{64}$/), inputsHash: z.string().regex(/^[a-f0-9]{64}$/), outputHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  limits: z.object({ costUnits: z.number().int().nonnegative().max(financialBounds.budgetUnits), budgetUnits: z.literal(financialBounds.budgetUnits) }).strict(),
  timing: z.object({ startedAt: financialTimestamp, finishedAt: financialTimestamp, durationMs: z.number().finite().nonnegative() }).strict(),
}).strict();
export type FinancialCalculationResult = z.infer<typeof financialCalculationResultSchema>;

const methods: Record<Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">, { id: string; version: string }> = {
  CAPEX: { id: "financial-capex-sum", version: "1.0.0" },
  OPEX: { id: "financial-operating-expense-sum", version: "1.0.0" },
  REVENUE: { id: "financial-net-revenue-sum", version: "1.0.0" },
  CASH_FLOW: { id: "financial-project-free-cash-flow", version: "1.0.0" },
  MARGINS: { id: "financial-period-margin-bridge", version: "1.0.0" },
  BREAK_EVEN: { id: "financial-single-product-accounting-break-even", version: "1.0.0" },
  PAYBACK: { id: "financial-simple-period-end-payback", version: "1.0.0" },
  NPV: { id: "financial-periodic-project-npv", version: "1.0.0" },
  IRR: { id: "financial-bracketed-periodic-project-irr", version: "1.0.0" },
  CASH_REQUIREMENT: { id: "financial-cash-reserve-shortfall", version: "1.0.0" },
};
const timeline = (request: FinancialRequest) => [request.basis.t0.id, ...request.basis.periods.map((period) => period.id)];
const byId = (request: FinancialRequest) => new Map(request.assumptions.map((assumption) => [assumption.id, assumption]));
const getSchedule = (request: FinancialRequest, kind: ScheduleKind) => request.schedules.find((schedule) => schedule.kind === kind);

function scheduleTotal(request: FinancialRequest, kind: ScheduleKind, periodId: string): string {
  const schedule = getSchedule(request, kind);
  if (!schedule || schedule.completeness !== "COMPLETE") throw new RangeError(`Complete ${kind} schedule required before calculation`);
  const assumptions = byId(request);
  let total = "0";
  for (const entry of schedule.entries.filter((item) => item.periodId === periodId)) {
    const amount = entry.amount;
    let value: string;
    if (amount.mode === "DECLARED_AMOUNT") {
      const assumption = assumptions.get(amount.assumptionId);
      if (!assumption || assumption.value === null) throw new RangeError(`Available declared amount required: ${amount.assumptionId}`);
      value = assumption.value;
    } else {
      const quantity = assumptions.get(amount.quantityId); const price = assumptions.get(amount.priceId);
      if (!quantity || !price || quantity.value === null || price.value === null) throw new RangeError("Available quantity and price required");
      value = multiplyFinancialDecimals(quantity.value, price.value);
    }
    total = addFinancialDecimals(total, value);
  }
  return total;
}
function cashFlowDetails(request: FinancialRequest, periodId: string) {
  if (request.basis.cashMode === "DIRECT_CASH") return [
    { key: "operatingCollections", value: money(scheduleTotal(request, "OPERATING_COLLECTIONS", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "operatingPayments", value: money(scheduleTotal(request, "OPERATING_PAYMENTS", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "cashTax", value: money(scheduleTotal(request, "CASH_TAX", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "capex", value: money(scheduleTotal(request, "CAPEX", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "disposalCash", value: money(scheduleTotal(request, "DISPOSAL_CASH", periodId), request.basis.currency), unit: "MONEY" as const },
  ];
  const revenue = scheduleTotal(request, "NET_REVENUE", periodId);
  const cogs = scheduleTotal(request, "COGS", periodId);
  const opex = scheduleTotal(request, "OPERATING_EXPENSE", periodId);
  const depreciation = scheduleTotal(request, "DEPRECIATION", periodId);
  return [
    { key: "operatingProfit", value: money(subtractFinancialDecimals(subtractFinancialDecimals(revenue, cogs), addFinancialDecimals(opex, depreciation)), request.basis.currency), unit: "MONEY" as const },
    { key: "depreciationAddBack", value: money(depreciation, request.basis.currency), unit: "MONEY" as const },
    { key: "cashTax", value: money(scheduleTotal(request, "CASH_TAX", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "capex", value: money(scheduleTotal(request, "CAPEX", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "workingCapitalChange", value: money(scheduleTotal(request, "WORKING_CAPITAL_CHANGE", periodId), request.basis.currency), unit: "MONEY" as const },
    { key: "disposalCash", value: money(scheduleTotal(request, "DISPOSAL_CASH", periodId), request.basis.currency), unit: "MONEY" as const },
  ];
}
const requestCashKinds: ScheduleKind[] = ["OPERATING_COLLECTIONS", "OPERATING_PAYMENTS", "CASH_TAX", "CAPEX", "DISPOSAL_CASH"];
const frequency = (request: FinancialRequest): "MONTHLY" | "ANNUAL" => request.basis.periods[0]!.frequency as "MONTHLY" | "ANNUAL";
function requiredScheduleKinds(request: FinancialRequest, analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">): ScheduleKind[] {
  if (analysis === "CASH_FLOW" || analysis === "PAYBACK" || analysis === "NPV" || analysis === "IRR" || analysis === "CASH_REQUIREMENT") {
    const base: ScheduleKind[] = request.basis.cashMode === "DIRECT_CASH"
      ? [...requestCashKinds]
      : ["NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "CASH_TAX", "CAPEX", "WORKING_CAPITAL_CHANGE", "DISPOSAL_CASH"];
    if (analysis === "CASH_REQUIREMENT" && request.cashRequirement?.financingBasis === "RESIDUAL_COMMITTED_ONLY") {
      base.push("COMMITTED_FINANCING", "DEBT_PAYMENTS", "DISTRIBUTIONS");
    }
    return base;
  }
  if (analysis === "CAPEX") return ["CAPEX"];
  if (analysis === "OPEX") return ["OPERATING_EXPENSE"];
  if (analysis === "REVENUE") return ["NET_REVENUE"];
  if (analysis === "MARGINS") return ["NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "FINANCE_EXPENSE", "TAX_EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"];
  return [];
}
function getMetricEvidence(request: FinancialRequest, analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">, assumptions: FinancialAssumption[]) {
  const refs = [
    ...assumptions.flatMap((entry) => entry.evidence),
    ...requiredScheduleKinds(request, analysis).flatMap((kind) => getSchedule(request, kind)?.evidence ?? []),
  ];
  return [...new Map(refs.map((ref) => [canonicalize(ref), ref])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
}
function createMetric(
  request: FinancialRequest, inputs: FinancialInput[], analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">,
  key: string, value: string | null, unit: MetricUnit, periods: string[],
  assumptions: FinancialAssumption[], refs: FinancialSourceRef[], reasons: string[], details: CalculationMetric["details"] = [],
): CalculationMetric {
  const selectedInputs = inputs.filter((input) => refs.some((ref) => ref.inputId === input.id));
  const confidence = value === null ? null : assessFinancialConfidence(assumptions, selectedInputs, false);
  const status = value === null ? (reasons.includes("INPUT_NOT_AVAILABLE") ? "NOT_AVAILABLE" : "NOT_COMPUTABLE") : "COMPUTED";
  return financialCalculationMetricSchema.parse({
    key, analysis, status, value, interpretation: value === null ? "UNAVAILABLE"
      : assumptions.some((assumption) => assumption.evidenceNature === "DECLARED_ASSUMPTION") ? "ASSUMPTION_BASED_PROJECTION" : "OBSERVED",
    unit, periodIds: periods, method: methods[analysis],
    basis: {
      currency: request.basis.currency, priceBasis: request.basis.priceBasis, priceBaseDate: request.basis.priceBaseDate,
      cashMode: request.basis.cashMode, cashFlowBasis: request.basis.cashFlowBasis,
    },
    assumptionIds: assumptions.map((assumption) => assumption.id).sort(compareText), evidence: refs,
    confidence, reasons: [...new Set(reasons)].sort(compareText),
    limitations: [
      "Deterministic calculation from explicit versioned inputs; not a realized result, investment recommendation or financing recommendation.",
      ...(assumptions.some((assumption) => assumption.evidenceNature === "DECLARED_ASSUMPTION") ? ["Projection depends on disclosed owner-approved assumptions; confidence is evidence quality, not success probability."] : []),
    ], rights: deriveRights(selectedInputs), details,
  });
}
const money = (value: string, currency: FinancialRequest["basis"]["currency"]) => roundFinancialMoney(value, currency);
const fixedQuantity = (value: string) => {
  const rounded = roundFinancialDecimal(value, 6);
  const [whole, fraction = ""] = rounded.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
};
const percentage = (value: string) => {
  const rounded = roundFinancialDecimal(value, 6);
  const [whole, fraction = ""] = rounded.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
};
const periodMetricKey = (prefix: string, periodId: string) => {
  const candidate = `${prefix}.${periodId}`;
  return candidate.length <= 128 ? candidate : `${prefix}.${canonicalHash(periodId)}`;
};
function unavailable(
  request: FinancialRequest, inputs: FinancialInput[], analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">,
  reasons: string[], assumptions: FinancialAssumption[], refs: FinancialSourceRef[],
): CalculationMetric[] {
  const unit: MetricUnit = analysis === "MARGINS" || analysis === "IRR" ? { kind: "PERCENT" }
    : analysis === "PAYBACK" ? { kind: "PERIODS", frequency: frequency(request) }
      : analysis === "BREAK_EVEN" ? { kind: "QUANTITY", salesUnit: request.assumptions.find((entry) => entry.id === request.breakEven?.unitPriceId)?.unit.kind === "UNIT_PRICE"
        ? (request.assumptions.find((entry) => entry.id === request.breakEven?.unitPriceId)!.unit as { kind: "UNIT_PRICE"; currency: string; salesUnit: string }).salesUnit : null }
        : { kind: "MONEY", currency: request.basis.currency };
  if (analysis === "MARGINS") return request.basis.periods.flatMap((period) =>
    ["gross", "operating", "net"].map((name) => createMetric(request, inputs, analysis,
      periodMetricKey(`${name}.margin`, period.id), null, { kind: "PERCENT" }, [period.id], assumptions, refs, reasons)));
  if (analysis === "CAPEX" || analysis === "OPEX" || analysis === "REVENUE" || analysis === "CASH_FLOW") {
    return timeline(request).map((periodId) => createMetric(request, inputs, analysis,
      periodMetricKey(analysis === "CASH_FLOW" ? "cash_flow" : analysis.toLowerCase(), periodId), null, unit, [periodId], assumptions, refs, reasons));
  }
  const key: Record<"BREAK_EVEN" | "PAYBACK" | "NPV" | "IRR" | "CASH_REQUIREMENT", string> = {
    BREAK_EVEN: "break_even.units", PAYBACK: "payback.periods", NPV: "npv.project",
    IRR: "irr.per_period", CASH_REQUIREMENT: "cash_requirement.amount",
  };
  return [createMetric(request, inputs, analysis, key[analysis as keyof typeof key], null, unit, timeline(request), assumptions, refs, reasons)];
}

function cashFlows(request: FinancialRequest): string[] {
  return timeline(request).map((periodId) => {
    if (request.basis.cashMode === "DIRECT_CASH") {
      return addFinancialDecimals(
        subtractFinancialDecimals(
          subtractFinancialDecimals(
            subtractFinancialDecimals(scheduleTotal(request, "OPERATING_COLLECTIONS", periodId), scheduleTotal(request, "OPERATING_PAYMENTS", periodId)),
            scheduleTotal(request, "CASH_TAX", periodId)),
          scheduleTotal(request, "CAPEX", periodId)),
        scheduleTotal(request, "DISPOSAL_CASH", periodId));
    }
    const operating = subtractFinancialDecimals(
      subtractFinancialDecimals(scheduleTotal(request, "NET_REVENUE", periodId), scheduleTotal(request, "COGS", periodId)),
      addFinancialDecimals(scheduleTotal(request, "OPERATING_EXPENSE", periodId), scheduleTotal(request, "DEPRECIATION", periodId)));
    return addFinancialDecimals(
      subtractFinancialDecimals(
        subtractFinancialDecimals(
          addFinancialDecimals(operating, scheduleTotal(request, "DEPRECIATION", periodId)),
          scheduleTotal(request, "CASH_TAX", periodId)),
        scheduleTotal(request, "CAPEX", periodId)),
      subtractFinancialDecimals(scheduleTotal(request, "DISPOSAL_CASH", periodId), scheduleTotal(request, "WORKING_CAPITAL_CHANGE", periodId)));
  });
}

function calculateOne(
  request: FinancialRequest, inputs: FinancialInput[], analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">,
): CalculationMetric[] {
  const prereq = assessFinancialPrerequisites(request, inputs, analysis);
  const assumptions = prereq.assumptions;
  const refs = getMetricEvidence(request, analysis, assumptions);
  if (!prereq.ready) return unavailable(request, inputs, analysis, prereq.reasons, assumptions, refs);
  const currency = request.basis.currency;
  const ids = new Map(request.assumptions.map((entry) => [entry.id, entry]));
  if (analysis === "CAPEX" || analysis === "OPEX" || analysis === "REVENUE") {
    const kind = analysis === "CAPEX" ? "CAPEX" : analysis === "OPEX" ? "OPERATING_EXPENSE" : "NET_REVENUE";
    return timeline(request).map((periodId) => createMetric(request, inputs, analysis, periodMetricKey(analysis.toLowerCase(), periodId),
      money(scheduleTotal(request, kind, periodId), currency), { kind: "MONEY", currency }, [periodId], assumptions, refs, []));
  }
  if (analysis === "CASH_FLOW") {
    const flows = cashFlows(request);
    return timeline(request).map((periodId, index) => createMetric(request, inputs, analysis, periodMetricKey("cash_flow", periodId),
      money(flows[index]!, currency), { kind: "MONEY", currency }, [periodId], assumptions, refs, [], cashFlowDetails(request, periodId)));
  }
  if (analysis === "MARGINS") {
    const output: CalculationMetric[] = [];
    for (const period of request.basis.periods) {
      const periodId = period.id; const sales = scheduleTotal(request, "NET_REVENUE", periodId);
      if (compareFinancialDecimals(sales, "0") <= 0) {
        for (const name of ["gross", "operating", "net"]) output.push(createMetric(request, inputs, analysis,
          periodMetricKey(`${name}.margin`, periodId), null, { kind: "PERCENT" }, [periodId], assumptions, refs, ["ZERO_DENOMINATOR"]));
        continue;
      }
      const cogs = scheduleTotal(request, "COGS", periodId); const opex = scheduleTotal(request, "OPERATING_EXPENSE", periodId);
      const depreciation = scheduleTotal(request, "DEPRECIATION", periodId);
      const grossProfit = subtractFinancialDecimals(sales, cogs);
      const operatingProfit = subtractFinancialDecimals(grossProfit, addFinancialDecimals(opex, depreciation));
      const finance = scheduleTotal(request, "FINANCE_EXPENSE", periodId);
      const tax = scheduleTotal(request, "TAX_EXPENSE", periodId);
      const otherIncome = scheduleTotal(request, "OTHER_INCOME", periodId);
      const otherExpense = scheduleTotal(request, "OTHER_EXPENSE", periodId);
      const netProfit = subtractFinancialDecimals(addFinancialDecimals(operatingProfit, otherIncome),
        addFinancialDecimals(addFinancialDecimals(finance, tax), otherExpense));
      const rows: [string, string, string, string][] = [
        ["gross", grossProfit, cogs, "0"],
        ["operating", operatingProfit, addFinancialDecimals(cogs, addFinancialDecimals(opex, depreciation)), "0"],
        ["net", netProfit, addFinancialDecimals(addFinancialDecimals(cogs, addFinancialDecimals(opex, depreciation)),
          addFinancialDecimals(finance, addFinancialDecimals(tax, otherExpense))), otherIncome],
      ];
      for (const [name, profit, costs, otherIncomeAmount] of rows) output.push(createMetric(request, inputs, analysis, periodMetricKey(`${name}.margin`, periodId),
        percentage(multiplyFinancialDecimals(divideFinancialDecimals(profit, sales), "100")), { kind: "PERCENT" }, [periodId], assumptions, refs, [],
        [{ key: "profit", value: money(profit, currency), unit: "MONEY" }, { key: "netRevenue", value: money(sales, currency), unit: "MONEY" },
          { key: "deductedCosts", value: money(costs, currency), unit: "MONEY" },
          { key: "otherIncome", value: money(otherIncomeAmount, currency), unit: "MONEY" }]));
    }
    return output;
  }
  if (analysis === "BREAK_EVEN") {
    const spec = request.breakEven!;
    const fixed = ids.get(spec.fixedCostId)!.value!; const price = ids.get(spec.unitPriceId)!.value!; const variable = ids.get(spec.variableUnitCostId)!.value!;
    const contribution = subtractFinancialDecimals(price, variable);
    const wholeUnits = spec.wholeUnits;
    const units = compareFinancialDecimals(fixed, "0") === 0 ? "0"
        : (wholeUnits ? ceilFinancialDecimal(divideFinancialDecimals(fixed, contribution)) : fixedQuantity(divideFinancialDecimals(fixed, contribution)));
    return [createMetric(request, inputs, analysis, "break_even.units", units,
      { kind: "QUANTITY", salesUnit: (ids.get(spec.unitPriceId)!.unit as { kind: "UNIT_PRICE"; currency: string; salesUnit: string }).salesUnit },
      [spec.periodId], assumptions, refs, [], [
        { key: "contributionPerUnit", value: money(contribution, currency), unit: "MONEY" },
        { key: "fixedCost", value: money(fixed, currency), unit: "MONEY" },
        { key: "breakEvenSales", value: money(multiplyFinancialDecimals(units, price), currency), unit: "MONEY" },
      ])];
  }
  if (analysis === "PAYBACK") {
    const flows = cashFlows(request);
    if (financialSign(flows[0]!) >= 0) return [createMetric(request, inputs, analysis, "payback.periods", null,
      { kind: "PERIODS", frequency: frequency(request) }, timeline(request), assumptions, refs, ["NOT_APPLICABLE"])];
    let cumulative = flows[0]!;
    for (let index = 1; index < flows.length; index++) {
      cumulative = addFinancialDecimals(cumulative, flows[index]!);
      if (financialSign(cumulative) >= 0) {
        let laterBalance = cumulative; let firstLaterDeficit = "";
        for (let later = index + 1; later < flows.length; later++) {
          laterBalance = addFinancialDecimals(laterBalance, flows[later]!);
          if (financialSign(laterBalance) < 0) { firstLaterDeficit = timeline(request)[later]!; break; }
        }
        return [createMetric(request, inputs, analysis, "payback.periods", String(index),
          { kind: "PERIODS", frequency: frequency(request) }, timeline(request).slice(0, index + 1), assumptions, refs, [],
          [{ key: "crossingPeriodId", value: timeline(request)[index]!, unit: "TEXT" },
            { key: "cumulativeCashAtCrossing", value: money(cumulative, currency), unit: "MONEY" },
            ...(firstLaterDeficit ? [{ key: "firstLaterDeficitPeriodId", value: firstLaterDeficit, unit: "TEXT" as const }] : [])])];
      }
    }
    return [createMetric(request, inputs, analysis, "payback.periods", null,
      { kind: "PERIODS", frequency: frequency(request) }, timeline(request), assumptions, refs, ["NOT_REACHED_WITHIN_HORIZON"])];
  }
  if (analysis === "NPV") {
    const rate = ids.get(request.valuation!.discountRateId!)!.value!;
    return [createMetric(request, inputs, analysis, "npv.project", money(financialNpv(cashFlows(request), rate), currency),
      { kind: "MONEY", currency }, timeline(request), assumptions, refs, [], [
        { key: "discountRatePerPeriod", value: rate, unit: "PERIOD_RATE" },
        { key: "terminalValueTreatment", value: request.valuation!.terminalValueTreatment, unit: "TEXT" },
      ])];
  }
  if (analysis === "IRR") {
    const flows = cashFlows(request); const classification = classifyFinancialIrrCashFlows(flows);
    if (classification.length) return [createMetric(request, inputs, analysis, "irr.per_period", null, { kind: "PERCENT" }, timeline(request), assumptions, refs, classification)];
    const solver = request.valuation!.solver!;
    const result = solveFinancialIrrBisection(flows, solver.lowerRate, solver.upperRate, solver.maxIterations, solver.rateTolerance, solver.normalizedResidualTolerance);
    if (result.status !== "COMPUTED") return [createMetric(request, inputs, analysis, "irr.per_period", null, { kind: "PERCENT" }, timeline(request), assumptions, refs,
      [result.status === "NOT_BRACKETED" ? "IRR_NOT_BRACKETED" : "NUMERICAL_NONCONVERGENCE"])];
    const residual = financialNpv(flows, result.rate!);
    return [createMetric(request, inputs, analysis, "irr.per_period", percentage(multiplyFinancialDecimals(result.rate!, "100")),
      { kind: "PERCENT" }, timeline(request), assumptions, refs, [], [
        { key: "perPeriodRate", value: result.rate!, unit: "PERIOD_RATE" }, { key: "solverIterations", value: String(result.iterations), unit: "ITERATIONS" },
        { key: "npvResidual", value: money(residual, currency), unit: "MONEY" },
      ])];
  }
  if (analysis === "CASH_REQUIREMENT") {
    const spec = request.cashRequirement!;
    const initialCash = ids.get(spec.initialCashId)!.value!; const reserve = ids.get(spec.reserveId)!.value!;
    const flows = cashFlows(request);
    let balance = initialCash; let minimum = initialCash; let minimumPeriod = request.basis.t0.id;
    for (let index = 0; index < flows.length; index++) {
      let net = flows[index]!;
      if (spec.financingBasis === "RESIDUAL_COMMITTED_ONLY") {
        net = addFinancialDecimals(net, scheduleTotal(request, "COMMITTED_FINANCING", timeline(request)[index]!));
        net = subtractFinancialDecimals(net, scheduleTotal(request, "DEBT_PAYMENTS", timeline(request)[index]!));
        net = subtractFinancialDecimals(net, scheduleTotal(request, "DISTRIBUTIONS", timeline(request)[index]!));
      }
      balance = addFinancialDecimals(balance, net);
      if (compareFinancialDecimals(balance, minimum) < 0) { minimum = balance; minimumPeriod = timeline(request)[index]!; }
    }
    const requirement = compareFinancialDecimals(subtractFinancialDecimals(reserve, minimum), "0") > 0
      ? subtractFinancialDecimals(reserve, minimum) : "0";
    return [createMetric(request, inputs, analysis, "cash_requirement.amount", money(requirement, currency),
      { kind: "MONEY", currency }, timeline(request), assumptions, refs, [], [
        { key: "minimumCashBalance", value: money(minimum, currency), unit: "MONEY" },
        { key: "minimumBalancePeriodId", value: minimumPeriod, unit: "TEXT" },
        { key: "requiredReserve", value: money(reserve, currency), unit: "MONEY" },
        { key: "openingCash", value: money(initialCash, currency), unit: "MONEY" },
        { key: "financingBasis", value: spec.financingBasis, unit: "TEXT" },
      ])];
  }
  throw new RangeError(`Unsupported financial calculation: ${analysis}`);
}

const calculationAnalyses = (request: FinancialRequest): Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">[] =>
  request.analyses.filter((analysis): analysis is Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY"> =>
    analysis !== "SCENARIOS" && analysis !== "SENSITIVITY");
function metricCountFor(request: FinancialRequest, analysis: Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">): number {
  if (analysis === "MARGINS") return 3 * request.basis.periods.length;
  if (analysis === "CAPEX" || analysis === "OPEX" || analysis === "REVENUE" || analysis === "CASH_FLOW") return timeline(request).length;
  return 1;
}
function assertExpandedMetricBound(request: FinancialRequest) {
  const base = calculationAnalyses(request).reduce((sum, analysis) => sum + metricCountFor(request, analysis), 0);
  const expanded = base * (1 + request.scenarios.length)
    + request.sensitivity.reduce((sum, driver) => sum + 3 * driver.targets.reduce((targetSum, target) => targetSum
      + metricCountFor(request, target as Exclude<FinancialAnalysis, "SCENARIOS" | "SENSITIVITY">), 0), 0);
  if (expanded > financialBounds.metrics) throw new RangeError("Expanded financial metric count exceeds 500");
}
function outputRefs(request: FinancialRequest, assumptions: FinancialAssumption[]): FinancialSourceRef[] {
  const refs = [
    ...assumptions.flatMap((entry) => entry.evidence),
    ...request.schedules.flatMap((schedule) => schedule.evidence),
  ];
  return [...new Map(refs.map((ref) => [canonicalize(ref), ref])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
}
function nestedMeta(request: FinancialRequest, inputs: FinancialInput[], assumptions: FinancialAssumption[]) {
  const evidence = outputRefs(request, assumptions);
  const selected = inputs.filter((input) => evidence.some((ref) => ref.inputId === input.id));
  return { assumptions, evidence, confidence: assessFinancialConfidence(assumptions, selected, false), rights: deriveRights(selected) };
}

function buildCore(request: FinancialRequest, inputs: FinancialInput[], context: FinancialContext) {
  const metrics = calculationAnalyses(request).flatMap((item) => calculateOne(request, inputs, item)).sort((a, b) => compareText(a.key, b.key));
  const scenarios = request.scenarios.map((scenario) => {
    const scenarioRequest = {
      ...request,
      assumptions: request.assumptions.map((assumption) => {
        const override = scenario.overrides.find((entry) => entry.assumptionId === assumption.id);
        return override ? { ...assumption, value: override.value } : assumption;
      }),
    };
    const scenarioMetrics = calculationAnalyses(request).flatMap((item) => calculateOne(scenarioRequest, inputs, item)).sort((a, b) => compareText(a.key, b.key));
    const meta = nestedMeta(scenarioRequest, inputs, scenarioRequest.assumptions);
    return {
      id: scenario.id, label: scenario.label, method: { id: "financial-explicit-scenario" as const, version: "1.0.0" as const },
      assumptionIds: meta.assumptions.map((entry) => entry.id).sort(compareText), evidence: [...meta.evidence, ...scenario.evidence]
        .filter((ref, index, all) => all.findIndex((item) => canonicalize(item) === canonicalize(ref)) === index).sort((a, b) => compareText(canonicalize(a), canonicalize(b))),
      confidence: meta.confidence, rights: meta.rights,
      limitations: ["Explicit named override only; no ranking, optimization, forecast probability or recommendation."],
      metrics: scenarioMetrics,
    };
  });
  const sensitivities = request.sensitivity.flatMap((driver) => driver.targets.map((target) => {
    const points = ([
      ["LOW", driver.low], ["BASE", driver.base], ["HIGH", driver.high],
    ] as const).map(([label, value]) => {
      const changed = {
        ...request,
        assumptions: request.assumptions.map((assumption) => assumption.id === driver.assumptionId ? { ...assumption, value } : assumption),
      };
      return {
        label, value, unit: request.assumptions.find((assumption) => assumption.id === driver.assumptionId)!.unit,
        metrics: calculateOne(changed, inputs, target),
      };
    });
    const baseKeys = new Set(points[1]!.metrics.map((metric) => metric.key));
    const deltas = [...baseKeys].sort(compareText).map((metricKey) => {
      const low = points[0]!.metrics.find((metric) => metric.key === metricKey)?.value;
      const high = points[2]!.metrics.find((metric) => metric.key === metricKey)?.value;
      const sample = points[1]!.metrics.find((metric) => metric.key === metricKey)!;
      if (low === null || low === undefined || high === null || high === undefined) return { metricKey, comparison: "HIGH_MINUS_LOW" as const, value: null, unit: sample.unit.kind === "MONEY" ? "MONEY" as const
        : sample.unit.kind === "PERIODS" ? "PERIODS" as const : sample.unit.kind === "QUANTITY" ? "QUANTITY" as const : "PERCENT" as const };
      const rawDelta = subtractFinancialDecimals(high, low);
      const value = sample.unit.kind === "MONEY" ? money(rawDelta, request.basis.currency)
        : sample.unit.kind === "PERIODS" ? roundFinancialDecimal(rawDelta, 0) : fixedQuantity(rawDelta);
      return { metricKey, comparison: "HIGH_MINUS_LOW" as const, value, unit: sample.unit.kind === "MONEY" ? "MONEY" as const
        : sample.unit.kind === "PERIODS" ? "PERIODS" as const : sample.unit.kind === "QUANTITY" ? "QUANTITY" as const : "PERCENT" as const };
    });
    const meta = nestedMeta(request, inputs, request.assumptions);
    return {
      id: `s.${canonicalHash({ id: driver.id, target }).slice(0, 32)}`, assumptionId: driver.assumptionId, target,
      method: { id: "financial-one-at-a-time-sensitivity" as const, version: "1.0.0" as const },
      assumptionIds: [driver.assumptionId, ...meta.assumptions.map((entry) => entry.id)].filter((id, index, all) => all.indexOf(id) === index).sort(compareText),
      evidence: [...meta.evidence, ...driver.evidence].filter((ref, index, all) => all.findIndex((item) => canonicalize(item) === canonicalize(ref)) === index)
        .sort((a, b) => compareText(canonicalize(a), canonicalize(b))),
      confidence: meta.confidence, rights: meta.rights,
      limitations: ["One-at-a-time low/base/high finite-difference comparison; other assumptions are held fixed. Not a causal claim or recommendation."],
      points, deltas,
    };
  }));
  const complete = [...metrics, ...scenarios.flatMap((scenario) => scenario.metrics), ...sensitivities.flatMap((sensitivity) => sensitivity.points.flatMap((point) => point.metrics))]
    .every((metric) => metric.value !== null);
  const expandedMetricCount = metrics.length + scenarios.reduce((sum, scenario) => sum + scenario.metrics.length, 0)
    + sensitivities.reduce((sum, sensitivity) => sum + sensitivity.points.reduce((pointSum, point) => pointSum + point.metrics.length, 0), 0);
  if (expandedMetricCount > financialBounds.metrics) throw new RangeError("Expanded financial metric count exceeds 500");
  const allInputs = inputs;
  return {
    contract: "jenan.financial-feasibility.result/v1" as const, phase: "M3_CALCULATIONS" as const,
    runId: context.runId, evaluatedAt: context.evaluatedAt,
    engine: { key: "financial-feasibility" as const, version: FINANCIAL_CALCULATION_VERSION, environment: context.environment },
    request: { normalized: request, evaluatedAt: context.evaluatedAt },
    policies: { decimal: "financial-decimal-v1/1.0.0" as const, confidence: "financial-confidence-v1/1.0.0" as const,
      calculations: { id: financialCalculationPolicy.id, version: financialCalculationPolicy.version } },
    inputs: allInputs, metrics, scenarios, sensitivities,
    rights: deriveRights(allInputs), attribution: deriveAttribution(allInputs),
    status: complete ? "COMPLETED" as const : "COMPLETED_WITH_GAPS" as const,
    realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
    limits: { costUnits: financialWorkUnits(request), budgetUnits: financialBounds.budgetUnits },
  };
}

export function buildFinancialCalculationResult(rawRequest: unknown, rawInputs: unknown, rawContext: FinancialContext): FinancialCalculationResult {
  const context = financialContextSchema.parse(rawContext);
  const normalized = normalizeFinancialRequest(rawRequest, context.evaluatedAt);
  assertExpandedMetricBound(normalized.normalized);
  const inputs = normalizeFinancialInputs(rawInputs, normalized.normalized);
  const core = buildCore(normalized.normalized, inputs, context);
  const result = financialCalculationResultSchema.parse({
    ...core, determinism: {
      requestHash: normalized.requestHash, inputsHash: canonicalHash(inputs),
      outputHash: canonicalHash(omitKeys(core, ["runId", "timing"])),
    }, timing: context.timing,
  });
  ensureFinancialSize(result);
  return result;
}
export function validateFinancialCalculationResult(raw: unknown): FinancialCalculationResult {
  ensureFinancialSize(raw);
  const result = financialCalculationResultSchema.parse(raw);
  const recomputed = buildFinancialCalculationResult(result.request.normalized, result.inputs, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (canonicalize(result) !== canonicalize(recomputed)) throw new RangeError("Financial M3 result/hash/semantics mismatch");
  return result;
}
