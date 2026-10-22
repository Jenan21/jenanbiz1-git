import { describe, expect, it } from "vitest";
import {
  buildOperationalFoundationRecord, buildOperationalFoundationResult, normalizeOperationalInputs, normalizeOperationalRequest,
  operationalContextSchema, operationalDatasetSchema, operationalFoundationResultSchema,
  operationalRequestSchema, operationalScheduleSchema, operationalValueSchema, supportsOperationalSerial,
  validateOperationalFoundationResult, type OperationalRequest,
} from "@/services/analysis-engines/operational-feasibility";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { runRecordSchema } from "@/services/analysis-engines/shared/run-record";
import { operationalContext as context, operationalDisclosure, operationalEvidence, operationalInputs, operationalRequest, operationalValue } from "./support/operational-feasibility-fixtures";

describe("Operational M1 strict contracts and policy", () => {
  it("preserves PLAN, missing != zero and produces no operational calculations or success claims", () => {
    const request = operationalRequest(); request.values[0]!.value = null;
    const result = buildOperationalFoundationResult(request, operationalInputs(), context);
    expect(result.metrics).toHaveLength(9);
    expect(result.metrics.every((metric) => metric.value === null && metric.confidence === null && metric.status === "NOT_COMPUTABLE")).toBe(true);
    expect(result.metrics.find((m) => m.analysis === "CAPACITY")!.reasons).toContain("MISSING_OPERAND");
    expect(result.request.normalized.schedules.find((s) => s.kind === "TARGET")!.interpretation).toBe("PLAN");
    expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED"); expect(result.rights.allowExport).toBe(false);
    expect(validateOperationalFoundationResult(result)).toEqual(result);
  });
  it.each(["BRANCHED", "PARALLEL", "REWORK", "SHARED_RESOURCE"] as const)("returns NOT_SUPPORTED for %s, never simplifying it", (kind) => {
    const request = operationalRequest(); request.network.kind = kind;
    const result = buildOperationalFoundationResult(request, operationalInputs(), context);
    expect(result.metrics.every((m) => m.status === "NOT_SUPPORTED" && m.reasons.includes("UNSUPPORTED_PROCESS_NETWORK"))).toBe(true);
    expect(supportsOperationalSerial(request)).toBe(false);
  });
  it.each(["shared", "mixed-output", "gross"] as const)("does not silently support ambiguous serial %s", (kind) => {
    const request = operationalRequest();
    if (kind === "gross") request.network.lossBasis = "GROSS_OR_UNKNOWN";
    else request.network.stages.push({ id: "second", poolId: kind === "shared" ? "pool-1" : "pool-2", outputId: kind === "mixed-output" ? "other" : "service" });
    expect(buildOperationalFoundationResult(request, operationalInputs(), context).metrics[0]!.status).toBe("NOT_SUPPORTED");
  });
  const invalidRequests: [string, (request: OperationalRequest) => void][] = [
    ["target observed", (r) => { r.schedules[0]!.interpretation = "OBSERVED"; }],
    ["duplicate analysis", (r) => { r.analyses.push("CAPACITY"); }],
    ["duplicate value", (r) => { r.values.push(structuredClone(r.values[0]!)); }],
    ["duplicate schedule", (r) => { r.schedules.push(structuredClone(r.schedules[0]!)); }],
    ["unknown operand", (r) => { r.schedules[0]!.rows[0]!.valueId = "absent"; }],
    ["wrong period", (r) => { r.values[0]!.periodId = "unknown"; }],
    ["wrong site", (r) => { r.values[0]!.siteId = "other"; }],
    ["wrong unit", (r) => { r.values[0]!.unit = { kind: "TIME", basis: "HOUR" }; }],
    ["wrong entity", (r) => { r.schedules[0]!.rows[0]!.entityId = "other"; }],
    ["double-count row", (r) => { r.schedules[0]!.rows.push({ ...r.schedules[0]!.rows[0]!, id: "duplicate-value" }); }],
    ["unknown coverage", (r) => { r.schedules[0]!.coveredPeriodIds = ["other"]; }],
    ["duplicate coverage", (r) => { r.schedules[0]!.coveredPeriodIds.push("p1"); }],
    ["unapproved attestation", (r) => { r.values[0]!.approval = "UNREVIEWED"; }],
    ["approval predates declaration", (r) => { r.values[0]!.approvedAt = "2026-09-01T00:00:00.000Z"; }],
    ["negative quantity", (r) => { r.values[0]!.value = "-1"; }],
    ["fractional discrete units", (r) => { r.values[0]!.value = "1.5"; }],
    ["assumption as observed", (r) => { r.schedules[1]!.interpretation = "OBSERVED"; }],
    ["supplier classification on target", (r) => { r.schedules[0]!.rows[0]!.supplierStatus = "COMMITTED"; }],
    ["subtraction outside adjustment", (r) => { r.schedules[0]!.rows[0]!.direction = "SUBTRACT"; }],
    ["dated receipt after period", (r) => { r.schedules[0]!.rows[0]!.effectiveDate = "2026-11-01"; }],
    ["dated receipt before period", (r) => { r.schedules[0]!.rows[0]!.effectiveDate = "2026-09-30"; }],
  ];
  it.each(invalidRequests)("rejects %s", (_, mutate) => {
    const request = operationalRequest(); mutate(request);
    expect(() => normalizeOperationalRequest(request, context.evaluatedAt)).toThrow();
  });
  it.each(["operationalScore", "successProbability", "recommendation", "headcount", "actor", "organizationId", "marketDemand"])("rejects extra model field %s", (field) => {
    expect(operationalRequestSchema.safeParse({ ...operationalRequest(), [field]: 1 }).success).toBe(false);
  });
  it.each(["headcount", "productiveHours", "successProbability"])("rejects extra operand field %s", (field) => {
    expect(operationalValueSchema.safeParse({ ...operationalValue(), [field]: 10 }).success).toBe(false);
  });
  it.each(["0", null])("retains declared %s without filling it", (value) => {
    const parsed = operationalValueSchema.parse(operationalValue("target", value));
    expect(parsed.value).toBe(value);
  });
  it.each(["2", "-0.1"])("rejects out-of-range fraction %s", (value) => {
    expect(operationalValueSchema.safeParse({ ...operationalValue("yield", value), unit: { kind: "FRACTION" } }).success).toBe(false);
  });
  it.each(["NaN", "Infinity", "1e3", "", "1000000000000000000"])("returns a schema failure for invalid operand %s without throwing from a refinement", (value) => {
    expect(operationalValueSchema.safeParse(operationalValue("invalid", value)).success).toBe(false);
    const request = operationalRequest();
    request.sensitivity = [{ ...operationalDisclosure, id: "invalid", valueId: "target", low: value, base: "200", high: "300" }];
    expect(operationalRequestSchema.safeParse(request).success).toBe(false);
  });
  it("allows overload above 100 without labeling it a bounded share", () => {
    expect(operationalValueSchema.parse({ ...operationalValue("load", "111.111111"), unit: { kind: "LOAD_PERCENT" } }).value).toBe("111.111111");
  });
  it.each(["declaration", "approval", "scenario"])("rejects future %s", (kind) => {
    const request = operationalRequest();
    if (kind === "declaration") request.values[0]!.declaredAt = "2099-01-01T00:00:00.000Z";
    if (kind === "approval") request.values[0]!.approvedAt = "2099-01-01T00:00:00.000Z";
    if (kind === "scenario") request.scenarios.push({ ...operationalDisclosure, declaredAt: "2099-01-01T00:00:00.000Z", id: "future", overrides: [{ valueId: "target", value: "100" }] });
    expect(() => normalizeOperationalRequest(request, context.evaluatedAt)).toThrow();
  });
  it("keeps quotations unavailable as commitments, not a hidden zero or firm supply", () => {
    const request = operationalRequest(); request.analyses = ["SUPPLY"];
    request.schedules = [structuredClone(request.schedules[0]!)];
    request.schedules[0]!.kind = "SUPPLIER"; request.schedules[0]!.rows[0]!.supplierStatus = "QUOTATION";
    const result = buildOperationalFoundationResult(request, operationalInputs(), context);
    expect(result.metrics[0]!.reasons).toContain("QUOTATION_NOT_COMMITMENT"); expect(result.metrics[0]!.value).toBeNull();
    expect(result.request.normalized.schedules[0]!.rows[0]!.supplierStatus).toBe("QUOTATION");
  });
  it("requires explicit hours-per-FTE and the matching role/calendar", () => {
    const request = operationalRequest(); request.schedules[0]!.kind = "FTE_HOURS";
    request.values[0]!.unit = { kind: "HOURS_PER_FTE", roleId: "service", calendarId: "p1" };
    expect(operationalRequestSchema.safeParse(request).success).toBe(true);
    request.values[0]!.unit.calendarId = "unknown";
    expect(operationalRequestSchema.safeParse(request).success).toBe(false);
  });
  it("flags absent workforce schedules, never derives available hours from a count", () => {
    const metric = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), context).metrics.find((m) => m.analysis === "WORKFORCE")!;
    expect(metric.reasons).toContain("MISSING_REQUIRED_SCHEDULE"); expect(metric.value).toBeNull();
  });
  it("flags missing source references without doing I/O or asserting authorization", () => {
    const result = buildOperationalFoundationResult(operationalRequest(), [], context);
    expect(result.metrics.every((metric) => metric.reasons.includes("INPUT_NOT_AVAILABLE"))).toBe(true);
  });
  it("rejects duplicate input IDs/versions and ungovened descriptors", () => {
    const input = operationalInputs()[0]!;
    expect(() => normalizeOperationalInputs([input, input])).toThrow();
    expect(() => normalizeOperationalInputs([{ ...input, checksum: null }])).toThrow();
    expect(() => normalizeOperationalInputs([{ ...input, kind: "ENGINE_RUN" }])).toThrow();
  });
  it("does not equate an unknown applicable set with zero missing requirements", () => {
    const metric = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), context).metrics.find((m) => m.analysis === "PREREQUISITES")!;
    expect(metric.reasons).toContain("INCOMPLETE_APPLICABILITY");
  });
  it("requires evidence for both a supported requirement and not-applicable declaration", () => {
    for (const status of ["EVIDENCED", "NOT_APPLICABLE"] as const) {
      const request = operationalRequest(); request.requirements.entries.push({ id: "rule", status, rationale: "Explicit reviewed reason", evidence: [] });
      expect(operationalRequestSchema.safeParse(request).success).toBe(false);
      request.requirements.entries[0]!.evidence = [operationalEvidence];
      expect(operationalRequestSchema.safeParse(request).success).toBe(true);
    }
  });
  it("validates dataset approval rather than trusting an unreviewed model", () => {
    const dataset = { contract: "jenan.operational-feasibility.dataset/v1", sourceId: "source-1", model: operationalRequest(),
      approval: { approvedBy: "Synthetic reviewer", approvedAt: "2026-10-03T00:00:00.000Z", evidence: [operationalEvidence] } };
    expect(operationalDatasetSchema.safeParse(dataset).success).toBe(true);
    dataset.approval.approvedAt = "2026-10-01T00:00:00.000Z";
    expect(operationalDatasetSchema.safeParse(dataset).success).toBe(false);
  });
  it("requires a canonical timestamp, complete contiguous intervals and valid timezone", () => {
    expect(operationalContextSchema.safeParse({ ...context, evaluatedAt: "2026-10-22" }).success).toBe(false);
    const request = operationalRequest(); request.periods[0]!.timeZone = "not-a-zone";
    expect(operationalRequestSchema.safeParse(request).success).toBe(false);
  });
  it("rejects a calendar gap, overlapping intervals and timezone mismatch", () => {
    for (const kind of ["gap", "overlap", "timezone"]) {
      const request = operationalRequest();
      request.periods.push({ ...request.periods[0]!, id: "p2", startDate: kind === "gap" ? "2026-12-01" : kind === "overlap" ? "2026-10-01" : "2026-11-01", endDate: kind === "gap" ? "2027-01-01" : kind === "overlap" ? "2026-11-01" : "2026-12-01", timeZone: kind === "timezone" ? "UTC" : "Asia/Riyadh" });
      expect(operationalRequestSchema.safeParse(request).success).toBe(false);
    }
  });
  it("reports an explicit zero cycle denominator rather than a numeric zero capacity", () => {
    const request = operationalRequest(); request.values.find((v) => v.id === "cycle")!.value = "0";
    const metric = buildOperationalFoundationResult(request, operationalInputs(), context).metrics.find((m) => m.analysis === "CAPACITY")!;
    expect(metric.reasons).toContain("ZERO_DENOMINATOR"); expect(metric.value).toBeNull();
  });
  it("reports unresolved resource/cycle allocation instead of reassigning a pool", () => {
    const request = operationalRequest(); const cycle = request.values.find((v) => v.id === "cycle")!;
    cycle.unit = { kind: "TIME_PER_UNIT", poolId: "other-pool", entity: "service", basis: "MINUTE" };
    expect(buildOperationalFoundationResult(request, operationalInputs(), context).metrics.find((m) => m.analysis === "CAPACITY")!.reasons).toContain("INCOMPATIBLE_RESOURCE");
  });
  it("does not convert calendar-day consumption into working-day lead time", () => {
    const request = operationalRequest(); request.analyses = ["REORDER"];
    const rate = operationalValue("rate", "4"); rate.unit = { kind: "RATE", entity: "service", per: "CALENDAR_DAY" };
    const lead = operationalValue("lead", "3"); lead.unit = { kind: "LEAD_TIME", basis: "WORKING_DAY" };
    request.values = [rate, lead];
    request.schedules = [
      { ...request.schedules[0]!, id: "rate", kind: "CONSUMPTION_RATE", rows: [{ ...request.schedules[0]!.rows[0]!, id: "rate-row", valueId: "rate" }] },
      { ...request.schedules[0]!, id: "lead", kind: "LEAD_TIME", rows: [{ ...request.schedules[0]!.rows[0]!, id: "lead-row", valueId: "lead" }] },
    ];
    expect(buildOperationalFoundationResult(request, operationalInputs(), context).metrics[0]!.reasons).toContain("INCOMPATIBLE_UNITS");
  });
  it("requires observed quality counts with a cohort and rejects an assumed quality schedule", () => {
    const request = operationalRequest(); request.schedules = [request.schedules[0]!];
    request.schedules[0]!.kind = "INSPECTED";
    expect(operationalRequestSchema.safeParse(request).success).toBe(false);
    request.values[0]!.nature = "OBSERVED"; request.schedules[0]!.interpretation = "OBSERVED"; request.schedules[0]!.cohortId = "cohort-1";
    expect(operationalRequestSchema.safeParse(request).success).toBe(true);
  });
});

describe("Operational missingness, schedules and scenarios", () => {
  it.each([
    ["COMPLETE", false, false], ["COMPLETE", true, true], ["PARTIAL", false, true], ["PARTIAL", true, false],
    ["MISSING", false, true], ["MISSING", true, false],
  ] as const)("empty schedule %s / explicit=%s valid=%s", (completeness, noApplicableItems, valid) => {
    const schedule = operationalRequest().schedules[0]!;
    expect(operationalScheduleSchema.safeParse({ ...schedule, completeness, noApplicableItems, rows: [] }).success).toBe(valid);
  });
  it("does not replace a missing schedule or operand with a zero", () => {
    const request = operationalRequest(); request.schedules[0]!.completeness = "MISSING"; request.schedules[0]!.rows = [];
    const result = buildOperationalFoundationResult(request, operationalInputs(), context);
    expect(result.metrics.find((m) => m.analysis === "CAPACITY")!.reasons).toContain("MISSING_REQUIRED_SCHEDULE");
  });
  it("accepts explicit bounded scenario and sensitivity points without calculating them", () => {
    const request = operationalRequest();
    request.scenarios = [{ ...operationalDisclosure, id: "declared-case", overrides: [{ valueId: "target", value: "100" }] }];
    request.sensitivity = [{ ...operationalDisclosure, id: "declared-band", valueId: "target", low: "100", base: "200", high: "300" }];
    const result = buildOperationalFoundationResult(request, operationalInputs(), context);
    expect(result.metrics.find((m) => m.analysis === "SCENARIOS")!.reasons).not.toContain("SCENARIO_NOT_DECLARED");
    expect(result.metrics.find((m) => m.analysis === "SENSITIVITY")!.value).toBeNull();
  });
  it.each(["unknown", "duplicate", "negative", "wrong-base", "unordered"] as const)("rejects scenario/sensitivity %s", (kind) => {
    const request = operationalRequest();
    request.scenarios = [{ ...operationalDisclosure, id: "case", overrides: [{ valueId: kind === "unknown" ? "absent" : "target", value: kind === "negative" ? "-1" : "100" }] }];
    if (kind === "duplicate") request.scenarios[0]!.overrides.push({ valueId: "target", value: "100" });
    if (kind === "wrong-base" || kind === "unordered") request.sensitivity = [{ ...operationalDisclosure, id: "band", valueId: "target", low: kind === "unordered" ? "400" : "100", base: kind === "wrong-base" ? "201" : "200", high: "300" }];
    expect(operationalRequestSchema.safeParse(request).success).toBe(false);
  });
});

describe("Operational deterministic result and unchanged Shared history shape", () => {
  it("normalizes decimals, unordered collections and object keys without mutating caller input", () => {
    const first = operationalRequest(); first.values[0]!.value = "200.000";
    const original = structuredClone(first); const second = structuredClone(first);
    second.values.reverse(); second.schedules.reverse(); second.analyses.reverse();
    const a = buildOperationalFoundationResult(first, operationalInputs(), context);
    const b = buildOperationalFoundationResult(second, operationalInputs(), context);
    expect(a.determinism).toEqual(b.determinism); expect(first).toEqual(original);
    expect(a.request.normalized.values.find((v) => v.id === "target")!.value).toBe("200");
  });
  it("excludes run identity/timing but not evaluatedAt or operational content from semantic output hash", () => {
    const a = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), context);
    const b = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), { ...context, runId: "other", timing: { ...context.timing, durationMs: 10 } });
    expect(a.determinism).toEqual(b.determinism);
    const c = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), { ...context, evaluatedAt: "2026-10-23T00:00:00.000Z" });
    expect(a.determinism.requestHash).not.toBe(c.determinism.requestHash);
    const request = operationalRequest(); request.values[0]!.value = "201";
    expect(buildOperationalFoundationResult(request, operationalInputs(), context).determinism.requestHash).not.toBe(a.determinism.requestHash);
  });
  it.each(["value", "confidence", "hash", "unsupported", "rights", "policy", "extra"] as const)("refuses forged %s even with a recomputed outer hash", (kind) => {
    const result = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), context);
    const raw: Record<string, unknown> = structuredClone(result);
    if (kind === "value") raw.metrics = [{ ...result.metrics[0], value: "240" }];
    if (kind === "confidence") raw.metrics = [{ ...result.metrics[0], confidence: { band: "HIGH" } }];
    if (kind === "hash") raw.determinism = { ...result.determinism, inputsHash: "f".repeat(64) };
    if (kind === "unsupported") raw.metrics = [{ ...result.metrics[0], status: "COMPUTED" }];
    if (kind === "rights") raw.rights = { ...result.rights, allowExport: true };
    if (kind === "policy") raw.policies = { decimal: { precision: 10 } };
    if (kind === "extra") raw.successProbability = 1;
    raw.determinism = { ...result.determinism, ...(kind === "hash" ? { inputsHash: "f".repeat(64) } : {}), outputHash: canonicalHash(omitKeys(raw, ["runId", "timing", "determinism"])) };
    expect(() => validateOperationalFoundationResult(raw)).toThrow();
    expect(() => buildOperationalFoundationRecord(raw, { actor: { kind: "USER", id: "owner" }, createdAt: context.evaluatedAt })).toThrow();
  });
  it("uses unchanged Shared run/input JSON contracts with no metric coercion or database access", () => {
    const result = buildOperationalFoundationResult(operationalRequest(), operationalInputs(), context);
    const record = buildOperationalFoundationRecord(result, { actor: { kind: "USER", id: "owner" }, createdAt: context.evaluatedAt });
    expect(runRecordSchema.parse(record)).toEqual(record); expect(record.result).toEqual(result);
    expect(record.inputs[0]!.snapshot).toEqual(result.inputs[0]);
    expect(record.requestHash).toBe(result.determinism.requestHash); expect(record.confidence).toBeNull();
    expect(record.runtime.phase).toBe("M1_FOUNDATION");
    expect(operationalFoundationResultSchema.safeParse({ ...result, successProbability: 100 }).success).toBe(false);
  });
  it("results from separate calls do not share mutable state", () => {
    const request = operationalRequest(); const inputs = operationalInputs();
    const a = buildOperationalFoundationResult(request, inputs, context); const b = buildOperationalFoundationResult(request, inputs, context);
    a.request.normalized.values[0]!.value = "999"; a.inputs[0]!.roles.push("mutated");
    expect(b.request.normalized.values.some((v) => v.value === "999")).toBe(false); expect(inputs[0]!.roles).not.toContain("mutated");
  });
});
