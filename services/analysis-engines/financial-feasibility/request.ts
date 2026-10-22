import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { identifierSchema, sha256Schema, shortTextSchema } from "../shared/primitives";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { financialDecimalPolicy, financialDecimalSchema, compareFinancialDecimals, normalizeFinancialDecimal } from "./decimal";
import {
  FINANCIAL_REQUEST_CONTRACT, financialAnalyses, financialAssumptionSchema, financialBasisSchema, financialScheduleSchema,
  financialInputSchema, financialTimestamp,
  financialSourceRefSchema, financialScopeSchema,
} from "./model";

export const financialBounds = { versions: 32, rows: 10_000, items: 1000, scenarios: 10, drivers: 20, metrics: 500, budgetUnits: 20_000, bytes: MAX_RUN_JSON_BYTES } as const;
export function ensureFinancialSize(value: unknown) {
  if (Buffer.byteLength(canonicalize(value), "utf8") > financialBounds.bytes) throw new RangeError("Financial JSON exceeds 2 MiB");
}
const overrideSchema = z.object({ assumptionId: identifierSchema, value: financialDecimalSchema }).strict();
const disclosure = {
  author: shortTextSchema, declaredAt: financialTimestamp, rationale: shortTextSchema,
  evidence: z.array(financialSourceRefSchema).min(1).max(32),
};
export const financialRequestSchema = z.object({
  contract: z.literal(FINANCIAL_REQUEST_CONTRACT), subject: identifierSchema, scope: financialScopeSchema, basis: financialBasisSchema,
  decimalPolicy: z.object({
    id: z.literal(financialDecimalPolicy.id), version: z.literal(financialDecimalPolicy.version),
  }).strict(),
  analyses: z.array(z.enum(financialAnalyses)).min(1).max(12),
  data: z.object({ versions: z.array(z.object({ versionId: identifierSchema, checksum: sha256Schema }).strict()).max(32) }).strict(),
  assumptions: z.array(financialAssumptionSchema).max(1000), schedules: z.array(financialScheduleSchema).max(17),
  breakEven: z.object({ periodId: identifierSchema, fixedCostId: identifierSchema, unitPriceId: identifierSchema, variableUnitCostId: identifierSchema, basis: z.literal("ACCOUNTING"), wholeUnits: z.boolean() }).strict().nullable(),
  valuation: z.object({
    discountRateId: identifierSchema.nullable(), terminalValueTreatment: z.enum(["EXPLICIT_DISPOSAL_SCHEDULE", "EXPLICIT_ZERO"]),
    solver: z.object({
      policy: z.literal("financial-irr-bisection-v1"), version: z.literal("1.0.0"),
      lowerRate: z.literal("-0.9999"), upperRate: z.literal("100"),
      maxIterations: z.literal(256), rateTolerance: z.literal("0.000000000001"), normalizedResidualTolerance: z.literal("0.0000000001"),
    }).strict().nullable(),
  }).strict().nullable(),
  cashRequirement: z.object({ initialCashId: identifierSchema, reserveId: identifierSchema, financingBasis: z.enum(["GROSS_PRE_FINANCING", "RESIDUAL_COMMITTED_ONLY"]) }).strict().nullable(),
  scenarios: z.array(z.object({ id: identifierSchema, label: shortTextSchema, ...disclosure, overrides: z.array(overrideSchema).min(1).max(1000) }).strict()).max(9),
  sensitivity: z.array(z.object({
    id: identifierSchema, ...disclosure, assumptionId: identifierSchema, low: financialDecimalSchema, base: financialDecimalSchema, high: financialDecimalSchema,
    targets: z.array(z.enum(financialAnalyses).exclude(["SCENARIOS", "SENSITIVITY"])).min(1).max(10),
  }).strict()).max(20),
}).strict().superRefine((request, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) fail(`Duplicate ${label}`); };
  unique(request.analyses, "analyses"); unique(request.data.versions.map((pin) => pin.versionId), "version pins");
  unique(request.assumptions.map((entry) => entry.id), "assumptions"); unique(request.schedules.map((entry) => entry.id), "schedules");
  unique(request.schedules.map((entry) => entry.kind), "schedule categories");
  unique(request.scenarios.map((entry) => entry.id), "scenarios"); unique(request.sensitivity.map((entry) => entry.id), "sensitivity IDs");
  unique(request.sensitivity.map((entry) => entry.assumptionId), "sensitivity drivers");
  const periods = new Set([request.basis.t0.id, ...request.basis.periods.map((period) => period.id)]);
  const assumptions = new Map(request.assumptions.map((entry) => [entry.id, entry]));
  const pins = new Map(request.data.versions.map((pin) => [pin.versionId, pin.checksum]));
  const refs = [...request.assumptions.flatMap((entry) => entry.evidence), ...request.schedules.flatMap((entry) => entry.evidence),
    ...request.scenarios.flatMap((entry) => entry.evidence), ...request.sensitivity.flatMap((entry) => entry.evidence)];
  const inputIdentities = new Map<string, string>();
  for (const ref of refs) {
    const identity = `${ref.versionId}:${ref.checksum}`;
    if (inputIdentities.has(ref.inputId) && inputIdentities.get(ref.inputId) !== identity) fail("One evidence input ID cannot name different exact versions/hashes");
    inputIdentities.set(ref.inputId, identity);
  }
  for (const ref of refs) if (pins.get(ref.versionId) !== ref.checksum) fail("Evidence must resolve to an exact requested version/hash");
  for (const assumption of request.assumptions) {
    if (!periods.has(assumption.periodId)) fail("Assumption uses an unknown period");
    if (("currency" in assumption.unit) && assumption.unit.currency !== request.basis.currency) fail("No cross-currency financial models");
    if (assumption.unit.kind === "PERIOD_RATE" && assumption.unit.frequency !== request.basis.periods[0]!.frequency) fail("Rate frequency must equal model frequency");
    if ((assumption.timingBasis === "T0") !== (assumption.periodId === request.basis.t0.id)) fail("t0 amounts require explicit T0 timing; other periods cannot use it");
    if (["SALES_VOLUME", "UNIT_PRICE", "FIXED_COST", "VARIABLE_UNIT_COST", "CASH_RESERVE", "INITIAL_CASH"].includes(assumption.purpose)
      && assumption.value !== null && compareFinancialDecimals(assumption.value, "0") < 0) fail("Physical sales, prices, fixed costs, reserves and initial cash cannot be negative");
  }
  const entryIds: string[] = [];
  const consumedOperands: string[] = [];
  for (const schedule of request.schedules) {
    unique(schedule.coveredPeriods, "covered periods");
    if (schedule.coveredPeriods.some((period) => !periods.has(period))) fail("Schedule uses unknown covered periods");
    if (schedule.completeness === "COMPLETE" && schedule.coveredPeriods.length !== periods.size) fail("Complete schedule must explicitly cover t0 and the entire horizon");
    for (const entry of schedule.entries) {
      entryIds.push(entry.id);
      if (!schedule.coveredPeriods.includes(entry.periodId)) fail("Entry lies outside declared schedule coverage");
      const amount = entry.amount;
      const operands = amount.mode === "DECLARED_AMOUNT" ? [assumptions.get(amount.assumptionId)] : [assumptions.get(amount.quantityId), assumptions.get(amount.priceId)];
      if (operands.some((operand) => !operand || operand.periodId !== entry.periodId)) fail("Entry requires same-period explicit assumptions");
      if (amount.mode === "DECLARED_AMOUNT") {
        consumedOperands.push(amount.assumptionId);
        if (operands[0]?.unit.kind !== "MONEY") fail("Declared schedule amount must be monetary");
        if (schedule.kind === "NET_REVENUE" && operands[0]?.purpose !== "DECLARED_REVENUE") fail("Revenue amount must be explicitly declared revenue");
      } else {
        consumedOperands.push(amount.quantityId);
        const [quantity, price] = operands;
        if (quantity?.purpose !== "SALES_VOLUME" || quantity.unit.kind !== "QUANTITY" || price?.purpose !== "UNIT_PRICE" || price.unit.kind !== "UNIT_PRICE"
          || quantity.unit.salesUnit !== price.unit.salesUnit) fail("Quantity-price requires explicitly declared compatible sales volume and unit price");
        if (schedule.kind !== "NET_REVENUE") fail("v1 quantity-price schedule is revenue only; costs require explicit monetary schedules");
      }
      const accrual = ["NET_REVENUE", "COGS", "OPERATING_EXPENSE", "DEPRECIATION", "FINANCE_EXPENSE", "TAX_EXPENSE", "OTHER_INCOME", "OTHER_EXPENSE"].includes(schedule.kind);
      if (accrual) {
        if (operands.some((operand) => operand?.timingBasis !== "ACCRUAL")) fail("Accounting entries need explicit accrual timing");
      } else if (operands.some((operand) => operand?.timingBasis === "ACCRUAL")) fail("Cash schedules cannot contain accrual-only assumptions");
    }
  }
  unique(entryIds, "line item IDs across schedules");
  unique(consumedOperands, "consumed monetary/quantity operands; no double counting across classifications");
  if (entryIds.length > financialBounds.items) fail("At most 1000 line items across all schedules");
  const requirePurpose = (id: string, purpose: string) => { if (assumptions.get(id)?.purpose !== purpose) fail(`Reference requires ${purpose}`); };
  if (request.breakEven) {
    requirePurpose(request.breakEven.fixedCostId, "FIXED_COST"); requirePurpose(request.breakEven.unitPriceId, "UNIT_PRICE"); requirePurpose(request.breakEven.variableUnitCostId, "VARIABLE_UNIT_COST");
    const operands = [request.breakEven.fixedCostId, request.breakEven.unitPriceId, request.breakEven.variableUnitCostId].map((id) => assumptions.get(id));
    if (!periods.has(request.breakEven.periodId) || request.breakEven.periodId === request.basis.t0.id || operands.some((entry) => entry?.periodId !== request.breakEven?.periodId)) fail("Break-even needs one common non-t0 period");
    const price = operands[1]?.unit; const cost = operands[2]?.unit;
    if (price?.kind === "UNIT_PRICE" && cost?.kind === "UNIT_PRICE" && price.salesUnit !== cost.salesUnit) fail("Break-even sales units must match");
  }
  if (request.valuation?.discountRateId !== null && request.valuation?.discountRateId !== undefined) requirePurpose(request.valuation.discountRateId, "DISCOUNT_RATE");
  if (request.cashRequirement) {
    requirePurpose(request.cashRequirement.initialCashId, "INITIAL_CASH"); requirePurpose(request.cashRequirement.reserveId, "CASH_RESERVE");
    if (assumptions.get(request.cashRequirement.initialCashId)?.periodId !== request.basis.t0.id || assumptions.get(request.cashRequirement.reserveId)?.periodId !== request.basis.t0.id) fail("Initial cash and fixed reserve must be declared at t0");
  }
  for (const scenario of request.scenarios) {
    unique(scenario.overrides.map((entry) => entry.assumptionId), "scenario override targets");
    for (const override of scenario.overrides) if (!assumptions.has(override.assumptionId)) fail("Scenario cannot introduce undeclared drivers");
  }
  for (const override of [
    ...request.scenarios.flatMap((scenario) => scenario.overrides),
    ...request.sensitivity.flatMap((driver) => [driver.low, driver.base, driver.high].map((value) => ({ assumptionId: driver.assumptionId, value }))),
  ]) {
    const target = assumptions.get(override.assumptionId);
    if (target && ["SALES_VOLUME", "UNIT_PRICE", "FIXED_COST", "VARIABLE_UNIT_COST", "CASH_RESERVE", "INITIAL_CASH"].includes(target.purpose)
      && compareFinancialDecimals(override.value, "0") < 0) fail("Scenario/sensitivity cannot introduce invalid negative physical or reserve inputs");
  }
  for (const driver of request.sensitivity) {
    const assumption = assumptions.get(driver.assumptionId);
    if (!assumption || assumption.value === null || normalizeFinancialDecimal(driver.base) !== normalizeFinancialDecimal(assumption.value)) fail("Sensitivity base must equal a declared available base assumption");
    if (compareFinancialDecimals(driver.low, driver.base) >= 0 || compareFinancialDecimals(driver.base, driver.high) >= 0) fail("Sensitivity requires explicit low < base < high");
    unique(driver.targets, "sensitivity targets");
  }
  if (request.analyses.includes("SCENARIOS") !== (request.scenarios.length > 0)) fail("Scenario analysis and explicit scenarios must be selected together");
  if (request.analyses.includes("SENSITIVITY") !== (request.sensitivity.length > 0)) fail("Sensitivity analysis and explicit drivers must be selected together");
});
export type FinancialRequest = z.infer<typeof financialRequestSchema>;
const byId = <T extends { id: string }>(values: T[]) => [...values].sort((a, b) => compareText(a.id, b.id));
const sortRefs = <T>(values: T[]) => [...new Map(values.map((entry) => [canonicalize(entry), entry])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
export function financialWorkUnits(request: FinancialRequest): number {
  const rows = request.assumptions.length + request.schedules.reduce((sum, schedule) => sum + schedule.entries.length, 0);
  const executions = 1 + request.scenarios.length + 3 * request.sensitivity.reduce((sum, driver) => sum + driver.targets.length, 0);
  const usesIrr = request.analyses.includes("IRR") || request.sensitivity.some((driver) => driver.targets.includes("IRR"));
  const solver = usesIrr ? (request.valuation?.solver?.maxIterations ?? 256) * (request.basis.periods.length + 1) : 0;
  const work = executions * (rows + request.basis.periods.length * request.analyses.length + solver) + request.data.versions.length;
  if (rows * executions > financialBounds.rows || work > financialBounds.budgetUnits) throw new RangeError("Financial expanded rows/work budget exceeded");
  return work;
}
export function normalizeFinancialRequest(raw: unknown, evaluatedAt: string) {
  ensureFinancialSize(raw); financialTimestamp.parse(evaluatedAt);
  const parsed = financialRequestSchema.parse(raw);
  for (const declaration of [...parsed.assumptions, ...parsed.scenarios, ...parsed.sensitivity]) if (declaration.declaredAt > evaluatedAt) throw new RangeError("Financial declaration cannot be from the future");
  const normalized: FinancialRequest = {
    ...parsed, analyses: [...parsed.analyses].sort(compareText),
    data: { versions: [...parsed.data.versions].sort((a, b) => compareText(a.versionId, b.versionId)) },
    assumptions: byId(parsed.assumptions).map((entry) => ({
      ...entry, value: entry.value === null ? null : normalizeFinancialDecimal(entry.value), evidence: sortRefs(entry.evidence),
      limitations: [...new Set(entry.limitations)].sort(compareText),
    })),
    schedules: byId(parsed.schedules).map((schedule) => ({ ...schedule, coveredPeriods: [...schedule.coveredPeriods].sort(compareText), evidence: sortRefs(schedule.evidence), entries: byId(schedule.entries) })),
    scenarios: byId(parsed.scenarios).map((scenario) => ({ ...scenario, evidence: sortRefs(scenario.evidence), overrides: [...scenario.overrides].sort((a, b) => compareText(a.assumptionId, b.assumptionId)).map((entry) => ({ ...entry, value: normalizeFinancialDecimal(entry.value) })) })),
    sensitivity: byId(parsed.sensitivity).map((entry) => ({ ...entry, evidence: sortRefs(entry.evidence), low: normalizeFinancialDecimal(entry.low), base: normalizeFinancialDecimal(entry.base), high: normalizeFinancialDecimal(entry.high), targets: [...entry.targets].sort(compareText) })),
  };
  financialWorkUnits(normalized);
  return { normalized, evaluatedAt, requestHash: canonicalHash({ normalized, evaluatedAt }) };
}
export function normalizeFinancialInputs(raw: unknown, request: FinancialRequest) {
  ensureFinancialSize(raw);
  const inputs = z.array(financialInputSchema).max(32).parse(raw).sort((a, b) => compareText(a.id, b.id));
  if (new Set(inputs.map((input) => input.id)).size !== inputs.length || new Set(inputs.map((input) => input.ref.id)).size !== inputs.length) throw new RangeError("Unique financial input IDs and versions required");
  const pins = new Map(request.data.versions.map((entry) => [entry.versionId, entry.checksum]));
  for (const input of inputs) {
    if (pins.get(input.ref.id) !== input.checksum?.value) throw new RangeError("Financial descriptor does not match requested exact version/hash");
    if (input.coverage) {
      input.coverage.countryCodes.sort(compareText); input.coverage.regionCodes.sort(compareText);
    }
  }
  const refs = [...request.assumptions.flatMap((entry) => entry.evidence), ...request.schedules.flatMap((entry) => entry.evidence),
    ...request.scenarios.flatMap((entry) => entry.evidence), ...request.sensitivity.flatMap((entry) => entry.evidence)];
  for (const ref of refs) {
    const input = inputs.find((entry) => entry.id === ref.inputId);
    if (input && (input.ref.id !== ref.versionId || input.checksum?.value !== ref.checksum)) throw new RangeError("Financial evidence input ID/version/hash mismatch");
  }
  return inputs;
}
