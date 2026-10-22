import { describe, expect, it } from "vitest";
import {
  buildFinancialCalculationResult, compareFinancialDecimals, financialAbsolute, financialCalculationResultSchema, solveFinancialIrrBisection,
  subtractFinancialDecimals,
  validateFinancialCalculationResult,
} from "@/services/analysis-engines/financial-feasibility";
import { financialContext, financialDisclosure, financialInputs, financialRequest } from "./support/financial-feasibility-fixtures";

const result = (request = financialRequest()) => buildFinancialCalculationResult(request, financialInputs(), financialContext);
const metric = (value: ReturnType<typeof result>, key: string) => value.metrics.find((entry) => entry.key === key)!;
const setScheduleAmount = (request: ReturnType<typeof financialRequest>, kind: string, value: string) => {
  const schedule = request.schedules.find((entry) => entry.kind === kind)!;
  const amount = schedule.entries[0]?.amount;
  if (amount?.mode !== "DECLARED_AMOUNT") throw new Error(`Expected a declared-amount fixture for ${kind}`);
  const assumption = request.assumptions.find((entry) => entry.id === amount.assumptionId)!;
  assumption.value = value;
};
function extendToSecondPeriod(request: ReturnType<typeof financialRequest>) {
  request.basis.periods.push({
    kind: "INTERVAL", id: "p2", startDate: "2026-11-01", endDate: "2026-12-01",
    frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh",
  });
  const payment = request.assumptions.find((entry) => entry.id === "payments")!;
  payment.periodId = "p2";
  request.schedules.forEach((schedule) => { schedule.coveredPeriods.push("p2"); });
  const payments = request.schedules.find((entry) => entry.kind === "OPERATING_PAYMENTS")!;
  payments.entries[0]!.periodId = "p2";
}

describe("Financial M3 deterministic calculation engine", () => {
  it("calculates explicit schedules, cash flow, margins, break-even and funding need", () => {
    const output = result();
    expect(output.phase).toBe("M3_CALCULATIONS");
    expect(metric(output, "capex.t0").value).toBe("100.00");
    expect(metric(output, "opex.p1").value).toBe("30.00");
    expect(metric(output, "revenue.p1").value).toBe("120.00");
    expect(metric(output, "cash_flow.t0").value).toBe("-100.00");
    expect(metric(output, "cash_flow.p1").value).toBe("80.00");
    expect(metric(output, "gross.margin.p1").value).toBe("66.666667");
    expect(metric(output, "operating.margin.p1").value).toBe("33.333333");
    expect(metric(output, "net.margin.p1").value).toBe("33.333333");
    expect(metric(output, "break_even.units").value).toBe("8");
    expect(metric(output, "break_even.units").details.find((entry) => entry.key === "breakEvenSales")?.value).toBe("96.00");
    expect(metric(output, "cash_requirement.amount").value).toBe("85.00");
    expect(output.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(output.status).toBe("COMPLETED_WITH_GAPS");
    for (const value of output.metrics.filter((entry) => entry.value !== null)) {
      expect(value.method.version).toBe("1.0.0");
      expect(value.evidence.length).toBeGreaterThan(0);
      expect(value.confidence).not.toBeNull();
      expect(value.limitations.length).toBeGreaterThan(0);
    }
  });
  it("does not substitute missing assumptions or incomplete schedules with zero", () => {
    const request = financialRequest();
    request.assumptions.find((entry) => entry.id === "net-sales")!.value = null;
    request.schedules.find((entry) => entry.kind === "OPERATING_PAYMENTS")!.completeness = "PARTIAL";
    const output = result(request);
    expect(metric(output, "revenue.p1")).toMatchObject({ status: "NOT_COMPUTABLE", value: null, reasons: ["MISSING_REQUIRED_INPUT"] });
    expect(metric(output, "cash_flow.t0")).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    expect(metric(output, "capex.t0").value).toBe("100.00");
  });
  it("rounds whole-unit break-even upward and permits zero fixed cost", () => {
    const request = financialRequest();
    expect(metric(result(request), "break_even.units").value).toBe("8");
    request.assumptions.find((entry) => entry.id === "fixed")!.value = "0";
    expect(metric(result(request), "break_even.units").value).toBe("0");
  });
  it("blocks margins with a zero or negative denominator", () => {
    const request = financialRequest(); setScheduleAmount(request, "NET_REVENUE", "0");
    const output = result(request);
    for (const name of ["gross", "operating", "net"]) {
      expect(metric(output, `${name}.margin.p1`)).toMatchObject({ status: "NOT_COMPUTABLE", value: null, reasons: ["ZERO_DENOMINATOR"] });
    }
  });
  it("calculates NPV including t0 and period-end simple payback without interpolation", () => {
    const request = financialRequest();
    setScheduleAmount(request, "OPERATING_COLLECTIONS", "150");
    const output = result(request);
    expect(metric(output, "npv.project").value).toBe("8.91");
    expect(metric(output, "payback.periods").value).toBe("1");
    expect(metric(output, "payback.periods").details.find((entry) => entry.key === "crossingPeriodId")?.value).toBe("p1");
    request.assumptions.find((entry) => entry.id === "rate")!.value = "0";
    expect(metric(result(request), "npv.project").value).toBe("10.00");
    request.assumptions.find((entry) => entry.id === "rate")!.value = "-0.5";
    expect(metric(result(request), "npv.project").value).toBe("120.00");
  });
  it("reports no payback within the horizon and a non-applicable zero initial outlay distinctly", () => {
    const request = financialRequest();
    expect(metric(result(request), "payback.periods")).toMatchObject({ status: "NOT_COMPUTABLE", value: null, reasons: ["NOT_REACHED_WITHIN_HORIZON"] });
    request.schedules.find((entry) => entry.kind === "CAPEX")!.entries = [];
    request.schedules.find((entry) => entry.kind === "CAPEX")!.noApplicableItems = true;
    expect(metric(result(request), "payback.periods")).toMatchObject({ status: "NOT_COMPUTABLE", value: null, reasons: ["NOT_APPLICABLE"] });
  });
  it("records a later post-payback deficit rather than treating the first crossing as permanent", () => {
    const request = financialRequest(); extendToSecondPeriod(request);
    setScheduleAmount(request, "OPERATING_COLLECTIONS", "150");
    request.assumptions.find((entry) => entry.id === "payments")!.value = "60";
    const payback = metric(result(request), "payback.periods");
    expect(payback.value).toBe("1");
    expect(payback.details.find((entry) => entry.key === "firstLaterDeficitPeriodId")?.value).toBe("p2");
  });
  it("solves a conventional IRR deterministically and never chooses multiple roots", () => {
    const request = financialRequest(); setScheduleAmount(request, "OPERATING_COLLECTIONS", "150");
    const output = result(request);
    expect(metric(output, "irr.per_period").value).toBe("10.000000");
    const multiple = financialRequest(); extendToSecondPeriod(multiple);
    setScheduleAmount(multiple, "OPERATING_COLLECTIONS", "230");
    multiple.assumptions.find((entry) => entry.id === "payments")!.value = "132";
    const invalid = result(multiple);
    expect(metric(invalid, "irr.per_period")).toMatchObject({
      status: "NOT_COMPUTABLE", value: null, reasons: ["AMBIGUOUS_IRR", "NON_CONVENTIONAL_CASH_FLOWS"],
    });
    const unbracketed = financialRequest(); setScheduleAmount(unbracketed, "OPERATING_COLLECTIONS", "1000040");
    expect(metric(result(unbracketed), "irr.per_period")).toMatchObject({ status: "NOT_COMPUTABLE", value: null, reasons: ["IRR_NOT_BRACKETED"] });
    const solved = solveFinancialIrrBisection(["-100", "110"], "-0.9999", "100", 256, "0.000000000001", "0.0000000001");
    expect(solved.status).toBe("COMPUTED");
    expect(compareFinancialDecimals(financialAbsolute(subtractFinancialDecimals(solved.rate!, "0.1")), "0.000000000001")).toBeLessThanOrEqual(0);
  });
  it("runs only explicitly declared scenarios and one-at-a-time sensitivity points", () => {
    const request = financialRequest();
    request.analyses.push("SCENARIOS", "SENSITIVITY");
    request.scenarios = [{
      id: "declared-case", label: "Owner-declared case", ...structuredClone(financialDisclosure),
      overrides: [{ assumptionId: "price", value: "16" }],
    }];
    request.sensitivity = [{
      id: "price-band", ...structuredClone(financialDisclosure), assumptionId: "price",
      low: "9", base: "12", high: "15", targets: ["BREAK_EVEN", "REVENUE"],
    }];
    const output = result(request);
    expect(output.scenarios).toHaveLength(1);
    expect(output.scenarios[0]!.metrics.find((entry) => entry.key === "break_even.units")?.value).toBe("4");
    expect(output.sensitivities).toHaveLength(2);
    const breakEven = output.sensitivities.find((entry) => entry.target === "BREAK_EVEN")!;
    expect(breakEven.points.map((point) => point.metrics[0]!.value)).toEqual(["30", "8", "5"]);
    expect(breakEven.deltas[0]!.value).toBe("-25.000000");
    expect(output.sensitivities.find((entry) => entry.target === "REVENUE")!.points[0]!.metrics.find((entry) => entry.key === "revenue.p1")!.value).toBe("120.00");
    expect(request.assumptions.find((entry) => entry.id === "price")!.value).toBe("12");
  });
  it("measures residual funding only from explicitly committed financing", () => {
    const request = financialRequest();
    request.cashRequirement!.financingBasis = "RESIDUAL_COMMITTED_ONLY";
    const commitment = {
      ...structuredClone(financialDisclosure), id: "committed-cash", value: "100",
      unit: { kind: "MONEY" as const, currency: "SAR" as const }, periodId: "t0", timingBasis: "T0" as const,
      purpose: "EXPLICIT_AMOUNT" as const, evidenceNature: "DECLARED_ASSUMPTION" as const,
      approval: "OWNER_APPROVED" as const, method: { id: "owner-declared", version: "1" }, limitations: ["Synthetic committed funding fixture"],
    };
    request.assumptions.push(commitment);
    const schedule = request.schedules.find((entry) => entry.kind === "COMMITTED_FINANCING")!;
    schedule.noApplicableItems = false;
    schedule.entries.push({ id: "committed-cash-entry", periodId: "t0", amount: { mode: "DECLARED_AMOUNT", assumptionId: commitment.id } });
    expect(metric(result(request), "cash_requirement.amount").value).toBe("0.00");
    request.cashRequirement!.financingBasis = "GROSS_PRE_FINANCING";
    expect(metric(result(request), "cash_requirement.amount").value).toBe("85.00");
  });
  it("calculates explicitly compatible quantity-times-price revenue", () => {
    const request = financialRequest();
    const volume = {
      ...structuredClone(financialDisclosure), id: "volume", value: "10",
      unit: { kind: "QUANTITY" as const, salesUnit: "service" }, periodId: "p1", timingBasis: "ACCRUAL" as const,
      purpose: "SALES_VOLUME" as const, evidenceNature: "DECLARED_ASSUMPTION" as const,
      approval: "OWNER_APPROVED" as const, method: { id: "owner-declared", version: "1" }, limitations: ["Explicit synthetic unit volume"],
    };
    request.assumptions.push(volume);
    request.schedules.find((entry) => entry.kind === "NET_REVENUE")!.entries[0]!.amount = {
      mode: "QUANTITY_PRICE", quantityId: volume.id, priceId: "price",
    };
    expect(metric(result(request), "revenue.p1").value).toBe("120.00");
  });
  it("uses accrual bridge cash flow without double-subtracting depreciation or working capital", () => {
    const request = financialRequest(); request.basis.cashMode = "ACCRUAL_BRIDGE";
    const flows = result(request);
    expect(metric(flows, "cash_flow.p1").value).toBe("50.00");
    expect(metric(flows, "cash_flow.t0").value).toBe("-100.00");
    expect(metric(flows, "cash_flow.p1").method.id).toBe("financial-project-free-cash-flow");
  });
  it("preserves deterministic hashes and validates exact calculated output", () => {
    const first = result(); const second = result();
    expect(first.determinism).toEqual(second.determinism);
    expect(validateFinancialCalculationResult(first)).toEqual(first);
    expect(financialCalculationResultSchema.safeParse({ ...first, phase: "M1_FOUNDATION" }).success).toBe(false);
    expect(() => validateFinancialCalculationResult({ ...first, metrics: first.metrics.map((entry) => entry.key === "npv.project" ? { ...entry, value: "0" } : entry) })).toThrow(/mismatch/);
    const otherTiming = buildFinancialCalculationResult(financialRequest(), financialInputs(), {
      ...financialContext, runId: "other-financial-run",
      timing: { ...financialContext.timing, durationMs: 12 },
    });
    expect(otherTiming.determinism.outputHash).toBe(first.determinism.outputHash);
  });
});
