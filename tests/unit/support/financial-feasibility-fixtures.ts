import {
  type FinancialAssumption, type FinancialContext, type FinancialRequest, financialScheduleKinds,
} from "@/services/analysis-engines/financial-feasibility";
import { digest, evaluatedAt, makeInput } from "./analysis-engine-fixtures";

export const financialSource = { inputId: "dc:version-1", versionId: "version-1", checksum: digest, sourceRecordId: "synthetic-financial-record" };
export const financialDisclosure = {
  author: "Synthetic owner", declaredAt: "2026-10-01T00:00:00.000Z", rationale: "Explicit synthetic assumptions, not real financial acceptance",
  evidence: [financialSource],
};
export const financialContext: FinancialContext = {
  runId: "financial-m1-fixture", evaluatedAt, environment: "test",
  timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
};
export const financialInputs = () => [makeInput({ roles: ["financial.model-assumptions"], allowExport: false })];
export function financialAssumption(id: string, value: string | null = "100"): FinancialAssumption {
  return {
    id, value, unit: { kind: "MONEY", currency: "SAR" }, periodId: "p1", timingBasis: "ACCRUAL",
    purpose: "EXPLICIT_AMOUNT", evidenceNature: "DECLARED_ASSUMPTION", ...structuredClone(financialDisclosure),
    approval: "OWNER_APPROVED", method: { id: "owner-declared", version: "1" }, limitations: ["Synthetic fixture; assumed not realized"],
  };
}
export function financialRequest(): FinancialRequest {
  const assumptions = [
    financialAssumption("net-sales", "120"), financialAssumption("cogs", "40"), financialAssumption("opex", "30"),
    financialAssumption("depreciation", "10"), financialAssumption("collections", "120"), financialAssumption("payments", "40"),
    financialAssumption("initial-capex", "100"), financialAssumption("fixed", "30"), financialAssumption("price", "12"),
    financialAssumption("variable", "8"), financialAssumption("rate", "0.01"), financialAssumption("cash", "20"), financialAssumption("reserve", "5"),
  ];
  const find = (id: string) => assumptions.find((entry) => entry.id === id)!;
  find("net-sales").purpose = "DECLARED_REVENUE";
  for (const id of ["collections", "payments"]) find(id).timingBasis = "PERIOD_END";
  for (const id of ["initial-capex", "cash", "reserve"]) { find(id).timingBasis = "T0"; find(id).periodId = "t0"; }
  find("fixed").purpose = "FIXED_COST";
  for (const id of ["price", "variable"]) find(id).unit = { kind: "UNIT_PRICE", currency: "SAR", salesUnit: "service" };
  find("price").purpose = "UNIT_PRICE"; find("variable").purpose = "VARIABLE_UNIT_COST";
  find("rate").unit = { kind: "PERIOD_RATE", frequency: "MONTHLY" }; find("rate").purpose = "DISCOUNT_RATE";
  find("rate").timingBasis = "PERIOD_END";
  find("cash").purpose = "INITIAL_CASH"; find("reserve").purpose = "CASH_RESERVE";
  const scheduleOperands: Partial<Record<typeof financialScheduleKinds[number], string>> = {
    NET_REVENUE: "net-sales", COGS: "cogs", OPERATING_EXPENSE: "opex", DEPRECIATION: "depreciation",
    OPERATING_COLLECTIONS: "collections", OPERATING_PAYMENTS: "payments", CAPEX: "initial-capex",
  };
  return {
    contract: "jenan.financial-feasibility.request/v1", subject: "synthetic-financial-model",
    scope: {
      geography: { countryCode: "SA", authority: "synthetic", level: "COUNTRY", code: "SA", version: "1" },
      sector: { taxonomy: "synthetic", code: "service", version: "1" },
    },
    basis: {
      currency: "SAR", priceBasis: "NOMINAL", priceBaseDate: "2026-10-01", cashMode: "DIRECT_CASH", cashFlowBasis: "PROJECT_UNLEVERED",
      t0: { kind: "SNAPSHOT", id: "t0", date: "2026-10-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
      periods: [{ kind: "INTERVAL", id: "p1", startDate: "2026-10-01", endDate: "2026-11-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }],
    },
    decimalPolicy: { id: "financial-decimal-v1", version: "1.0.0" },
    analyses: ["CAPEX", "OPEX", "REVENUE", "CASH_FLOW", "MARGINS", "BREAK_EVEN", "PAYBACK", "NPV", "IRR", "CASH_REQUIREMENT"],
    data: { versions: [{ versionId: "version-1", checksum: digest }] },
    assumptions,
    schedules: financialScheduleKinds.map((kind) => {
      const id = scheduleOperands[kind]; const assumption = assumptions.find((entry) => entry.id === id);
      return {
        id: `schedule-${kind}`, kind, completeness: "COMPLETE", coveredPeriods: ["t0", "p1"], evidence: [structuredClone(financialSource)],
        noApplicableItems: !assumption,
        entries: assumption ? [{ id: `item-${assumption.id}`, periodId: assumption.periodId, amount: { mode: "DECLARED_AMOUNT", assumptionId: assumption.id } }] : [],
      };
    }),
    breakEven: { periodId: "p1", fixedCostId: "fixed", unitPriceId: "price", variableUnitCostId: "variable", basis: "ACCOUNTING", wholeUnits: true },
    valuation: {
      discountRateId: "rate", terminalValueTreatment: "EXPLICIT_ZERO",
      solver: { policy: "financial-irr-bisection-v1", version: "1.0.0", lowerRate: "-0.9999", upperRate: "100", maxIterations: 256, rateTolerance: "0.000000000001", normalizedResidualTolerance: "0.0000000001" },
    },
    cashRequirement: { initialCashId: "cash", reserveId: "reserve", financingBasis: "GROSS_PRE_FINANCING" },
    scenarios: [], sensitivity: [],
  };
}
