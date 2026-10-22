import { z } from "zod";
import { canonicalHash, canonicalize, compareText, omitKeys } from "../shared/canonical";
import { deriveAttribution, deriveRights } from "../shared/contracts";
import { assessOperationalConfidence, operationalConfidencePolicy, operationalConfidenceSchema } from "./confidence";
import { operationalContextSchema, supportsOperationalSerial, type OperationalContext } from "./contracts";
import {
  compareOperationalDecimals as compare, convertOperationalTime, operationalArithmetic as arithmetic,
  operationalDecimalPolicy, operationalResultDecimalSchema, roundOperationalDecimal, wholeOperationalDecimal,
} from "./decimal";
import {
  operationalAnalyses, operationalEvidenceSchema, operationalUnitSchema, type OperationalInput,
  operationalValueSchema, type OperationalRequest, type OperationalValue,
} from "./model";
import { ensureOperationalSize, normalizeOperationalInputs, normalizeOperationalRequest, operationalBounds, operationalWork } from "./request";

export const OPERATIONAL_CALCULATION_VERSION = "1.0.0-m3";
const reasons = [
  "UNSUPPORTED_PROCESS_NETWORK", "MISSING_CALCULATION_SEMANTICS", "MISSING_REQUIRED_SCHEDULE",
  "INCOMPLETE_COVERAGE", "MISSING_OPERAND", "INPUT_NOT_AVAILABLE", "APPROVAL_REQUIRED",
  "INCOMPATIBLE_UNITS", "INCOMPATIBLE_RESOURCE", "INCOMPATIBLE_COHORT", "ZERO_DENOMINATOR",
  "INVALID_LOSS_ACCOUNTING", "QUOTATION_NOT_COMMITMENT", "INCOMPLETE_TIMING",
  "INVENTORY_RECONCILIATION_FAILED", "QUALITY_RECONCILIATION_FAILED", "INCOMPLETE_APPLICABILITY",
  "SCENARIO_NOT_DECLARED", "SENSITIVITY_NOT_DECLARED",
  "NO_CALCULATION_ANALYSIS",
] as const;
type Reason = typeof reasons[number];
type Analysis = OperationalRequest["analyses"][number];
type ScheduleKind = OperationalRequest["schedules"][number]["kind"];
const metricUnitSchema = z.union([
  operationalUnitSchema,
  z.object({ kind: z.literal("QUALITY_PERCENT") }).strict(),
  z.object({ kind: z.literal("COUNT") }).strict(),
]);
type Unit = z.infer<typeof metricUnitSchema>;
const metricSchema = z.object({
  key: z.string().min(1), analysis: z.enum(operationalAnalyses), periodId: z.string().nullable(),
  entityId: z.string(), siteId: z.string(), variant: z.string(),
  status: z.enum(["COMPUTED", "ESTIMATED", "NOT_COMPUTABLE", "NOT_SUPPORTED"]),
  value: operationalResultDecimalSchema.nullable(), exactValue: operationalResultDecimalSchema.nullable(),
  unit: metricUnitSchema, interpretation: z.enum(["PLAN_DERIVED", "OBSERVED_RATIO", "EVIDENCE_GAPS", "UNAVAILABLE"]),
  method: z.object({ id: z.string(), version: z.literal("1.0.0") }).strict(),
  operandIds: z.array(z.string()), assumptionIds: z.array(z.string()),
  evidence: z.array(operationalEvidenceSchema),
  confidence: operationalConfidenceSchema.nullable(), reasons: z.array(z.enum(reasons)),
  limitingStageIds: z.array(z.string()), limitations: z.array(z.string()).min(1),
}).strict();
export type OperationalCalculationMetric = z.infer<typeof metricSchema>;
class CalculationGap extends Error {
  constructor(readonly reason: Reason) { super(reason); }
}
function requireCalculation(condition: unknown, reason: Reason): asserts condition {
  if (!condition) throw new CalculationGap(reason);
}
const sum = (values: string[]) => values.reduce((total, value) => arithmetic("ADD", total, value), "0");
const positivePart = (value: string) => arithmetic("MAX", "0", value);
const quantity = (entity: string, whole = false): Unit => ({ kind: "QUANTITY", entity, whole });

class Operands {
  readonly used = new Map<string, OperationalValue>();
  readonly evidence = new Map<string, z.infer<typeof operationalEvidenceSchema>>();
  limitingStageIds: string[] = [];
  constructor(readonly request: OperationalRequest, public periodId: string, readonly inputs: OperationalInput[], readonly charge: (units: number) => void) {}
  record(refs: readonly z.infer<typeof operationalEvidenceSchema>[]) {
    this.charge(refs.length);
    for (const ref of refs) {
      requireCalculation(this.inputs.some((i) => i.id === ref.inputId && i.ref.id === ref.versionId
        && i.checksum?.value === ref.checksum), "INPUT_NOT_AVAILABLE");
      this.evidence.set(canonicalize(ref), ref);
    }
  }
  value(id: string) {
    this.charge(1);
    const value = this.request.values.find((v) => v.id === id);
    requireCalculation(value && value.periodId === this.periodId && value.value !== null, "MISSING_OPERAND");
    if (value.unit.kind === "QUANTITY") {
      const unit = value.unit;
      requireCalculation([...this.used.values()].every((v) => v.unit.kind !== "QUANTITY"
        || v.unit.entity !== unit.entity || v.unit.whole === unit.whole), "INCOMPATIBLE_UNITS");
    }
    this.used.set(id, value); this.record(value.evidence);
    requireCalculation(value.approval === "OWNER_APPROVED", "APPROVAL_REQUIRED");
    return { ...value, value: value.value };
  }
  schedule(kind: ScheduleKind) {
    this.charge(1);
    const schedule = this.request.schedules.find((s) => s.kind === kind);
    requireCalculation(schedule && schedule.completeness !== "MISSING", "MISSING_REQUIRED_SCHEDULE");
    this.record(schedule.evidence);
    requireCalculation(schedule.completeness === "COMPLETE" && schedule.coveredPeriodIds.includes(this.periodId), "INCOMPLETE_COVERAGE");
    return schedule;
  }
  rows(kind: ScheduleKind, entity: string, allowExplicitEmpty = false) {
    const schedule = this.schedule(kind);
    const rows = schedule.rows.filter((r) => r.periodId === this.periodId && r.entityId === entity);
    requireCalculation(rows.length || allowExplicitEmpty && schedule.noApplicableItems, "MISSING_OPERAND");
    return rows;
  }
  single(kind: ScheduleKind, entity: string) {
    const rows = this.rows(kind, entity);
    requireCalculation(rows.length === 1, "INCOMPATIBLE_RESOURCE");
    return this.value(rows[0]!.valueId);
  }
  amount(kind: ScheduleKind, entity: string, allowExplicitEmpty = false) {
    let whole: boolean | null = null;
    return sum(this.rows(kind, entity, allowExplicitEmpty).map((row) => {
      const value = this.value(row.valueId);
      requireCalculation(value.unit.kind === "QUANTITY" && value.unit.entity === entity, "INCOMPATIBLE_UNITS");
      if (whole !== null) requireCalculation(whole === value.unit.whole, "INCOMPATIBLE_UNITS");
      whole = value.unit.whole;
      if (kind === "SUPPLIER") requireCalculation(row.supplierStatus === "COMMITTED", "QUOTATION_NOT_COMMITMENT");
      if (kind === "SUPPLIER" || kind === "RECEIPTS") requireCalculation(row.effectiveDate !== null, "INCOMPLETE_TIMING");
      return row.direction === "SUBTRACT" ? arithmetic("SUBTRACT", "0", value.value) : value.value;
    }));
  }
  time(id: string, poolId: string) {
    const value = this.value(id);
    requireCalculation(value.unit.kind === "RESOURCE_TIME" && value.unit.poolId === poolId, "INCOMPATIBLE_UNITS");
    return convertOperationalTime(value.value, value.unit.basis, "MINUTE");
  }
  target(entity: string) {
    const target = this.single("TARGET", entity);
    requireCalculation(target.unit.kind === "QUANTITY", "INCOMPATIBLE_UNITS");
    return target;
  }
  resource(stageId: string) {
    const stage = this.request.network.stages.find((s) => s.id === stageId)!;
    const config = this.request.calculationSemantics?.resources.find((r) => r.stageId === stageId && r.periodId === this.periodId);
    requireCalculation(config, "MISSING_CALCULATION_SEMANTICS");
    const scheduled = this.single("RESOURCE_TIME", stage.poolId);
    requireCalculation(scheduled.id === config.scheduledValueId, "INCOMPATIBLE_RESOURCE");
    const net = arithmetic("SUBTRACT", arithmetic("SUBTRACT", this.time(config.scheduledValueId, stage.poolId),
      this.time(config.setupValueId, stage.poolId)), this.time(config.unavailableValueId, stage.poolId));
    requireCalculation(compare(net, "0") >= 0, "INVALID_LOSS_ACCOUNTING");
    return { stage, config, net };
  }
  capacity(stageId: string) {
    const resource = this.resource(stageId);
    const productivity = this.value(resource.config.productivity.valueId);
    let cycle: string;
    if (resource.config.productivity.kind === "CYCLE_TIME") {
      const rows = this.schedule("CYCLE_TIME").rows.filter((r) => r.periodId === this.periodId && r.valueId === productivity.id);
      requireCalculation(rows.length === 1, "INCOMPATIBLE_RESOURCE");
      requireCalculation(productivity.unit.kind === "TIME_PER_UNIT" && productivity.unit.poolId === resource.stage.poolId
        && productivity.unit.entity === resource.stage.outputId, "INCOMPATIBLE_UNITS");
      cycle = convertOperationalTime(productivity.value, productivity.unit.basis, "MINUTE");
    } else {
      requireCalculation(productivity.unit.kind === "RATE" && productivity.unit.entity === resource.stage.outputId
        && (productivity.unit.per === "HOUR" || productivity.unit.per === "MINUTE"), "INCOMPATIBLE_UNITS");
      requireCalculation(compare(productivity.value, "0") > 0, "ZERO_DENOMINATOR");
      cycle = arithmetic("DIVIDE", productivity.unit.per === "HOUR" ? "60" : "1", productivity.value);
    }
    requireCalculation(compare(cycle, "0") > 0, "ZERO_DENOMINATOR");
    const capacity = resource.config.productivity.kind === "NET_RATE" && productivity.unit.kind === "RATE"
      ? arithmetic("DIVIDE", arithmetic("MULTIPLY", resource.net, productivity.value), productivity.unit.per === "HOUR" ? "60" : "1")
      : arithmetic("DIVIDE", resource.net, cycle);
    return { ...resource, cycle, capacity };
  }
  bottleneck() {
    const stages = this.request.network.stages.map((s) => this.capacity(s.id));
    const minimum = stages.reduce((n, s) => arithmetic("MIN", n, s.capacity), stages[0]!.capacity);
    this.limitingStageIds = stages.filter((s) => compare(s.capacity, minimum) === 0).map((s) => s.stage.id).sort(compareText);
    return { capacity: minimum, target: this.target(stages[0]!.stage.outputId) };
  }
  workforce(roleId: string) {
    const config = this.request.calculationSemantics?.workforce.find((r) => r.roleId === roleId && r.periodId === this.periodId);
    requireCalculation(config, "MISSING_CALCULATION_SEMANTICS");
    const labor = this.value(config.laborPerUnitValueId);
    requireCalculation(labor.unit.kind === "TIME_PER_UNIT" && labor.unit.poolId === roleId && labor.unit.entity === config.outputId, "INCOMPATIBLE_UNITS");
    const required = arithmetic("ADD", arithmetic("MULTIPLY", this.target(config.outputId).value,
      convertOperationalTime(labor.value, labor.unit.basis, "HOUR")),
    convertOperationalTime(this.time(config.fixedTimeValueId, roleId), "MINUTE", "HOUR"));
    return { required, config };
  }
  available(roleId: string) {
    return sum(this.rows("STAFF_AVAILABILITY", roleId).map((r) => convertOperationalTime(this.time(r.valueId, roleId), "MINUTE", "HOUR")));
  }
  fte(roleId: string) {
    const hours = this.single("FTE_HOURS", roleId);
    requireCalculation(hours.unit.kind === "HOURS_PER_FTE" && hours.unit.roleId === roleId
      && hours.unit.calendarId === this.periodId, "INCOMPATIBLE_UNITS");
    requireCalculation(compare(hours.value, "0") > 0, "ZERO_DENOMINATOR");
    return hours.value;
  }
  inventory(entity: string) {
    const current = this.periodId;
    let balance: string | null = null;
    for (const period of this.request.periods) {
      this.periodIdForInventory(period.id);
      const openingSchedule = this.schedule("OPENING_STOCK");
      const openings = openingSchedule.rows.filter((r) => r.periodId === period.id && r.entityId === entity);
      if (balance === null) balance = this.amount("OPENING_STOCK", entity);
      else if (openings.length) requireCalculation(compare(this.amount("OPENING_STOCK", entity), balance) === 0, "INVENTORY_RECONCILIATION_FAILED");
      balance = arithmetic("SUBTRACT", arithmetic("ADD", arithmetic("ADD", balance, this.amount("RECEIPTS", entity, true)),
        this.amount("ADJUSTMENTS", entity, true)), this.amount("CONSUMPTION", entity));
      if (period.id === current) break;
    }
    this.periodIdForInventory(current);
    return balance!;
  }
  private periodIdForInventory(id: string) { this.periodId = id; }
}

type Job = {
  key: string; analysis: Analysis; periodId: string | null; entityId: string; unit: Unit;
  calculate: (operands: Operands) => string;
};
function calculationJobs(request: OperationalRequest): Job[] {
  const jobs: Job[] = [];
  const add = (analysis: Analysis, periodId: string | null, entityId: string, key: string, unit: Unit, calculate: Job["calculate"]) => {
    jobs.push({ key, analysis, periodId, entityId, unit, calculate });
    if (jobs.length > operationalBounds.metrics) throw new RangeError("Operational scalar metric limit exceeded");
  };
  const has = (analysis: Analysis) => request.analyses.includes(analysis);
  const entities = (kinds: ScheduleKind[]) => [...new Set(request.schedules.filter((s) => kinds.includes(s.kind)).flatMap((s) => s.rows.map((r) => r.entityId)))].sort(compareText);
  const outputUnit = (entity: string, periodId: string): Unit => {
    const order: ScheduleKind[] = ["TARGET", "CONSUMPTION", "OPENING_STOCK", "SUPPLIER", "RECEIPTS", "ADJUSTMENTS", "SAFETY_STOCK", "INSPECTED"];
    const row = order.flatMap((kind) => request.schedules.filter((s) => s.kind === kind).flatMap((s) => s.rows)).find((r) => r.entityId === entity && r.periodId === periodId
      && request.values.some((v) => v.id === r.valueId && v.unit.kind === "QUANTITY"));
    const value = request.values.find((v) => v.id === row?.valueId);
    return value?.unit.kind === "QUANTITY" ? value.unit : quantity(entity);
  };
  for (const period of request.periods) {
    const p = period.id;
    if (has("CAPACITY")) {
      for (const stage of request.network.stages) {
        const time: Unit = { kind: "RESOURCE_TIME", poolId: stage.poolId, basis: "MINUTE" };
        add("CAPACITY", p, stage.id, "net_resource_time", time, (o) => o.resource(stage.id).net);
        add("CAPACITY", p, stage.id, "stage_capacity", quantity(stage.outputId), (o) => o.capacity(stage.id).capacity);
        add("CAPACITY", p, stage.id, "effective_output", outputUnit(stage.outputId, p), (o) => {
          const c = o.capacity(stage.id);
          const target = o.target(stage.outputId);
          return target.unit.kind === "QUANTITY" && target.unit.whole ? wholeOperationalDecimal(c.capacity, "DOWN") : c.capacity;
        });
        add("CAPACITY", p, stage.id, "required_resource_time", time, (o) => {
          const c = o.capacity(stage.id); return arithmetic("MULTIPLY", o.target(stage.outputId).value, c.cycle);
        });
        add("CAPACITY", p, stage.id, "load_ratio", { kind: "LOAD_PERCENT" }, (o) => {
          const c = o.capacity(stage.id); requireCalculation(compare(c.net, "0") > 0, "ZERO_DENOMINATOR");
          return arithmetic("MULTIPLY", arithmetic("DIVIDE", arithmetic("MULTIPLY", o.target(stage.outputId).value, c.cycle), c.net), "100");
        });
      }
      const output = request.network.stages[0]!.outputId;
      const effective = (o: Operands) => {
        const b = o.bottleneck();
        return { ...b, capacity: b.target.unit.kind === "QUANTITY" && b.target.unit.whole ? wholeOperationalDecimal(b.capacity, "DOWN") : b.capacity };
      };
      add("CAPACITY", p, output, "serial_bottleneck", outputUnit(output, p), (o) => effective(o).capacity);
      add("CAPACITY", p, output, "capacity_gap", outputUnit(output, p), (o) => { const b = effective(o); return positivePart(arithmetic("SUBTRACT", b.target.value, b.capacity)); });
      add("CAPACITY", p, output, "spare_capacity", outputUnit(output, p), (o) => { const b = effective(o); return positivePart(arithmetic("SUBTRACT", b.capacity, b.target.value)); });
    }
    if (has("WORKFORCE")) {
      const roles = [...new Set([...(request.calculationSemantics?.workforce.map((r) => r.roleId) ?? []), ...entities(["STAFF_AVAILABILITY", "FTE_HOURS", "LABOR_TIME"])])].sort(compareText);
      if (!roles.length) roles.push("undeclared-role");
      for (const role of roles) {
        const hours: Unit = { kind: "RESOURCE_TIME", poolId: role, basis: "HOUR" };
        add("WORKFORCE", p, role, "labor_requirement", hours, (o) => o.workforce(role).required);
        add("WORKFORCE", p, role, "fte_equivalents", { kind: "FTE", roleId: role }, (o) => arithmetic("DIVIDE", o.workforce(role).required, o.fte(role)));
        add("WORKFORCE", p, role, "staffing_hours_gap", hours, (o) => positivePart(arithmetic("SUBTRACT", o.workforce(role).required, o.available(role))));
        add("WORKFORCE", p, role, "staffing_fte_gap", { kind: "FTE", roleId: role }, (o) => arithmetic("DIVIDE", positivePart(arithmetic("SUBTRACT", o.workforce(role).required, o.available(role))), o.fte(role)));
        add("WORKFORCE", p, role, "required_staff_units", { kind: "COUNT" }, (o) => {
          const w = o.workforce(role); requireCalculation(w.config.method === "HOMOGENEOUS_FULL_TIME", "MISSING_CALCULATION_SEMANTICS");
          return wholeOperationalDecimal(arithmetic("DIVIDE", w.required, o.fte(role)), "UP");
        });
      }
    }
    for (const analysis of ["SUPPLY", "INVENTORY", "REORDER", "QUALITY"] as const) {
      if (!has(analysis)) continue;
      const kinds: ScheduleKind[] = analysis === "SUPPLY" ? ["CONSUMPTION", "SUPPLIER"] : analysis === "INVENTORY" ? ["OPENING_STOCK", "RECEIPTS", "CONSUMPTION", "ADJUSTMENTS"]
        : analysis === "REORDER" ? ["CONSUMPTION_RATE", "LEAD_TIME", "SAFETY_STOCK"] : ["INSPECTED", "ACCEPTED", "REJECTED"];
      const ids = entities(kinds);
      if (!ids.length) ids.push("undeclared-entity");
      for (const entity of ids) {
        if (analysis === "SUPPLY") {
          add(analysis, p, entity, "supplier_shortfall", outputUnit(entity, p), (o) => positivePart(arithmetic("SUBTRACT", o.amount("CONSUMPTION", entity), o.amount("SUPPLIER", entity, true))));
        } else if (analysis === "INVENTORY") {
          add(analysis, p, entity, "inventory_projected_balance", outputUnit(entity, p), (o) => o.inventory(entity));
          add(analysis, p, entity, "inventory_shortage", outputUnit(entity, p), (o) => positivePart(arithmetic("SUBTRACT", "0", o.inventory(entity))));
          add(analysis, p, entity, "inventory_receipts", outputUnit(entity, p), (o) => o.amount("RECEIPTS", entity, true));
          add(analysis, p, entity, "inventory_consumption", outputUnit(entity, p), (o) => o.amount("CONSUMPTION", entity));
        } else if (analysis === "REORDER") {
          add(analysis, p, entity, "reorder_threshold", quantity(entity), (o) => {
            const rate = o.single("CONSUMPTION_RATE", entity); const lead = o.single("LEAD_TIME", entity);
            requireCalculation(rate.unit.kind === "RATE" && lead.unit.kind === "LEAD_TIME" && rate.unit.per === lead.unit.basis, "INCOMPATIBLE_UNITS");
            return arithmetic("ADD", arithmetic("MULTIPLY", rate.value, lead.value), o.amount("SAFETY_STOCK", entity));
          });
        } else {
          for (const [key, numerator] of [["observed_yield", "ACCEPTED"], ["rejection_ratio", "REJECTED"]] as const) {
            add(analysis, p, entity, key, { kind: "QUALITY_PERCENT" }, (o) => {
              const schedules = (["INSPECTED", "ACCEPTED", "REJECTED"] as const).map((k) => o.schedule(k));
              requireCalculation(new Set(schedules.map((s) => s.cohortId)).size === 1, "INCOMPATIBLE_COHORT");
              const inspected = o.amount("INSPECTED", entity); const accepted = o.amount("ACCEPTED", entity); const rejected = o.amount("REJECTED", entity);
              requireCalculation(compare(arithmetic("ADD", accepted, rejected), inspected) === 0, "QUALITY_RECONCILIATION_FAILED");
              requireCalculation(compare(inspected, "0") > 0, "ZERO_DENOMINATOR");
              return arithmetic("MULTIPLY", arithmetic("DIVIDE", numerator === "ACCEPTED" ? accepted : rejected, inspected), "100");
            });
          }
        }
      }
    }
  }
  if (has("PREREQUISITES")) add("PREREQUISITES", null, request.siteId, "prerequisite_gap_count", { kind: "COUNT" }, (o) => {
    o.record(request.requirements.evidence); request.requirements.entries.forEach((e) => o.record(e.evidence));
    requireCalculation(request.requirements.applicabilityComplete, "INCOMPLETE_APPLICABILITY");
    return String(request.requirements.entries.filter((e) => !["EVIDENCED", "NOT_APPLICABLE"].includes(e.status)).length);
  });
  for (const [analysis, declared, reason] of [
    ["SCENARIOS", request.scenarios.length, "SCENARIO_NOT_DECLARED"],
    ["SENSITIVITY", request.sensitivity.length, "SENSITIVITY_NOT_DECLARED"],
  ] as const) if (has(analysis) && (!declared || request.analyses.every((a) => a === "SCENARIOS" || a === "SENSITIVITY"))) {
    add(analysis, null, request.siteId, analysis.toLowerCase(), { kind: "COUNT" }, () => { throw new CalculationGap(declared ? "NO_CALCULATION_ANALYSIS" : reason); });
  }
  return jobs;
}

function planCalculationVariants(base: OperationalRequest) {
  const variants: { id: string; model: OperationalRequest; evidence: z.infer<typeof operationalEvidenceSchema>[]; overrides: { valueId: string; value: string | null }[] }[] = [
    { id: "base", model: base, evidence: [], overrides: [] },
  ];
  const variant = (id: string, overrides: { valueId: string; value: string | null }[], evidence: z.infer<typeof operationalEvidenceSchema>[]) => {
    const model = {
      ...base, values: base.values.map((v) => {
        const override = overrides.find((entry) => entry.valueId === v.id);
        return override ? operationalValueSchema.parse({ ...v, value: override.value }) : v;
      }),
    };
    variants.push({ id, model, evidence, overrides });
  };
  if (base.analyses.includes("SCENARIOS")) for (const scenario of base.scenarios) variant(`scenario:${scenario.id}`, scenario.overrides, scenario.evidence);
  if (base.analyses.includes("SENSITIVITY")) for (const driver of base.sensitivity) {
    for (const point of ["low", "base", "high"] as const) variant(`sensitivity:${driver.id}:${point}`, [{ valueId: driver.valueId, value: driver[point] }], driver.evidence);
  }
  const planned = variants.map((entry) => ({ ...entry, jobs: calculationJobs(entry.model) }));
  const findings = base.analyses.includes("PREREQUISITES") ? base.requirements.entries.length : 0;
  if (planned.reduce((n, v) => n + v.jobs.length, findings) > operationalBounds.metrics) throw new RangeError("Operational expanded scalar metric limit exceeded");
  return planned;
}
export function assertOperationalCalculationBudget(raw: unknown, evaluatedAt: string) {
  const request = normalizeOperationalRequest(raw, evaluatedAt).normalized;
  return planCalculationVariants(request).reduce((n, entry) => n + entry.jobs.length, 0);
}
export function calculateOperational(rawRequest: unknown, rawInputs: unknown, rawContext: OperationalContext) {
  const context = operationalContextSchema.parse(rawContext);
  const request = normalizeOperationalRequest(rawRequest, context.evaluatedAt);
  const inputs = normalizeOperationalInputs(rawInputs);
  const base = request.normalized;
  const planned = planCalculationVariants(base);
  const work = operationalWork(base);
  let calculationWorkUnits = 0;
  const charge = (units: number) => {
    calculationWorkUnits += units;
    if (work.costUnits + calculationWorkUnits > operationalBounds.budgetUnits) throw new RangeError("Operational calculation work budget exceeded");
  };
  const metrics = planned.flatMap((entry) => entry.jobs.map((job): OperationalCalculationMetric => {
    charge(1);
    const operands = new Operands(entry.model, job.periodId ?? entry.model.periods[0]!.id, inputs, charge);
    let exactValue: string | null = null; let reason: Reason | null = null;
    try {
      requireCalculation(supportsOperationalSerial(entry.model), "UNSUPPORTED_PROCESS_NETWORK");
      operands.record(entry.evidence);
      exactValue = job.calculate(operands);
    } catch (error) {
      if (!(error instanceof CalculationGap)) throw error;
      reason = error.reason;
    }
    const values = [...operands.used.values()];
    const estimated = values.some((v) => v.nature === "DECLARED_ASSUMPTION");
    return metricSchema.parse({
      key: job.key, analysis: job.analysis, periodId: job.periodId, entityId: job.entityId, siteId: base.siteId, variant: entry.id,
      status: exactValue === null ? reason === "UNSUPPORTED_PROCESS_NETWORK" ? "NOT_SUPPORTED" : "NOT_COMPUTABLE" : estimated ? "ESTIMATED" : "COMPUTED",
      value: exactValue === null ? null : roundOperationalDecimal(exactValue), exactValue, unit: job.unit,
      interpretation: exactValue === null ? "UNAVAILABLE" : job.analysis === "QUALITY" ? "OBSERVED_RATIO" : job.analysis === "PREREQUISITES" ? "EVIDENCE_GAPS" : "PLAN_DERIVED",
      method: { id: `operational.${job.key}`, version: "1.0.0" },
      operandIds: values.map((v) => v.id).sort(compareText),
      assumptionIds: values.filter((v) => v.nature === "DECLARED_ASSUMPTION").map((v) => v.id).sort(compareText),
      evidence: [...operands.evidence.entries()].sort(([a], [b]) => compareText(a, b)).map(([, ref]) => ref),
      confidence: exactValue === null ? null : assessOperationalConfidence(values,
        inputs.filter((i) => [...operands.evidence.values()].some((ref) => ref.inputId === i.id)), true),
      reasons: reason ? [reason] : [], limitingStageIds: operands.limitingStageIds,
      limitations: [...new Set([
        "Declared operational arithmetic only; not market demand, sales, success odds or a launch/investment recommendation.",
        ...(job.analysis === "INVENTORY" || job.analysis === "SUPPLY" ? ["Period-end arithmetic does not establish intraperiod availability; signed inventory is projected net requirement/backlog, not physical negative stock."] : []),
        ...(job.analysis === "PREREQUISITES" ? ["Declared applicability and evidence gaps only; not compliance certification."] : []),
        ...values.flatMap((v) => v.limitations),
      ])],
    });
  }));
  const core = {
    contract: "jenan.operational-feasibility.calculation-result/v1" as const, phase: "M3_CALCULATIONS" as const,
    runId: context.runId, evaluatedAt: context.evaluatedAt,
    engine: { key: "operational-feasibility" as const, version: OPERATIONAL_CALCULATION_VERSION, environment: context.environment },
    request: { normalized: base, evaluatedAt: context.evaluatedAt }, inputs, metrics,
    variants: planned.map((v) => ({ id: v.id, overrides: v.overrides, evidence: v.evidence })),
    prerequisiteFindings: base.analyses.includes("PREREQUISITES") ? base.requirements : null,
    rights: deriveRights(inputs), attribution: deriveAttribution(inputs),
    policies: { decimal: operationalDecimalPolicy, confidence: operationalConfidencePolicy },
    limits: { ...work, scalarMetrics: metrics.length, metricBudget: operationalBounds.metrics, calculationWorkUnits,
      totalCostUnits: work.costUnits + calculationWorkUnits },
    status: metrics.some((m) => m.exactValue === null) ? "COMPLETED_WITH_GAPS" as const : "COMPLETED" as const,
    realDataAcceptance: "BLOCKED / NOT VERIFIED" as const, timing: context.timing,
  };
  const result = {
    ...core, determinism: { requestHash: request.requestHash, inputsHash: canonicalHash(inputs),
      outputHash: canonicalHash(omitKeys(core, ["runId", "timing"])) },
  };
  ensureOperationalSize(result);
  return result;
}
export type OperationalCalculationResult = ReturnType<typeof calculateOperational>;
export function validateOperationalCalculationResult(raw: unknown): OperationalCalculationResult {
  ensureOperationalSize(raw);
  const shell = z.object({
    runId: operationalContextSchema.shape.runId, evaluatedAt: operationalContextSchema.shape.evaluatedAt,
    timing: operationalContextSchema.shape.timing,
    engine: z.object({ environment: operationalContextSchema.shape.environment }),
    request: z.object({ normalized: z.unknown() }), inputs: z.unknown(),
  }).parse(raw);
  const expected = calculateOperational(shell.request.normalized, shell.inputs, {
    runId: shell.runId, evaluatedAt: shell.evaluatedAt, timing: shell.timing, environment: shell.engine.environment,
  });
  if (canonicalize(expected) !== canonicalize(raw)) throw new RangeError("Operational M3 result/hash/semantics mismatch");
  return expected;
}
