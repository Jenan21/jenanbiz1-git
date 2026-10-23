import { describe, expect, it } from "vitest";
import {
  buildRiskFoundation, buildRiskFoundationRecord, checkRiskComparability, compareRiskDecimals, ensureRiskJsonSize, normalizeRiskDecimal, normalizeRiskRequest,
  riskApprovalSchema, riskBasisSchema, riskClaimSchema, riskContextSchema, riskDecimalSchema, riskFindingSchema,
  riskFoundationResultSchema, riskLikelihoodSchema, riskPeriodSchema, riskRequestSchema, riskSnapshotSchema, validateRiskFoundation,
} from "@/services/analysis-engines/risk-decision";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import { MAX_RUN_JSON_BYTES, runRecordSchema } from "@/services/analysis-engines/shared/run-record";
import { makeInput } from "./support/analysis-engine-fixtures";
import { riskApproval, riskBasis, riskContext, riskFixture, riskScope } from "./support/risk-decision-fixtures";

describe("Risk M1 strict deterministic foundation without I/O or business decisions", () => {
  it("retains six exact engine contracts and synthetic evidence without producing a decision or risk", () => {
    const f = riskFixture(); const before = structuredClone(f);
    const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    expect(result.snapshots).toHaveLength(6); expect(result.inputs).toHaveLength(7);
    expect(result.decision).toBeNull(); expect(result.findings).toEqual([]); expect(result.conditionOutcomes).toEqual([]);
    expect(result.currentAuthorization).toBe("NOT_CHECKED_M1"); expect(result.sourceValidation).toBe("DEFERRED_M2");
    expect(result.rights.allowExport).toBe(false); expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(validateRiskFoundation(result)).toEqual(result); expect(f).toEqual(before);
  });
  it("retains actual ENGINE_RUN / ENGINE_OUTPUT / ANALYSIS_ENGINE primitives unchanged", () => {
    const f = riskFixture(); const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    const record = buildRiskFoundationRecord(result, { actor: { kind: "USER", id: "synthetic-owner" }, createdAt: riskContext.evaluatedAt });
    expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record.inputs.filter((i) => i.kind === "ENGINE_RUN")).toHaveLength(6);
    expect(record.inputs.filter((i) => i.kind === "DATA_CENTER_VERSION")).toHaveLength(1);
    expect(record.confidence).toBeNull(); expect(record.result).toEqual(result);
    expect(record.runtime).toMatchObject({ phase: "M1_STORAGE_COMPATIBILITY_ONLY" });
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
  it("keeps identical semantics deterministic across shuffled sets and execution IDs/timing", () => {
    const f = riskFixture(); const original = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    f.request.engineSlots.reverse(); f.request.claims.reverse(); f.inputs.reverse(); f.snapshots.reverse();
    f.context.runId = "another-execution"; f.context.timing.durationMs = 50;
    const changed = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    expect(changed.determinism).toEqual(original.determinism);
  });
  it.each(["policy", "pin", "scope", "evaluatedAt", "rights", "evidence"] as const)("binds %s into deterministic hashes", (field) => {
    const f = riskFixture(); const original = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    if (field === "policy") f.request.policy.rules[0]!.rationale = "A new declared policy explanation";
    if (field === "pin") {
      f.snapshots[0]!.pin.contentHash = "b".repeat(64);
      const slot = f.request.engineSlots.find((s) => s.engineKey === f.snapshots[0]!.pin.engineKey)!;
      if (slot.state === "PINNED") slot.runs[0]!.contentHash = "b".repeat(64);
    }
    if (field === "scope") f.request.scope.subject = "another-decision-subject";
    if (field === "evaluatedAt") f.context.evaluatedAt = "2026-10-21T12:00:00.000Z";
    if (field === "rights") f.inputs[0]!.usagePolicy = "New retained policy restriction";
    if (field === "evidence") f.snapshots[0]!.claims[0]!.evidence[0]!.recordId = "another-retained-record";
    expect(buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context).determinism.outputHash).not.toBe(original.determinism.outputHash);
  });
  it.each(["decision", "successPercentage", "probabilityOfSuccess", "finalScore", "authorization", "extra"] as const)("rejects undeclared request surface %s", (key) => {
    expect(riskRequestSchema.safeParse({ ...riskFixture().request, [key]: 1 }).success).toBe(false);
  });
  it.each(["missing-slot", "duplicate-slot", "wrong-engine", "duplicate-run", "future-run", "unknown-version", "foundation-contract", "duplicate-claim", "unresolved-claim", "unresolved-rule", "unsafe-pointer", "invalid-pointer", "deep-pointer", "expired-policy", "future-approval", "invalid-timezone"] as const)("rejects %s request", (kind) => {
    const f = riskFixture();
    const slot = f.request.engineSlots[0]!;
    if (slot.state !== "PINNED") throw new Error("Fixture pin required");
    if (kind === "missing-slot") f.request.engineSlots.pop();
    if (kind === "duplicate-slot") f.request.engineSlots[1] = structuredClone(slot);
    if (kind === "wrong-engine") slot.runs[0]!.engineKey = "market-demand";
    if (kind === "duplicate-run") slot.runs.push(structuredClone(slot.runs[0]!));
    if (kind === "future-run") slot.runs[0]!.evaluatedAt = "2028-01-01T00:00:00.000Z";
    if (kind === "unknown-version") slot.runs[0]!.engineVersion = "latest";
    if (kind === "foundation-contract") slot.runs[0]!.resultContract = "jenan.operational-feasibility.result/v1";
    if (kind === "duplicate-claim") f.request.claims.push({ ...f.request.claims[0]!, id: "alias" });
    if (kind === "unresolved-claim") f.request.claims[0]!.runId = "not-pinned";
    if (kind === "unresolved-rule" && "claimId" in f.request.policy.rules[0]!) f.request.policy.rules[0]!.claimId = "not-selected";
    if (kind === "unsafe-pointer") f.request.claims[0]!.pointer = "/__proto__/x";
    if (kind === "invalid-pointer") f.request.claims[0]!.pointer = "/bad~2escape";
    if (kind === "deep-pointer") f.request.claims[0]!.pointer = "/x".repeat(20);
    if (kind === "expired-policy") f.request.policy.validity.end = f.context.evaluatedAt;
    if (kind === "future-approval") f.request.policy.approval.approvedAt = "2028-01-01T00:00:00.000Z";
    if (kind === "invalid-timezone") f.request.scope.period.timeZone = "not/a/timezone";
    expect(() => normalizeRiskRequest(f.request, f.context.evaluatedAt)).toThrow();
  });
  it.each(["missing-policy", "unrequested-input", "wrong-policy-role", "wrong-policy-checksum", "wrong-run-checksum", "missing-snapshot", "duplicate-snapshot", "claim-basis", "claim-key", "claim-variant", "claim-entity", "unresolved-evidence", "rights-widening", "future-created-at"] as const)("rejects %s foundation/storage", (kind) => {
    const f = riskFixture();
    if (kind === "missing-policy") f.inputs.shift();
    if (kind === "unrequested-input") f.inputs.push({ ...f.inputs[0]!, id: "extra" });
    if (kind === "wrong-policy-role") f.inputs[0]!.roles = ["operational.model"];
    if (kind === "wrong-policy-checksum") f.inputs[0]!.checksum!.value = "b".repeat(64);
    if (kind === "wrong-run-checksum") f.inputs[1]!.checksum!.value = "b".repeat(64);
    if (kind === "missing-snapshot") f.snapshots.pop();
    if (kind === "duplicate-snapshot") f.snapshots[1] = structuredClone(f.snapshots[0]!);
    if (kind === "claim-basis") f.snapshots[0]!.claims[0]!.basis.unit = "MONEY";
    if (kind === "claim-key") f.snapshots[0]!.claims[0]!.nativeKey = "wrong-key";
    if (kind === "claim-variant") f.snapshots[0]!.claims[0]!.variant = "new-variant";
    if (kind === "claim-entity") f.snapshots[0]!.claims[0]!.entityId = "new-entity";
    if (kind === "unresolved-evidence") f.request.policy.approval.evidence[0]!.checksum = "c".repeat(64);
    if (kind === "rights-widening") f.inputs[1]!.allowExport = true;
    expect(() => {
      const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
      if (kind === "future-created-at") buildRiskFoundationRecord(result, { actor: { kind: "USER", id: "owner" }, createdAt: "2026-10-01T00:00:00.000Z" });
    }).toThrow();
  });
  it.each(["outputHash", "inputsHash", "requestHash", "limit", "reason", "result-time"] as const)("detects rehashed or malformed %s foundation", (kind) => {
    const f = riskFixture(); const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    if (["outputHash", "inputsHash", "requestHash"].includes(kind)) result.determinism[kind as keyof typeof result.determinism] = "0".repeat(64);
    if (kind === "limit") result.limits.costUnits++;
    if (kind === "reason") result.reasons.reverse();
    if (kind === "result-time") result.request.evaluatedAt = "2026-10-21T12:00:00.000Z";
    expect(() => validateRiskFoundation(result)).toThrow();
  });
  it("cannot add generated risks, condition evaluations or a decision in M1", () => {
    const f = riskFixture(); const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    for (const changed of [{ ...result, decision: "PROCEED_UNDER_DECLARED_CONDITIONS" }, { ...result, findings: [{}] }, { ...result, conditionOutcomes: [{}] }, { ...result, automaticAction: true }]) {
      expect(riskFoundationResultSchema.safeParse(changed).success).toBe(false);
    }
  });
  it("rejects more than 2 MiB before parsing", () => {
    expect(() => normalizeRiskRequest({ oversized: "x".repeat(MAX_RUN_JSON_BYTES) }, riskContext.evaluatedAt)).toThrow(/byte limit/);
  });
  it("accepts exactly 2 MiB canonical bytes and rejects the next byte", () => {
    expect(() => ensureRiskJsonSize("x".repeat(MAX_RUN_JSON_BYTES - 2))).not.toThrow();
    expect(() => ensureRiskJsonSize("x".repeat(MAX_RUN_JSON_BYTES - 1))).toThrow(/byte limit/);
  });
  it("bounds nesting/nodes and rejects cycles before recursive canonicalization", () => {
    let nested: unknown = null;
    for (let i = 0; i < 64; i++) nested = { nested };
    expect(() => ensureRiskJsonSize(nested)).not.toThrow();
    expect(() => ensureRiskJsonSize({ nested })).toThrow(/structural/);
    expect(() => ensureRiskJsonSize(Array.from({ length: 199_999 }, () => null))).not.toThrow();
    expect(() => ensureRiskJsonSize(Array.from({ length: 200_000 }, () => null))).toThrow(/structural/);
    const cyclic: { self?: unknown } = {}; cyclic.self = cyclic;
    expect(() => ensureRiskJsonSize(cyclic)).toThrow(/Cyclic/);
  });
  it("enforces 128 distinct transitive lineage identities across snapshots", () => {
    const f = riskFixture();
    const extra = (i: number) => makeInput({ id: `source-${i}`, ref: { system: "DATA_CENTER", id: `version-${i}`, version: 1, label: "Additional original lineage" } });
    f.snapshots[0]!.lineage.push(...Array.from({ length: 127 }, (_, i) => extra(i + 10)));
    expect(buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context).snapshots.find((s) => s.pin.runId === f.snapshots[0]!.pin.runId)!.lineage).toHaveLength(128);
    f.snapshots[1]!.lineage.push(extra(999));
    expect(() => buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context)).toThrow(/lineage bound/);
  });
  it("enforces exactly 1000 selected claims", () => {
    const f = riskFixture();
    f.request.claims.push(...Array.from({ length: 994 }, (_, i) => ({ ...structuredClone(f.request.claims[0]!), id: `max-${i}`, pointer: `/metrics/${i + 10}` })));
    expect(normalizeRiskRequest(f.request, f.context.evaluatedAt).normalized.claims).toHaveLength(1000);
    f.request.claims.push({ ...structuredClone(f.request.claims[0]!), id: "over-max", pointer: "/metrics/2000" });
    expect(() => normalizeRiskRequest(f.request, f.context.evaluatedAt)).toThrow();
  });
  it("rejects an expanded history envelope over 2 MiB even when the result alone fits", () => {
    const f = riskFixture(); const claim = f.snapshots[0]!.claims[0]!;
    for (let i = 0; i < 100; i++) {
      const id = `large-claim-${i}`; const pointer = `/metrics/${i + 1}`;
      f.request.claims.push({ ...structuredClone(f.request.claims[0]!), id, pointer });
      f.snapshots[0]!.claims.push({ ...structuredClone(claim), id, pointer, limitations: Array.from({ length: 20 }, () => "x".repeat(480)) });
    }
    const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(MAX_RUN_JSON_BYTES);
    expect(() => buildRiskFoundationRecord(result, { actor: { kind: "USER", id: "owner" }, createdAt: riskContext.evaluatedAt })).toThrow(/byte limit/);
  });
  it("preserves a missing engine slot as unevaluated, never a clean or confirmed adverse result", () => {
    const f = riskFixture(); const key = "market-demand";
    const runId = `retained-${key}`;
    f.request.engineSlots = f.request.engineSlots.map((s) => s.engineKey === key ? { engineKey: key, state: "MISSING", reason: "NOT_AVAILABLE" } : s);
    f.request.claims = f.request.claims.filter((c) => c.runId !== runId);
    f.snapshots = f.snapshots.filter((s) => s.pin.runId !== runId);
    f.inputs = f.inputs.filter((i) => i.ref.id !== runId);
    const result = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    expect(result.decision).toBeNull(); expect(result.findings).toEqual([]);
    expect(result.request.normalized.engineSlots.find((s) => s.engineKey === key)!.state).toBe("MISSING");
  });
  it("isolates returned models from both inputs and other results", () => {
    const f = riskFixture(); const a = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    const b = buildRiskFoundation(f.request, f.inputs, f.snapshots, f.context);
    a.snapshots[0]!.claims[0]!.value = null;
    expect(b.snapshots[0]!.claims[0]!.value).not.toBeNull();
    expect(f.snapshots[0]!.claims[0]!.value).not.toBeNull();
  });
});
describe("Risk M1 units, time and exact decimal comparison, no arithmetic", () => {
  it.each(["subject", "siteId", "geography", "sector", "period", "scenarioId", "unit", "currency", "priceBasis", "cashFlowBasis", "timingBasis", "cohort", "methodology"] as const)("marks mismatched %s as NOT_COMPARABLE, not a conflict", (key) => {
    const monetary = ["currency", "priceBasis", "cashFlowBasis"].includes(key);
    const a = { scope: structuredClone(riskScope), basis: { ...structuredClone(riskBasis),
      ...(monetary ? { unit: "MONEY", currency: "SAR", priceBasis: "NOMINAL", cashFlowBasis: "UNLEVERED" } : {}),
    } };
    const b = structuredClone(a);
    if (key === "subject" || key === "siteId" || key === "scenarioId") b.scope[key] = "another";
    if (key === "geography" || key === "sector") b.scope[key].version = "2";
    if (key === "period") b.scope.period.end = "2026-12-01T00:00:00.000Z";
    const changedBasis = { ...b.basis,
      ...(key === "unit" ? { unit: "OTHER_COUNT" } : {}),
      ...(key === "currency" ? { currency: "USD" } : {}),
      ...(key === "priceBasis" ? { priceBasis: "REAL" } : {}),
      ...(key === "cashFlowBasis" ? { cashFlowBasis: "LEVERED" } : {}),
      ...(key === "timingBasis" ? { timingBasis: "PERIOD_START" } : {}),
      ...(key === "cohort" ? { cohort: "another-cohort" } : {}),
      ...(key === "methodology" ? { methodology: { id: "synthetic-count", version: "2" } } : {}),
    };
    expect(checkRiskComparability(a, { ...b, basis: changedBasis }).state).toBe("NOT_COMPARABLE");
    expect(checkRiskComparability(a, a)).toEqual({ state: "COMPATIBLE", reasons: [] });
  });
  it.each([
    ["0", "-0.000", 0], ["1.20", "1.2", 0], ["-2", "-1", -1], ["1", "1.0000000000000001", -1],
    ["999999999999999999", "999999999999999998", 1], ["-0.0000000000000000000000000001", "0", -1],
    ["10", "2", 1], ["-10", "-2", -1], ["0.1", "0.09", 1],
  ] as const)("compares %s and %s exactly", (a, b, expected) => expect(compareRiskDecimals(a, b)).toBe(expected));
  it.each(["NaN", "Infinity", "1e2", "+1", "01", " 1 ", "", "1000000000000000000", "0." + "1".repeat(35), "0." + "0".repeat(64) + "1"])("rejects nonbounded decimal %s", (value) => {
    expect(riskDecimalSchema.safeParse(value).success).toBe(false);
  });
  it("normalizes canonical equality without rounding upstream precision", () => {
    expect(normalizeRiskDecimal("-0.000")).toBe("0");
    expect(normalizeRiskDecimal("1.2300")).toBe("1.23");
    expect(canonicalHash(normalizeRiskDecimal("1.20"))).toBe(canonicalHash(normalizeRiskDecimal("1.2")));
  });
  it("rejects reversed periods, noncanonical instants, unapproved monetary basis", () => {
    expect(riskPeriodSchema.safeParse({ ...riskScope.period, end: riskScope.period.start }).success).toBe(false);
    expect(riskContextSchema.safeParse({ ...riskContext, evaluatedAt: "2026-10-20T12:00:00Z" }).success).toBe(false);
    expect(riskBasisSchema.safeParse({ ...riskBasis, currency: "SAR" }).success).toBe(false);
    expect(riskApprovalSchema.safeParse({ ...riskApproval, approvedAt: "2026-09-01T00:00:00.000Z" }).success).toBe(false);
  });
});
describe("Risk M1 missing and evidence-quality contracts", () => {
  it.each(["NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_SUPPORTED", "NO_COVERAGE", "NOT_FOUND_WITHIN_RADIUS"] as const)("keeps %s null rather than zero", (state) => {
    const claim = riskFixture().snapshots[0]!.claims[0]!;
    expect(riskClaimSchema.safeParse({ ...claim, nativeStatus: state }).success).toBe(false);
    expect(riskClaimSchema.safeParse({ ...claim, nativeStatus: state, value: null, interpretation: "UNAVAILABLE" }).success).toBe(true);
  });
  it("preserves explicit zero and rejects missing null as computed", () => {
    const claim = riskFixture().snapshots[0]!.claims[0]!;
    expect(riskClaimSchema.parse(claim).value).toMatchObject({ value: "0" });
    expect(riskClaimSchema.safeParse({ ...claim, value: null }).success).toBe(false);
    expect(riskClaimSchema.safeParse({ ...claim, nativeStatus: "ESTIMATED", interpretation: "OBSERVED" }).success).toBe(false);
  });
  it("rejects lineage checksum substitution and forged snapshot business fields", () => {
    const snapshot = riskFixture().snapshots[0]!;
    snapshot.claims[0]!.evidence[0]!.checksum = "b".repeat(64);
    expect(riskSnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(riskSnapshotSchema.safeParse({ ...snapshot, authorization: "APPROVED" }).success).toBe(false);
  });
  it.each(["impact", "likelihood", "severity"] as const)("never promotes an evidence gap into %s", (field) => {
    const finding = {
      id: "gap", category: "DATA_QUALITY", kind: "EVIDENCE_GAP", state: "UNKNOWN", scope: riskScope, claimIds: [],
      evidence: [], counterevidence: [], assumptions: [], rule: { id: "rule", version: "1" },
      impact: null, likelihood: null, severity: null, severityState: "NOT_ASSESSABLE", severityPolicy: null, confidence: null,
      rationale: "Missing evidence is unknown", reasons: ["MISSING_EVIDENCE"], limitations: ["No adverse-event assertion"],
    };
    expect(riskFindingSchema.safeParse(finding).success).toBe(true);
    expect(riskFindingSchema.safeParse({ ...finding, [field]: field === "severity" ? "HIGH" : {} }).success).toBe(false);
  });
  it.each(["missing-evidence", "missing-method", "negative", "over-one", "zero-denominator", "unknown-numeric", "future-source"] as const)("rejects %s likelihood", (kind) => {
    const base = {
      event: "supplier-delay", horizon: riskScope.period, population: "committed-deliveries", sourceDate: "2026-10-01T00:00:00.000Z",
      method: { id: "declared-frequency", version: "1" }, approval: structuredClone(riskApproval), nature: "OBSERVED_FREQUENCY",
      band: "documented-band", value: "0.2", scale: "UNIT_INTERVAL", denominator: "10", rationale: "Observed frequency, not probability by default",
    };
    const changed = { ...base,
      ...(kind === "missing-evidence" ? { approval: { ...base.approval, evidence: [] } } : {}),
      ...(kind === "missing-method" ? { method: {} } : {}),
      ...(kind === "negative" ? { value: "-0.1" } : {}),
      ...(kind === "over-one" ? { value: "1.01" } : {}),
      ...(kind === "zero-denominator" ? { denominator: "0" } : {}),
      ...(kind === "unknown-numeric" ? { value: null } : {}),
      ...(kind === "future-source" ? { sourceDate: "2028-01-01T00:00:00.000Z" } : {}),
    };
    expect(riskLikelihoodSchema.safeParse(base).success).toBe(true);
    expect(riskLikelihoodSchema.safeParse(changed).success).toBe(false);
  });
});
