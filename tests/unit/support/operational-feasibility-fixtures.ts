import type { OperationalContext, OperationalRequest, OperationalValue } from "@/services/analysis-engines/operational-feasibility";
import { digest, evaluatedAt, makeInput } from "./analysis-engine-fixtures";

export const operationalEvidence = {
  inputId: "dc:version-1", versionId: "version-1", checksum: digest, sourceRecordId: "synthetic-operational-record",
};
export const operationalDisclosure = {
  author: "Synthetic owner", declaredAt: "2026-10-01T00:00:00.000Z",
  rationale: "Declared synthetic operations only, not market demand or sales", evidence: [operationalEvidence],
};
export const operationalContext: OperationalContext = {
  runId: "operational-m1-fixture", evaluatedAt, environment: "test",
  timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 },
};
export function operationalValue(id = "target", value: string | null = "200"): OperationalValue {
  return {
    id, value, periodId: "p1", siteId: "site-1", unit: { kind: "QUANTITY", entity: "service", whole: true },
    nature: "DECLARED_ASSUMPTION", ...structuredClone(operationalDisclosure),
    approval: "OWNER_APPROVED", approvedAt: "2026-10-02T00:00:00.000Z", approvedBy: "Synthetic reviewer",
    method: { id: "explicit-owner-plan", version: "1" }, limitations: ["Synthetic assumption, not actual output"],
  };
}
export function operationalRequest(): OperationalRequest {
  const target = operationalValue(); const time = operationalValue("time", "480"); const cycle = operationalValue("cycle", "2");
  time.unit = { kind: "RESOURCE_TIME", poolId: "pool-1", basis: "MINUTE" };
  cycle.unit = { kind: "TIME_PER_UNIT", poolId: "pool-1", entity: "service", basis: "MINUTE" };
  const rows: { id: string; kind: "TARGET" | "RESOURCE_TIME" | "CYCLE_TIME"; entity: string; value: OperationalValue }[] = [
    { id: "target-schedule", kind: "TARGET", entity: "service", value: target },
    { id: "time-schedule", kind: "RESOURCE_TIME", entity: "pool-1", value: time },
    { id: "cycle-schedule", kind: "CYCLE_TIME", entity: "service", value: cycle },
  ];
  return {
    contract: "jenan.operational-feasibility.request/v1", subject: "synthetic-operational-model", siteId: "site-1",
    scope: {
      geography: { countryCode: "SA", authority: "synthetic", level: "COUNTRY", code: "SA", version: "1" },
      sector: { taxonomy: "synthetic", code: "service", version: "1" },
    },
    analyses: ["CAPACITY", "WORKFORCE", "SUPPLY", "INVENTORY", "REORDER", "QUALITY", "PREREQUISITES", "SCENARIOS", "SENSITIVITY"],
    periods: [{ kind: "INTERVAL", id: "p1", startDate: "2026-10-01", endDate: "2026-11-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }],
    network: { kind: "SIMPLE_SERIAL", lossBasis: "NET_GOOD_OUTPUT", stages: [{ id: "stage-1", poolId: "pool-1", outputId: "service" }] },
    values: [target, time, cycle],
    schedules: rows.map((entry) => ({
      id: entry.id, kind: entry.kind, interpretation: "PLAN", completeness: "COMPLETE",
      coveredPeriodIds: ["p1"], noApplicableItems: false, cohortId: null, evidence: [structuredClone(operationalEvidence)],
      rows: [{ id: `${entry.id}-row`, periodId: "p1", siteId: "site-1", entityId: entry.entity, valueId: entry.value.id, direction: "ADD", supplierStatus: null, effectiveDate: null }],
    })),
    requirements: { applicabilityComplete: false, evidence: [structuredClone(operationalEvidence)], entries: [] },
    scenarios: [], sensitivity: [],
  };
}
export const operationalInputs = () => [makeInput({ roles: ["operational.model"], allowExport: false })];
