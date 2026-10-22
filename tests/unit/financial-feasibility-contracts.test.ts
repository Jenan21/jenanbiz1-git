import { describe, expect, it } from "vitest";
import {
  assessFinancialPrerequisites, buildFinancialFoundationRecord, buildFinancialFoundationResult, classifyFinancialIrrCashFlows,
  financialBounds, financialFoundationResultSchema, financialMetricSchema, financialRequestSchema, financialWorkUnits,
  normalizeFinancialRequest, validateFinancialFoundationResult, type FinancialRequest,
} from "@/services/analysis-engines/financial-feasibility";
import { canonicalHash, canonicalize, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { runRecordSchema } from "@/services/analysis-engines/shared/run-record";
import { financialAssumption, financialContext, financialDisclosure, financialInputs, financialRequest } from "./support/financial-feasibility-fixtures";

describe("Financial M1 strict model contracts and accounting", () => {
  it("accepts the complete explicit synthetic model but computes no financial result", () => {
    const request = financialRequest();
    expect(financialRequestSchema.parse(request)).toEqual(request);
    const result = buildFinancialFoundationResult(request, financialInputs(), financialContext);
    expect(result.metrics).toHaveLength(10);
    for (const metric of result.metrics) {
      expect(metric.reasons).toEqual(["M1_CALCULATIONS_DEFERRED"]);
      expect(metric.status).toBe("NOT_COMPUTABLE"); expect(metric.value).toBeNull(); expect(metric.confidence).toBeNull();
    }
    expect(result.rights.allowExport).toBe(false);
    expect(validateFinancialFoundationResult(result)).toEqual(result);
  });
  const invalid: [string, (request: FinancialRequest) => void][] = [
    ["cross currency", (r) => { r.assumptions[0]!.unit = { kind: "MONEY", currency: "USD" }; }],
    ["unit/purpose mismatch", (r) => { r.assumptions[0]!.unit = { kind: "QUANTITY", salesUnit: "people" }; }],
    ["mixed rate period", (r) => { r.assumptions.find((a) => a.id === "rate")!.unit = { kind: "PERIOD_RATE", frequency: "ANNUAL" }; }],
    ["ambiguous t0 timing", (r) => { r.assumptions[0]!.timingBasis = "T0"; }],
    ["unknown period", (r) => { r.assumptions[0]!.periodId = "missing"; }],
    ["negative fixed cost", (r) => { r.assumptions.find((a) => a.id === "fixed")!.value = "-1"; }],
    ["mismatched break-even units", (r) => { r.assumptions.find((a) => a.id === "variable")!.unit = { kind: "UNIT_PRICE", currency: "SAR", salesUnit: "other" }; }],
    ["break-even period mismatch", (r) => { r.breakEven!.periodId = "t0"; }],
    ["duplicate assumptions", (r) => { r.assumptions.push(r.assumptions[0]!); }],
    ["duplicate analyses", (r) => { r.analyses.push("CAPEX"); }],
    ["duplicate version pins", (r) => { r.data.versions.push(r.data.versions[0]!); }],
    ["wrong version checksum", (r) => { r.data.versions[0]!.checksum = "b".repeat(64); }],
    ["duplicate categories", (r) => { r.schedules[1]!.kind = r.schedules[0]!.kind; }],
    ["duplicate line items", (r) => { r.schedules[1]!.entries[0]!.id = r.schedules[0]!.entries[0]!.id; }],
    ["double counted accounting amount", (r) => { r.schedules[2]!.entries[0]!.amount = { mode: "DECLARED_AMOUNT", assumptionId: "cogs" }; }],
    ["double counted cash amount", (r) => { r.schedules.find((s) => s.kind === "OPERATING_PAYMENTS")!.entries[0]!.amount = { mode: "DECLARED_AMOUNT", assumptionId: "collections" }; }],
    ["cash as accrual revenue", (r) => { r.schedules[0]!.entries[0]!.amount = { mode: "DECLARED_AMOUNT", assumptionId: "collections" }; }],
    ["accrual as cash", (r) => { r.schedules.find((s) => s.kind === "OPERATING_COLLECTIONS")!.entries[0]!.amount = { mode: "DECLARED_AMOUNT", assumptionId: "opex" }; }],
    ["empty complete not disclosed", (r) => { r.schedules.find((s) => s.kind === "CASH_TAX")!.noApplicableItems = false; }],
    ["missing schedule carries value", (r) => { r.schedules[0]!.completeness = "MISSING"; }],
    ["uncovered schedule item", (r) => { r.schedules[0]!.coveredPeriods = ["t0"]; }],
    ["duplicate coverage IDs", (r) => { r.schedules[0]!.coveredPeriods.push("p1"); }],
    ["wrong t0 date", (r) => { r.basis.t0.date = "2026-09-01"; }],
    ["mixed timezone", (r) => { r.basis.periods[0]!.timeZone = "UTC"; }],
    ["incomplete calendar period", (r) => { r.basis.periods[0]!.endDate = "2026-10-15"; }],
    ["unsupported quarterly basis", (r) => { Object.assign(r.basis.periods[0]!, { frequency: "QUARTERLY", endDate: "2027-01-01" }); }],
    ["t0 initial cash required", (r) => { r.cashRequirement!.initialCashId = "opex"; }],
    ["wrong discount reference purpose", (r) => { r.valuation!.discountRateId = "price"; }],
  ];
  it.each(invalid)("rejects %s", (_label, mutate) => {
    const request = financialRequest(); mutate(request);
    expect(financialRequestSchema.safeParse(request).success).toBe(false);
  });
  it.each(["inferredRevenue", "population", "competitors", "demand", "successProbability", "investmentRecommendation"])("rejects unsupported request field %s", (key) => {
    expect(financialRequestSchema.safeParse({ ...financialRequest(), [key]: 100 }).success).toBe(false);
  });
  it("accepts explicit signed accounting losses, not hidden missing-as-zero", () => {
    const request = financialRequest(); request.assumptions[0]!.value = "-10";
    expect(financialRequestSchema.safeParse(request).success).toBe(true);
    request.assumptions[0]!.value = null;
    const result = buildFinancialFoundationResult(request, financialInputs(), financialContext);
    expect(result.metrics.find((m) => m.analysis === "REVENUE")!.reasons).toContain("MISSING_REQUIRED_INPUT");
    expect(result.metrics.find((m) => m.analysis === "CAPEX")!.reasons).toEqual(["M1_CALCULATIONS_DEFERRED"]);
  });
  it.each([["missing", null], ["zero", "0"]])("distinguishes %s fixed cost", (_label, value) => {
    const request = financialRequest(); request.assumptions.find((a) => a.id === "fixed")!.value = value;
    expect(assessFinancialPrerequisites(request, financialInputs(), "BREAK_EVEN").ready).toBe(value !== null);
  });
  it.each(["0", "8", "7"])("blocks nonpositive contribution at price %s", (price) => {
    const request = financialRequest(); request.assumptions.find((a) => a.id === "price")!.value = price;
    expect(assessFinancialPrerequisites(request, financialInputs(), "BREAK_EVEN").reasons).toContain("NONPOSITIVE_CONTRIBUTION");
  });
  it.each(["NPV", "IRR"] as const)("%s requires complete flows, rate and compatible time", (analysis) => {
    const request = financialRequest(); request.valuation!.discountRateId = null;
    expect(assessFinancialPrerequisites(request, financialInputs(), analysis).reasons).toContain("MISSING_REQUIRED_INPUT");
    request.valuation!.discountRateId = "rate"; request.assumptions.find((a) => a.id === "rate")!.value = "-1";
    expect(assessFinancialPrerequisites(request, financialInputs(), analysis).reasons).toContain("INCOMPATIBLE_BASIS");
    request.assumptions.find((a) => a.id === "rate")!.value = "0";
    expect(assessFinancialPrerequisites(request, financialInputs(), analysis).ready).toBe(true);
    request.schedules.find((s) => s.kind === "OPERATING_PAYMENTS")!.completeness = "PARTIAL";
    expect(assessFinancialPrerequisites(request, financialInputs(), analysis).reasons).toContain("INCOMPLETE_SCHEDULE");
  });
  it("does not subtract working capital again in direct-cash mode", () => {
    const request = financialRequest(); request.schedules = request.schedules.filter((entry) => entry.kind !== "WORKING_CAPITAL_CHANGE");
    expect(assessFinancialPrerequisites(request, financialInputs(), "CASH_FLOW").ready).toBe(true);
    request.basis.cashMode = "ACCRUAL_BRIDGE";
    expect(assessFinancialPrerequisites(request, financialInputs(), "CASH_FLOW").reasons).toContain("MISSING_REQUIRED_INPUT");
  });
  it("does not require financing to measure the pre-financing cash requirement", () => {
    const request = financialRequest(); request.schedules = request.schedules.filter((entry) => !["COMMITTED_FINANCING", "DEBT_PAYMENTS", "DISTRIBUTIONS"].includes(entry.kind));
    expect(assessFinancialPrerequisites(request, financialInputs(), "CASH_REQUIREMENT").ready).toBe(true);
    request.cashRequirement!.financingBasis = "RESIDUAL_COMMITTED_ONLY";
    expect(assessFinancialPrerequisites(request, financialInputs(), "CASH_REQUIREMENT").reasons).toContain("MISSING_REQUIRED_INPUT");
  });
  it.each([
    [["-100", "60", "60"], []], [["-100", "0", "120"], []],
    [["-100", "230", "-132"], ["AMBIGUOUS_IRR", "NON_CONVENTIONAL_CASH_FLOWS"]],
    [["100", "-20", "1"], ["AMBIGUOUS_IRR", "NON_CONVENTIONAL_CASH_FLOWS"]],
    [["-100", "-10"], ["NON_CONVENTIONAL_CASH_FLOWS"]], [["0", "20"], ["NON_CONVENTIONAL_CASH_FLOWS"]],
    [["-100", null], ["MISSING_REQUIRED_INPUT"]],
  ])("does not select arbitrary IRR roots for %j", (values, expected) => expect(classifyFinancialIrrCashFlows(values)).toEqual(expected));
  it("requires end-period valuation timing and an explicit IRR solver policy", () => {
    const request = financialRequest(); request.assumptions.find((a) => a.id === "collections")!.timingBasis = "PERIOD_START";
    expect(assessFinancialPrerequisites(request, financialInputs(), "NPV").reasons).toContain("INCOMPATIBLE_BASIS");
    request.valuation!.solver = null;
    expect(assessFinancialPrerequisites(request, financialInputs(), "IRR").reasons).toContain("MISSING_REQUIRED_INPUT");
  });
});

describe("Financial M1 scenarios, bounds, hashes and unchanged history compatibility", () => {
  it("requires explicit disclosed scenario values and low/base/high sensitivity points", () => {
    const request = financialRequest();
    request.analyses.push("SCENARIOS", "SENSITIVITY");
    request.scenarios = [{ id: "declared-change", label: "Explicit price change, not a recommendation", ...structuredClone(financialDisclosure), overrides: [{ assumptionId: "price", value: "13" }] }];
    request.sensitivity = [{ id: "price-test", ...structuredClone(financialDisclosure), assumptionId: "price", low: "10", base: "12", high: "14", targets: ["BREAK_EVEN"] }];
    expect(financialRequestSchema.safeParse(request).success).toBe(true);
    request.sensitivity[0]!.base = "11";
    expect(financialRequestSchema.safeParse(request).success).toBe(false);
    request.sensitivity[0]!.base = "12"; request.scenarios[0]!.overrides[0]!.value = "-1";
    expect(financialRequestSchema.safeParse(request).success).toBe(false);
  });
  it("accepts explicitly declared quantity-price revenue with matching sales units only", () => {
    const request = financialRequest(); const quantity = financialAssumption("quantity", "10");
    quantity.purpose = "SALES_VOLUME"; quantity.unit = { kind: "QUANTITY", salesUnit: "service" }; request.assumptions.push(quantity);
    request.schedules[0]!.entries[0]!.amount = { mode: "QUANTITY_PRICE", quantityId: "quantity", priceId: "price" };
    expect(financialRequestSchema.safeParse(request).success).toBe(true);
    quantity.unit.salesUnit = "person";
    expect(financialRequestSchema.safeParse(request).success).toBe(false);
  });
  it("bounds bytes before parsing and never truncates", () => {
    expect(() => normalizeFinancialRequest({ pad: "x".repeat(financialBounds.bytes + 1) }, financialContext.evaluatedAt)).toThrow(/2 MiB/);
    const request = financialRequest(); request.assumptions.push(...Array.from({ length: 1000 }, (_, index) => financialAssumption(`extra-${index}`)));
    expect(() => normalizeFinancialRequest(request, financialContext.evaluatedAt)).toThrow();
  });
  it("bounds combined expanded work across all scenarios/sensitivity/solver operations", () => {
    const request = financialRequest();
    request.basis.periods = Array.from({ length: 120 }, (_, index) => {
      const start = new Date(Date.UTC(2026, 9 + index, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(2026, 10 + index, 1)).toISOString().slice(0, 10);
      return { ...request.basis.periods[0]!, id: `p${index + 1}`, startDate: start, endDate: end };
    });
    expect(() => financialWorkUnits(request)).toThrow(/budget/);
  });
  it("budgets numerical work requested only by a sensitivity target as well", () => {
    const request = financialRequest(); request.analyses = ["BREAK_EVEN", "SENSITIVITY"];
    request.sensitivity = [{ id: "price-test", ...structuredClone(financialDisclosure), assumptionId: "price", low: "10", base: "12", high: "14", targets: ["BREAK_EVEN"] }];
    const withoutIrr = financialWorkUnits(request);
    request.sensitivity[0]!.targets = ["IRR"];
    expect(financialWorkUnits(request)).toBe(withoutIrr + 4 * 256 * 2);
  });
  it("rejects future declarations", () => {
    const request = financialRequest(); request.assumptions[0]!.declaredAt = "2030-01-01T00:00:00.000Z";
    expect(() => normalizeFinancialRequest(request, financialContext.evaluatedAt)).toThrow(/future/);
  });
  it("normalizes semantically unordered collections and decimal spellings without mutating caller data", () => {
    const request = financialRequest(); const snapshot = structuredClone(request);
    const first = buildFinancialFoundationResult(request, financialInputs(), financialContext);
    request.assumptions.reverse(); request.schedules.reverse(); request.analyses.reverse();
    for (const schedule of request.schedules) schedule.coveredPeriods.reverse();
    request.assumptions.find((a) => a.id === "price")!.value = "12.000";
    const second = buildFinancialFoundationResult(request, financialInputs(), { ...financialContext, runId: "other" });
    expect(second.determinism).toEqual(first.determinism);
    expect(first.request.normalized).toEqual(normalizeFinancialRequest(snapshot, financialContext.evaluatedAt).normalized);
    first.inputs[0]!.source.name = "Changed"; expect(financialInputs()[0]!.source.name).not.toBe("Changed");
  });
  it.each(["requestHash", "inputsHash", "outputHash"] as const)("rejects changed %s", (key) => {
    const result = buildFinancialFoundationResult(financialRequest(), financialInputs(), financialContext);
    result.determinism[key] = "b".repeat(64);
    expect(() => validateFinancialFoundationResult(result)).toThrow(/mismatch/);
  });
  it("rejects rehashed fabricated rights, metrics and input descriptors", () => {
    const result = buildFinancialFoundationResult(financialRequest(), financialInputs(), financialContext);
    result.rights = { allowExport: true, denials: [] };
    result.determinism.outputHash = canonicalHash(omitKeys(result, ["runId", "timing", "determinism"]));
    expect(() => validateFinancialFoundationResult(result)).toThrow();
    const descriptors = financialInputs(); descriptors[0]!.checksum!.value = "b".repeat(64);
    expect(() => buildFinancialFoundationResult(financialRequest(), descriptors, financialContext)).toThrow(/exact/);
  });
  it("preserves exact hashes when a missing descriptor returns, without changing absent assumptions", () => {
    const request = financialRequest();
    const result = buildFinancialFoundationResult(request, [], financialContext);
    expect(result.metrics.find((m) => m.analysis === "CAPEX")!.reasons).toContain("INPUT_NOT_AVAILABLE");
    expect(result.metrics.every((m) => m.value === null)).toBe(true);
    const zero = structuredClone(request); zero.assumptions.find((a) => a.id === "fixed")!.value = "0";
    expect(normalizeFinancialRequest(zero, financialContext.evaluatedAt).requestHash).not.toBe(normalizeFinancialRequest(request, financialContext.evaluatedAt).requestHash);
  });
  it("retains decimal strings in existing unchanged Shared RunRecord JSON without monetary numeric casts", () => {
    const result = buildFinancialFoundationResult(financialRequest(), financialInputs(), financialContext);
    const record = buildFinancialFoundationRecord(result, { actor: { kind: "USER", id: "synthetic-owner" }, createdAt: financialContext.evaluatedAt });
    const roundTrip: unknown = JSON.parse(canonicalize(record));
    expect(runRecordSchema.parse(roundTrip)).toEqual(record);
    expect(record.request).toEqual(result.request); expect(record.result).toEqual(result);
    expect(record.inputs[0]!.checksum).toBe(result.inputs[0]!.checksum!.value);
    expect(record.requestHash).toBe(result.determinism.requestHash);
    expect(record.runtime).toHaveProperty("decimalPolicy.rounding", "HALF_EVEN");
  });
  it("cannot expose a computed monetary result during M1 or put zero in an unavailable state", () => {
    const result = buildFinancialFoundationResult(financialRequest(), financialInputs(), financialContext);
    const metric = result.metrics[0]!;
    expect(financialMetricSchema.safeParse({ ...metric, value: "0" }).success).toBe(false);
    expect(financialFoundationResultSchema.safeParse({ ...result, metrics: [{ ...metric, status: "COMPUTED" }] }).success).toBe(false);
  });
});
