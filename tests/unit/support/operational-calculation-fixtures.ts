import type { OperationalRequest, OperationalValue } from "@/services/analysis-engines/operational-feasibility";
import { operationalEvidence, operationalRequest, operationalValue } from "./operational-feasibility-fixtures";
import { operationalDataset } from "./operational-data-fixtures";

export function addOperationalValue(request: OperationalRequest, id: string, amount: string | null, unit: OperationalValue["unit"]) {
  const value = { ...operationalValue(id, amount), unit };
  request.values.push(value);
  return value;
}
export function addOperationalSchedule(request: OperationalRequest, kind: OperationalRequest["schedules"][number]["kind"], entity: string, valueId: string) {
  request.schedules.push({
    id: `${kind.toLowerCase()}-schedule`, kind, interpretation: "PLAN", completeness: "COMPLETE",
    coveredPeriodIds: ["p1"], noApplicableItems: false, cohortId: null, evidence: [structuredClone(operationalEvidence)],
    rows: [{ id: `${kind.toLowerCase()}-row`, entityId: entity, valueId, periodId: "p1", siteId: "site-1",
      direction: "ADD", supplierStatus: kind === "SUPPLIER" ? "COMMITTED" : null,
      effectiveDate: kind === "SUPPLIER" || kind === "RECEIPTS" ? "2026-10-10" : null }],
  });
}
export function operationalCalculationRequest(): OperationalRequest {
  const request = operationalRequest();
  request.analyses = ["CAPACITY", "WORKFORCE", "SUPPLY", "INVENTORY", "REORDER", "QUALITY", "PREREQUISITES"];
  const time = (poolId: string): OperationalValue["unit"] => ({ kind: "RESOURCE_TIME", poolId, basis: "MINUTE" });
  addOperationalValue(request, "setup-1", "0", time("pool-1"));
  addOperationalValue(request, "unavailable-1", "0", time("pool-1"));
  addOperationalValue(request, "time-2", "360", time("pool-2"));
  addOperationalValue(request, "setup-2", "0", time("pool-2"));
  addOperationalValue(request, "unavailable-2", "0", time("pool-2"));
  addOperationalValue(request, "cycle-2", "2", { kind: "TIME_PER_UNIT", poolId: "pool-2", entity: "service", basis: "MINUTE" });
  request.network.stages.push({ id: "stage-2", poolId: "pool-2", outputId: "service" });
  for (const [kind, valueId, entity] of [["RESOURCE_TIME", "time-2", "pool-2"], ["CYCLE_TIME", "cycle-2", "service"]] as const) {
    request.schedules.find((s) => s.kind === kind)!.rows.push({
      id: `${valueId}-row`, periodId: "p1", siteId: "site-1", entityId: entity, valueId,
      direction: "ADD", supplierStatus: null, effectiveDate: null,
    });
  }
  request.calculationSemantics = {
    resources: [1, 2].map((n) => ({
      stageId: `stage-${n}`, periodId: "p1", scheduledValueId: n === 1 ? "time" : "time-2",
      setupValueId: `setup-${n}`, unavailableValueId: `unavailable-${n}`, lossAccounting: "COMPLETE_NONOVERLAPPING",
      productivity: { kind: "CYCLE_TIME", valueId: n === 1 ? "cycle" : "cycle-2" },
    })),
    workforce: [{
      roleId: "operator", outputId: "service", periodId: "p1", laborPerUnitValueId: "labor-per-unit",
      fixedTimeValueId: "fixed-labor", method: "HOMOGENEOUS_FULL_TIME", allocation: "COMPLETE_NONOVERLAPPING",
    }],
  };
  addOperationalValue(request, "labor-per-unit", "0.1", { kind: "TIME_PER_UNIT", poolId: "operator", entity: "service", basis: "HOUR" });
  addOperationalValue(request, "fixed-labor", "10", { kind: "RESOURCE_TIME", poolId: "operator", basis: "HOUR" });
  addOperationalValue(request, "available-labor", "24", { kind: "RESOURCE_TIME", poolId: "operator", basis: "HOUR" });
  addOperationalValue(request, "fte-hours", "6", { kind: "HOURS_PER_FTE", roleId: "operator", calendarId: "p1" });
  addOperationalSchedule(request, "STAFF_AVAILABILITY", "operator", "available-labor");
  addOperationalSchedule(request, "FTE_HOURS", "operator", "fte-hours");
  for (const [kind, id, amount] of [
    ["CONSUMPTION", "consumption", "60"], ["SUPPLIER", "supplier", "50"], ["OPENING_STOCK", "opening", "20"],
    ["RECEIPTS", "receipts", "30"], ["ADJUSTMENTS", "adjustments", "0"], ["SAFETY_STOCK", "safety", "2"],
  ] as const) {
    addOperationalValue(request, id, amount, { kind: "QUANTITY", entity: "material", whole: true });
    addOperationalSchedule(request, kind, "material", id);
  }
  addOperationalValue(request, "rate", "4", { kind: "RATE", entity: "material", per: "CALENDAR_DAY" });
  addOperationalValue(request, "lead", "3", { kind: "LEAD_TIME", basis: "CALENDAR_DAY" });
  addOperationalSchedule(request, "CONSUMPTION_RATE", "material", "rate");
  addOperationalSchedule(request, "LEAD_TIME", "material", "lead");
  for (const [kind, id, amount] of [["INSPECTED", "inspected", "100"], ["ACCEPTED", "accepted", "92"], ["REJECTED", "rejected", "8"]] as const) {
    const value = addOperationalValue(request, id, amount, { kind: "QUANTITY", entity: "service", whole: true });
    value.nature = "OBSERVED";
    addOperationalSchedule(request, kind, "service", id);
    const schedule = request.schedules.at(-1)!;
    schedule.interpretation = "OBSERVED"; schedule.cohortId = "observed-cohort";
  }
  request.requirements.applicabilityComplete = true;
  request.requirements.entries = [
    { id: "permit", status: "MISSING", rationale: "Explicit unfulfilled synthetic requirement", evidence: [] },
    { id: "reviewed", status: "EVIDENCED", rationale: "Synthetic evidence", evidence: [operationalEvidence] },
  ];
  return request;
}
export function operationalCalculationDataset() {
  const dataset = operationalDataset();
  const { contract, ...model } = operationalCalculationRequest(); void contract;
  dataset.model = {
    ...model, values: model.values.map((v) => ({ ...v, evidence: ["model-record"] })),
    schedules: model.schedules.map((s) => ({ ...s, evidence: ["model-record"] })),
    requirements: { ...model.requirements, evidence: ["model-record"],
      entries: model.requirements.entries.map((e) => ({ ...e, evidence: e.evidence.length ? ["model-record"] : [] })) },
    scenarios: [], sensitivity: [],
  };
  return dataset;
}
