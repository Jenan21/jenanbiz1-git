import { z } from "zod";
import { engineInputSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema, shortTextSchema, timestampSchema } from "../shared/primitives";
import { dateSchema, intervalSchema, snapshotSchema, quantityDimensionsSchema } from "../shared/quantities";
import { financialDecimalSchema, roundFinancialDecimal } from "./decimal";

export const FINANCIAL_REQUEST_CONTRACT = "jenan.financial-feasibility.request/v1";
export const FINANCIAL_RESULT_CONTRACT = "jenan.financial-feasibility.result/v1";
export const FINANCIAL_VERSION = "1.0.0-m1";
export const financialAnalyses = ["CAPEX", "OPEX", "REVENUE", "CASH_FLOW", "MARGINS", "BREAK_EVEN", "PAYBACK", "NPV", "IRR", "SCENARIOS", "SENSITIVITY", "CASH_REQUIREMENT"] as const;
export const financialStates = ["COMPUTED", "PARTIAL", "ESTIMATED", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"] as const;
export const financialReasons = [
  "M1_CALCULATIONS_DEFERRED", "INPUT_NOT_AVAILABLE", "MISSING_REQUIRED_INPUT", "INCOMPLETE_SCHEDULE",
  "INCOMPATIBLE_BASIS", "ZERO_DENOMINATOR", "NONPOSITIVE_CONTRIBUTION", "AMBIGUOUS_IRR",
  "NON_CONVENTIONAL_CASH_FLOWS", "IRR_NOT_BRACKETED", "NUMERICAL_NONCONVERGENCE",
  "NOT_REACHED_WITHIN_HORIZON", "NOT_APPLICABLE", "UNSUPPORTED_METHOD",
] as const;
export const financialScheduleKinds = [
  "NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "FINANCE_EXPENSE", "TAX_EXPENSE",
  "OTHER_INCOME", "OTHER_EXPENSE", "OPERATING_COLLECTIONS", "OPERATING_PAYMENTS", "CASH_TAX",
  "CAPEX", "WORKING_CAPITAL_CHANGE", "DISPOSAL_CASH", "COMMITTED_FINANCING", "DEBT_PAYMENTS", "DISTRIBUTIONS",
] as const;
export type FinancialAnalysis = typeof financialAnalyses[number];
export const financialTimestamp = timestampSchema.refine((value) => new Date(value).toISOString() === value, "Canonical UTC millisecond timestamp required");
export const financialVersionRefSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const financialScopeSchema = z.object({
  geography: quantityDimensionsSchema.shape.geography, sector: quantityDimensionsSchema.shape.sector,
}).strict();
export const financialSourceRefSchema = z.object({
  inputId: identifierSchema, versionId: identifierSchema, checksum: sha256Schema, sourceRecordId: identifierSchema,
}).strict();
export type FinancialSourceRef = z.infer<typeof financialSourceRefSchema>;
export const currencyMinorUnits = { SAR: 2, USD: 2, EUR: 2, AED: 2, QAR: 2, JPY: 0, KWD: 3, BHD: 3, OMR: 3 } as const;
export const currencySchema = z.enum(["SAR", "USD", "EUR", "AED", "QAR", "JPY", "KWD", "BHD", "OMR"]);
export function roundFinancialMoney(value: string, currency: z.infer<typeof currencySchema>) {
  const places = currencyMinorUnits[currencySchema.parse(currency)];
  const rounded = roundFinancialDecimal(value, places);
  if (places === 0) return rounded;
  const [whole, fraction = ""] = rounded.split(".");
  return `${whole}.${fraction.padEnd(places, "0")}`;
}
export const financialBasisSchema = z.object({
  currency: currencySchema, priceBasis: z.enum(["NOMINAL", "REAL"]), priceBaseDate: dateSchema,
  cashMode: z.enum(["DIRECT_CASH", "ACCRUAL_BRIDGE"]), cashFlowBasis: z.literal("PROJECT_UNLEVERED"),
  t0: snapshotSchema, periods: z.array(intervalSchema).min(1).max(120),
}).strict().superRefine((basis, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const frequency = basis.periods[0]!.frequency;
  if (!["MONTHLY", "ANNUAL"].includes(frequency)) fail("Only complete monthly or annual periods are supported");
  if (frequency === "ANNUAL" && basis.periods.length > 30) fail("At most 30 annual periods");
  if (basis.t0.date !== basis.periods[0]!.startDate) fail("t0 must be at the first reporting boundary");
  if (new Set([basis.t0.id, ...basis.periods.map((period) => period.id)]).size !== basis.periods.length + 1) fail("Unique timeline IDs required");
  basis.periods.forEach((period, index) => {
    if (period.timeZone !== basis.t0.timeZone || period.frequency !== frequency) fail("Periods require one timezone and frequency");
    if (index && basis.periods[index - 1]!.endDate !== period.startDate) fail("Periods must be ordered, contiguous and nonoverlapping");
  });
});
export const financialUnitSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MONEY"), currency: currencySchema }).strict(),
  z.object({ kind: z.literal("QUANTITY"), salesUnit: identifierSchema }).strict(),
  z.object({ kind: z.literal("UNIT_PRICE"), currency: currencySchema, salesUnit: identifierSchema }).strict(),
  z.object({ kind: z.literal("PERIOD_RATE"), frequency: z.enum(["MONTHLY", "ANNUAL"]) }).strict(),
]);
export const financialAssumptionSchema = z.object({
  id: identifierSchema, value: financialDecimalSchema.nullable(), unit: financialUnitSchema,
  periodId: identifierSchema, timingBasis: z.enum(["ACCRUAL", "PERIOD_START", "PERIOD_END", "T0"]),
  purpose: z.enum(["DECLARED_REVENUE", "SALES_VOLUME", "UNIT_PRICE", "EXPLICIT_AMOUNT", "FIXED_COST", "VARIABLE_UNIT_COST", "DISCOUNT_RATE", "CASH_RESERVE", "INITIAL_CASH"]),
  evidenceNature: z.enum(["OBSERVED", "DECLARED_ASSUMPTION"]),
  author: shortTextSchema, declaredAt: financialTimestamp,
  approval: z.enum(["OWNER_APPROVED", "UNREVIEWED"]), rationale: shortTextSchema,
  method: financialVersionRefSchema, evidence: z.array(financialSourceRefSchema).min(1).max(32),
  limitations: z.array(shortTextSchema).min(1).max(10),
}).strict().superRefine((assumption, context) => {
  const expected = {
    DECLARED_REVENUE: "MONEY", SALES_VOLUME: "QUANTITY", UNIT_PRICE: "UNIT_PRICE", EXPLICIT_AMOUNT: "MONEY",
    FIXED_COST: "MONEY", VARIABLE_UNIT_COST: "UNIT_PRICE", DISCOUNT_RATE: "PERIOD_RATE", CASH_RESERVE: "MONEY", INITIAL_CASH: "MONEY",
  };
  if (assumption.unit.kind !== expected[assumption.purpose]) context.addIssue({ code: "custom", message: "Purpose and financial unit are incompatible" });
});
export const financialAmountSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("DECLARED_AMOUNT"), assumptionId: identifierSchema }).strict(),
  z.object({ mode: z.literal("QUANTITY_PRICE"), quantityId: identifierSchema, priceId: identifierSchema }).strict(),
]);
export const financialScheduleSchema = z.object({
  id: identifierSchema, kind: z.enum(financialScheduleKinds), completeness: z.enum(["COMPLETE", "PARTIAL", "MISSING"]),
  coveredPeriods: z.array(identifierSchema).max(121), noApplicableItems: z.boolean(),
  evidence: z.array(financialSourceRefSchema).min(1).max(32),
  entries: z.array(z.object({ id: identifierSchema, periodId: identifierSchema, amount: financialAmountSchema }).strict()).max(1000),
}).strict().superRefine((schedule, context) => {
  if (schedule.noApplicableItems && (schedule.entries.length || schedule.completeness !== "COMPLETE")) context.addIssue({ code: "custom", message: "No applicable items requires an explicit complete empty schedule" });
  if (schedule.completeness === "MISSING" && schedule.entries.length) context.addIssue({ code: "custom", message: "Missing schedule cannot carry entries" });
  if (schedule.completeness === "COMPLETE" && !schedule.entries.length && !schedule.noApplicableItems) context.addIssue({ code: "custom", message: "Empty complete schedules require explicit no-applicable-items declaration" });
});
export const financialInputSchema = engineInputSchema.refine((input) =>
  input.kind === "DATA_CENTER_VERSION" && input.governance === "DC_PUBLISHED" && input.ref.system === "DATA_CENTER",
"Financial v1 accepts exact governed Data Center descriptors only");
export type FinancialAssumption = z.infer<typeof financialAssumptionSchema>;
export type FinancialInput = z.infer<typeof financialInputSchema>;
export type FinancialBasis = z.infer<typeof financialBasisSchema>;
