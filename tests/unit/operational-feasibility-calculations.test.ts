import { describe, expect, it } from "vitest";
import {
  bindOperationalDataset, calculateOperational, calculateOperationalData, normalizeOperationalRequest, operationalArithmetic,
  validateOperationalCalculationResult, type OperationalRequest, type OperationalValue,
} from "@/services/analysis-engines/operational-feasibility";
import { operationalContext as context, operationalDisclosure, operationalInputs } from "./support/operational-feasibility-fixtures";
import { addOperationalValue, operationalCalculationDataset, operationalCalculationRequest } from "./support/operational-calculation-fixtures";
import { operationalPortFixture } from "./support/operational-data-fixtures";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";

const calculate = (request = operationalCalculationRequest()) => calculateOperational(request, operationalInputs(), context);
function metric(request: OperationalRequest, key: string, entity?: string, variant = "base") {
  const found = calculate(request).metrics.find((m) => m.key === key && (!entity || m.entityId === entity) && m.variant === variant);
  expect(found, `${key}/${entity}/${variant}`).toBeDefined();
  return found!;
}
const operand = (r: OperationalRequest, id: string) => r.values.find((v) => v.id === id)!;
describe("Operational M3 deterministic hand-checked calculations", () => {
  it.each([
    ["net_resource_time", "stage-1", "480"], ["net_resource_time", "stage-2", "360"],
    ["stage_capacity", "stage-1", "240"], ["stage_capacity", "stage-2", "180"],
    ["effective_output", "stage-1", "240"], ["effective_output", "stage-2", "180"],
    ["required_resource_time", "stage-2", "400"], ["load_ratio", "stage-2", "111.111111"],
    ["serial_bottleneck", "service", "180"], ["capacity_gap", "service", "20"], ["spare_capacity", "service", "0"],
    ["labor_requirement", "operator", "30"], ["fte_equivalents", "operator", "5"], ["staffing_hours_gap", "operator", "6"],
    ["staffing_fte_gap", "operator", "1"], ["required_staff_units", "operator", "5"],
    ["supplier_shortfall", "material", "10"], ["inventory_projected_balance", "material", "-10"],
    ["inventory_shortage", "material", "10"], ["inventory_receipts", "material", "30"], ["inventory_consumption", "material", "60"],
    ["reorder_threshold", "material", "14"], ["observed_yield", "service", "92"], ["rejection_ratio", "service", "8"],
    ["prerequisite_gap_count", "site-1", "1"],
  ])("%s/%s = %s", (key, entity, expected) => {
    const m = metric(operationalCalculationRequest(), key, entity);
    expect(m.value).toBe(expected); expect(["COMPUTED", "ESTIMATED"]).toContain(m.status);
    expect(m.reasons).toEqual([]); expect(m.evidence.length).toBeGreaterThan(0);
    expect(m.method.version).toBe("1.0.0");
  });
  it("reports all exact tied limiting stages, with stable evidence and source hashes", () => {
    const r = operationalCalculationRequest(); operand(r, "time").value = "360";
    const m = metric(r, "serial_bottleneck");
    expect(m.limitingStageIds).toEqual(["stage-1", "stage-2"]);
    expect(m.confidence?.band).toBe("MEDIUM"); expect(m.confidence?.isProbability).toBe(false);
    expect(m.evidence[0]).toEqual(operationalDisclosure.evidence[0]);
  });
  it("subtracts explicit nonoverlapping losses exactly once and supports hours", () => {
    const r = operationalCalculationRequest();
    const time = operand(r, "time"); time.value = "8"; time.unit = { kind: "RESOURCE_TIME", poolId: "pool-1", basis: "HOUR" };
    operand(r, "setup-1").value = "30"; operand(r, "unavailable-1").value = "90";
    expect(metric(r, "net_resource_time", "stage-1").value).toBe("360");
    expect(metric(r, "effective_output", "stage-1").value).toBe("180");
  });
  it("supports an explicitly pinned net good-output rate without a second yield", () => {
    const r = operationalCalculationRequest();
    const cycle = operand(r, "cycle"); cycle.value = "30"; cycle.unit = { kind: "RATE", entity: "service", per: "HOUR" };
    r.schedules.find((s) => s.kind === "CYCLE_TIME")!.rows = r.schedules.find((s) => s.kind === "CYCLE_TIME")!.rows.filter((row) => row.valueId !== "cycle");
    r.calculationSemantics!.resources[0]!.productivity = { kind: "NET_RATE", valueId: "cycle" };
    expect(metric(r, "stage_capacity", "stage-1").value).toBe("240");
    expect(metric(r, "required_resource_time", "stage-1").value).toBe("400");
  });
  it("rounds only deliverable units down and homogeneous staff up, keeping exact continuous capacity", () => {
    const r = operationalCalculationRequest(); operand(r, "time-2").value = "361";
    expect(metric(r, "stage_capacity", "stage-2").exactValue).toBe("180.5");
    expect(metric(r, "effective_output", "stage-2").value).toBe("180");
    expect(metric(r, "capacity_gap").value).toBe("20");
    operand(r, "fixed-labor").value = "11";
    expect(metric(r, "fte_equivalents").value).toBe("5.166667");
    expect(metric(r, "required_staff_units").value).toBe("6");
  });
  it("retains continuous service output and does not invent whole staffing", () => {
    const r = operationalCalculationRequest(); operand(r, "time-2").value = "361";
    operand(r, "target").unit = { kind: "QUANTITY", entity: "service", whole: false };
    r.analyses = ["CAPACITY", "WORKFORCE"];
    r.calculationSemantics!.workforce[0]!.method = "CONTINUOUS_FTE";
    expect(metric(r, "effective_output", "stage-2").value).toBe("180.5");
    expect(metric(r, "capacity_gap").value).toBe("19.5");
    expect(metric(r, "required_staff_units").value).toBeNull();
  });
  it("allows positive workload against explicit zero time, but not a numeric load ratio", () => {
    const r = operationalCalculationRequest(); operand(r, "time-2").value = "0";
    expect(metric(r, "stage_capacity", "stage-2").value).toBe("0");
    expect(metric(r, "capacity_gap").value).toBe("200");
    expect(metric(r, "load_ratio", "stage-2").reasons).toEqual(["ZERO_DENOMINATOR"]);
    operand(r, "target").value = "0";
    expect(metric(r, "load_ratio", "stage-2").value).toBeNull();
  });
  it("shows spare capacity and zero staffing gap without implying demand or a hire", () => {
    const r = operationalCalculationRequest(); operand(r, "target").value = "100";
    expect(metric(r, "spare_capacity").value).toBe("80");
    expect(metric(r, "capacity_gap").value).toBe("0");
    expect(metric(r, "staffing_hours_gap").value).toBe("0");
  });
  it.each([
    ["target", "capacity_gap"], ["time", "net_resource_time"], ["setup-1", "net_resource_time"],
    ["cycle", "stage_capacity"], ["labor-per-unit", "labor_requirement"], ["fixed-labor", "labor_requirement"],
    ["fte-hours", "fte_equivalents"], ["available-labor", "staffing_hours_gap"], ["supplier", "supplier_shortfall"],
    ["opening", "inventory_projected_balance"], ["receipts", "inventory_projected_balance"],
    ["adjustments", "inventory_projected_balance"], ["consumption", "inventory_projected_balance"],
    ["rate", "reorder_threshold"], ["lead", "reorder_threshold"], ["safety", "reorder_threshold"],
    ["inspected", "observed_yield"], ["accepted", "observed_yield"], ["rejected", "observed_yield"],
  ])("missing %s never becomes zero for %s", (id, key) => {
    const r = operationalCalculationRequest(); operand(r, id).value = null;
    const m = metric(r, key);
    expect(m.value).toBeNull(); expect(m.confidence).toBeNull(); expect(m.reasons).toContain("MISSING_OPERAND");
  });
  it.each(["cycle", "fte-hours", "inspected"])("guards the explicit zero denominator %s", (id) => {
    const r = operationalCalculationRequest(); operand(r, id).value = "0";
    if (id === "inspected") { operand(r, "accepted").value = "0"; operand(r, "rejected").value = "0"; }
    const m = metric(r, id === "cycle" ? "stage_capacity" : id === "fte-hours" ? "fte_equivalents" : "observed_yield");
    expect(m.value).toBeNull(); expect(m.reasons).toContain("ZERO_DENOMINATOR");
  });
  it.each(["BRANCHED", "PARALLEL", "REWORK", "SHARED_RESOURCE"] as const)("never simplifies %s networks", (kind) => {
    const r = operationalCalculationRequest(); r.network.kind = kind;
    expect(calculate(r).metrics.every((m) => m.status === "NOT_SUPPORTED" && m.value === null)).toBe(true);
  });
  it("does not compute gross/unknown output or shared resources", () => {
    const r = operationalCalculationRequest(); r.network.lossBasis = "GROSS_OR_UNKNOWN";
    expect(metric(r, "effective_output").status).toBe("NOT_SUPPORTED");
  });
  it("does not infer loss or workforce semantics for accepted legacy M1/M2 models", () => {
    const r = operationalCalculationRequest(); delete r.calculationSemantics;
    expect(metric(r, "net_resource_time").reasons).toContain("MISSING_CALCULATION_SEMANTICS");
    expect(metric(r, "labor_requirement").reasons).toContain("MISSING_CALCULATION_SEMANTICS");
  });
  it("rejects losses beyond allocated time without clamping them", () => {
    const r = operationalCalculationRequest(); operand(r, "setup-1").value = "481";
    expect(metric(r, "net_resource_time").reasons).toEqual(["INVALID_LOSS_ACCOUNTING"]);
    expect(metric(r, "serial_bottleneck").value).toBeNull();
    expect(metric(r, "observed_yield").value).toBe("92");
  });
  it.each(["QUOTATION", "UNKNOWN"] as const)("never treats %s as supplier commitment", (status) => {
    const r = operationalCalculationRequest(); r.schedules.find((s) => s.kind === "SUPPLIER")!.rows[0]!.supplierStatus = status;
    expect(metric(r, "supplier_shortfall").reasons).toContain("QUOTATION_NOT_COMMITMENT");
  });
  it.each(["SUPPLIER", "RECEIPTS"] as const)("does not claim dated supply from an undated %s row", (kind) => {
    const r = operationalCalculationRequest(); r.schedules.find((s) => s.kind === kind)!.rows[0]!.effectiveDate = null;
    expect(metric(r, kind === "SUPPLIER" ? "supplier_shortfall" : "inventory_projected_balance").reasons).toContain("INCOMPLETE_TIMING");
  });
  it("accepts evidenced complete empty receipts, not an empty unclassified schedule", () => {
    const r = operationalCalculationRequest(); const receipts = r.schedules.find((s) => s.kind === "RECEIPTS")!;
    receipts.rows = []; receipts.noApplicableItems = true;
    expect(metric(r, "inventory_projected_balance").value).toBe("-40");
    receipts.noApplicableItems = false; receipts.completeness = "PARTIAL";
    expect(metric(r, "inventory_projected_balance").value).toBeNull();
  });
  it("applies signed adjustments and reports projected backlog, not physical negative stock", () => {
    const r = operationalCalculationRequest(); operand(r, "adjustments").value = "5";
    r.schedules.find((s) => s.kind === "ADJUSTMENTS")!.rows[0]!.direction = "SUBTRACT";
    expect(metric(r, "inventory_projected_balance").value).toBe("-15");
    expect(metric(r, "inventory_shortage").limitations.join(" ")).toContain("backlog");
  });
  it("carries exact signed inventory between contiguous periods and blocks inconsistent opening assertions", () => {
    const r = operationalCalculationRequest(); r.analyses = ["INVENTORY"];
    r.periods.push({ ...r.periods[0]!, id: "p2", startDate: "2026-11-01", endDate: "2026-12-01" });
    for (const kind of ["OPENING_STOCK", "RECEIPTS", "CONSUMPTION", "ADJUSTMENTS"] as const) {
      const schedule = r.schedules.find((s) => s.kind === kind)!; schedule.coveredPeriodIds.push("p2");
      if (kind === "OPENING_STOCK") continue;
      const original = schedule.rows[0]!;
      const value = { ...structuredClone(operand(r, original.valueId)), id: `${original.valueId}-p2`, periodId: "p2",
        value: kind === "RECEIPTS" ? "5" : kind === "CONSUMPTION" ? "8" : "0" };
      r.values.push(value);
      schedule.rows.push({ ...original, id: `${original.id}-p2`, valueId: value.id, periodId: "p2",
        effectiveDate: kind === "RECEIPTS" ? "2026-11-10" : null });
    }
    const balance = calculate(r).metrics.find((m) => m.key === "inventory_projected_balance" && m.periodId === "p2")!;
    expect(balance.value).toBe("-13"); expect(balance.operandIds).toContain("opening");
    const opening = r.schedules.find((s) => s.kind === "OPENING_STOCK")!;
    r.values.push({ ...structuredClone(operand(r, "opening")), id: "opening-p2", periodId: "p2", value: "0" });
    opening.rows.push({ ...opening.rows[0]!, id: "opening-p2-row", valueId: "opening-p2", periodId: "p2" });
    expect(calculate(r).metrics.find((m) => m.key === "inventory_projected_balance" && m.periodId === "p2")!.reasons).toContain("INVENTORY_RECONCILIATION_FAILED");
  });
  it("never substitutes working days for calendar days", () => {
    const r = operationalCalculationRequest(); operand(r, "lead").unit = { kind: "LEAD_TIME", basis: "WORKING_DAY" };
    expect(metric(r, "reorder_threshold").reasons).toContain("INCOMPATIBLE_UNITS");
  });
  it.each(["cohort", "unreconciled"] as const)("blocks %s quality ratios", (kind) => {
    const r = operationalCalculationRequest();
    if (kind === "cohort") r.schedules.find((s) => s.kind === "ACCEPTED")!.cohortId = "other";
    else operand(r, "rejected").value = "9";
    expect(metric(r, "observed_yield").reasons).toContain(kind === "cohort" ? "INCOMPATIBLE_COHORT" : "QUALITY_RECONCILIATION_FAILED");
  });
  it("preserves requirement evidence and cannot claim no gaps for unknown applicability", () => {
    const r = operationalCalculationRequest(); r.requirements.applicabilityComplete = false;
    expect(metric(r, "prerequisite_gap_count").reasons).toContain("INCOMPLETE_APPLICABILITY");
    expect(calculate(r).prerequisiteFindings?.entries[0]?.status).toBe("MISSING");
  });
  it("blocks unapproved or missing source evidence without converting it into confidence", () => {
    const r = operationalCalculationRequest(); const value = operand(r, "target");
    value.approval = "UNREVIEWED"; value.approvedAt = null; value.approvedBy = null;
    expect(metric(r, "capacity_gap").reasons).toContain("APPROVAL_REQUIRED");
    expect(calculateOperational(operationalCalculationRequest(), [], context).metrics.every((m) => m.value === null && m.confidence === null)).toBe(true);
  });
  it("validates output determinism and detects tampering even when an attacker changes a metric", () => {
    const result = calculate();
    expect(validateOperationalCalculationResult(result)).toEqual(result);
    const bad = structuredClone(result); bad.metrics[0]!.value = "999";
    bad.determinism.outputHash = canonicalHash(omitKeys(bad, ["determinism", "runId", "timing"]));
    expect(() => validateOperationalCalculationResult(bad)).toThrow("mismatch");
    const differentRun = calculateOperational(operationalCalculationRequest(), operationalInputs(), { ...context, runId: "another-run", timing: { ...context.timing, durationMs: 1 } });
    expect(differentRun.determinism).toEqual(result.determinism);
  });
  it("normalizes unordered collections and retains stage/period order", () => {
    const r = operationalCalculationRequest(); const original = calculate(r);
    r.values.reverse(); r.schedules.reverse(); r.requirements.entries.reverse();
    r.calculationSemantics!.resources.reverse();
    expect(calculate(r).determinism).toEqual(original.determinism);
    expect(normalizeOperationalRequest(r, context.evaluatedAt).normalized.network.stages[0]!.id).toBe("stage-1");
  });
  it.each([
    ["setup-1", { kind: "RESOURCE_TIME", poolId: "other", basis: "MINUTE" }, "net_resource_time"],
    ["labor-per-unit", { kind: "TIME_PER_UNIT", poolId: "other", entity: "service", basis: "HOUR" }, "labor_requirement"],
    ["fixed-labor", { kind: "RESOURCE_TIME", poolId: "other", basis: "HOUR" }, "labor_requirement"],
  ] satisfies [string, OperationalValue["unit"], string][])("does not transfer %s across incompatible pools", (id, unit, key) => {
    const r = operationalCalculationRequest(); operand(r, id).unit = unit;
    expect(metric(r, key).reasons).toContain("INCOMPATIBLE_UNITS");
  });
  it("rejects inconsistent definitions of the same material", () => {
    const r = operationalCalculationRequest(); operand(r, "opening").unit = { kind: "QUANTITY", entity: "material", whole: false };
    expect(metric(r, "inventory_projected_balance").reasons).toContain("INCOMPATIBLE_UNITS");
  });
  it("keeps independent stage capacity when only target quantity is missing", () => {
    const r = operationalCalculationRequest(); operand(r, "target").value = null;
    expect(metric(r, "stage_capacity", "stage-1").value).toBe("240");
    expect(metric(r, "capacity_gap").value).toBeNull();
  });
  it.each(["PARTIAL", "MISSING"] as const)("does not compute capacity from a %s resource schedule", (status) => {
    const r = operationalCalculationRequest(); const schedule = r.schedules.find((s) => s.kind === "RESOURCE_TIME")!;
    schedule.completeness = status;
    if (status === "MISSING") schedule.rows = [];
    expect(metric(r, "stage_capacity").value).toBeNull();
  });
  it("rejects double allocations and unknown semantics rather than silently duplicating staff/resource time", () => {
    const r = operationalCalculationRequest(); r.calculationSemantics!.resources[1]!.setupValueId = "setup-1";
    expect(() => calculate(r)).toThrow("allocated twice");
    const other = operationalCalculationRequest(); other.calculationSemantics!.workforce[0]!.fixedTimeValueId = "available-labor";
    expect(() => calculate(other)).toThrow("another schedule");
  });
  it("checks the exact expanded scalar metric count before evaluating variants or performing source I/O", async () => {
    const r = operationalCalculationRequest(); r.analyses = ["CAPACITY", "SCENARIOS"];
    for (let n = 3; n <= 50; n++) {
      const stageId = `stage-${n}`; const poolId = `pool-${n}`;
      r.network.stages.push({ id: stageId, poolId, outputId: "service" });
      for (const id of ["time", "setup", "unavailable", "cycle"]) {
        addOperationalValue(r, `${id}-${n}`, id === "time" ? "480" : id === "cycle" ? "2" : "0",
          id === "cycle" ? { kind: "TIME_PER_UNIT", poolId, entity: "service", basis: "MINUTE" } : { kind: "RESOURCE_TIME", poolId, basis: "MINUTE" });
      }
      r.calculationSemantics!.resources.push({ stageId, periodId: "p1", scheduledValueId: `time-${n}`,
        setupValueId: `setup-${n}`, unavailableValueId: `unavailable-${n}`, lossAccounting: "COMPLETE_NONOVERLAPPING",
        productivity: { kind: "CYCLE_TIME", valueId: `cycle-${n}` } });
      for (const [kind, id, entity] of [["RESOURCE_TIME", `time-${n}`, poolId], ["CYCLE_TIME", `cycle-${n}`, "service"]] as const) {
        r.schedules.find((s) => s.kind === kind)!.rows.push({ id: `${id}-row`, periodId: "p1", siteId: "site-1",
          valueId: id, entityId: entity, direction: "ADD", supplierStatus: null, effectiveDate: null });
      }
    }
    r.scenarios = [{ ...operationalDisclosure, id: "extra", overrides: [{ valueId: "target", value: "100" }] }];
    expect(() => calculate(r)).toThrow("expanded scalar metric limit");
    const fixture = operationalPortFixture();
    await expect(calculateOperationalData(fixture.port, { model: r, source: fixture.request.source }, context)).rejects.toThrow("expanded scalar metric limit");
    expect(fixture.discover).not.toHaveBeenCalled(); expect(fixture.read).not.toHaveBeenCalled();
  });
  it("counts declared requirement findings within the same 500 output limit", () => {
    const r = operationalCalculationRequest(); r.analyses = ["PREREQUISITES"];
    r.requirements.entries = Array.from({ length: 500 }, (_, i) => ({ id: `requirement-${i}`, status: "MISSING" as const, rationale: "Explicit synthetic gap", evidence: [] }));
    expect(() => calculate(r)).toThrow("expanded scalar metric limit");
  });
  it("rejects actual calculation/evidence work beyond the unchanged 20000-unit budget", () => {
    const r = operationalCalculationRequest(); r.analyses = ["CAPACITY", "SCENARIOS"];
    for (const item of [...r.values, ...r.schedules]) {
      item.evidence = Array.from({ length: 32 }, (_, i) => ({ ...operationalDisclosure.evidence[0]!, sourceRecordId: `record-${i}` }));
    }
    r.scenarios = Array.from({ length: 6 }, (_, i) => ({
      ...operationalDisclosure, id: `workload-${i}`, overrides: [{ valueId: "target", value: String(100 + i) }],
    }));
    expect(() => calculate(r)).toThrow("calculation work budget");
  });
  it("does not return empty success when scenario declarations have no selected calculation family", () => {
    const r = operationalCalculationRequest(); r.analyses = ["SCENARIOS"];
    r.scenarios = [{ ...operationalDisclosure, id: "extra", overrides: [{ valueId: "target", value: "100" }] }];
    expect(calculate(r).metrics.every((m) => m.reasons.includes("NO_CALCULATION_ANALYSIS"))).toBe(true);
  });
  it("fails arithmetic overflow explicitly rather than returning success-shaped data", () => {
    expect(() => operationalArithmetic("MULTIPLY", "999999999999999999", "2")).toThrow("overflow");
    const r = operationalCalculationRequest(); operand(r, "target").value = "999999999999999999";
    expect(() => calculate(r)).toThrow();
  });
  it("recalculates only declared independent scenario and sensitivity overrides; preserves failing points", () => {
    const r = operationalCalculationRequest(); r.analyses = ["CAPACITY", "SCENARIOS", "SENSITIVITY"];
    r.scenarios = [{ ...operationalDisclosure, id: "low-target", overrides: [{ valueId: "target", value: "100" }] }];
    r.sensitivity = [{ ...operationalDisclosure, id: "cycle-driver", valueId: "cycle-2", low: "0", base: "2", high: "4" }];
    const result = calculate(r);
    expect(result.variants.map((v) => v.id)).toEqual(["base", "scenario:low-target", "sensitivity:cycle-driver:low", "sensitivity:cycle-driver:base", "sensitivity:cycle-driver:high"]);
    expect(metric(r, "capacity_gap", "service", "scenario:low-target").value).toBe("0");
    expect(metric(r, "serial_bottleneck", "service", "sensitivity:cycle-driver:low").reasons).toContain("ZERO_DENOMINATOR");
    expect(metric(r, "serial_bottleneck", "service", "sensitivity:cycle-driver:high").value).toBe("90");
    expect(operand(r, "target").value).toBe("200");
  });
  it("preserves a null scenario override without reverting to base", () => {
    const r = operationalCalculationRequest(); r.analyses = ["CAPACITY", "SCENARIOS"];
    r.scenarios = [{ ...operationalDisclosure, id: "missing", overrides: [{ valueId: "target", value: null }] }];
    expect(metric(r, "capacity_gap", "service", "scenario:missing").value).toBeNull();
  });
  it.each(["SCENARIOS", "SENSITIVITY"] as const)("does not invent undeclared %s", (analysis) => {
    const r = operationalCalculationRequest(); r.analyses.push(analysis);
    expect(calculate(r).metrics.find((m) => m.analysis === analysis)?.value).toBeNull();
  });
  it("uses fresh governed source preparation before execution and returns no calculations on unavailable access", async () => {
    const fixture = operationalPortFixture();
    Object.assign(fixture.dataset, operationalCalculationDataset());
    fixture.request = bindOperationalDataset(fixture.dataset, fixture.reference, context.evaluatedAt);
    const success = await calculateOperationalData(fixture.port, fixture.request, context);
    expect(success.preparation.ready).toBe(true); expect(success.result?.phase).toBe("M3_CALCULATIONS");
    expect(success.result?.metrics.find((m) => m.key === "capacity_gap")?.value).toBe("20");
    expect(success.result?.metrics.find((m) => m.key === "inventory_projected_balance")?.value).toBe("-10");
    fixture.discover.mockResolvedValueOnce({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false,
      status: "NOT_AVAILABLE", candidates: [], selected: null, unavailableVersionIds: ["operational-v1"], notInForce: [], truncated: false });
    const unavailable = await calculateOperationalData(fixture.port, fixture.request, context);
    expect(unavailable.result).toBeNull();
  });
  it("does not allow a caller to replace the source-approved loss-accounting operands", async () => {
    const fixture = operationalPortFixture();
    Object.assign(fixture.dataset, operationalCalculationDataset());
    const request = bindOperationalDataset(fixture.dataset, fixture.reference, context.evaluatedAt);
    request.model.calculationSemantics!.resources[0]!.productivity.kind = "NET_RATE";
    const result = await calculateOperationalData(fixture.port, request, context);
    expect(result.result).toBeNull();
    expect(result.preparation.reason).toBe("PUBLISHED_MODEL_REQUEST_MISMATCH");
  });
});
