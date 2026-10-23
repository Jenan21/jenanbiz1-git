import { describe, expect, it } from "vitest";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import { parseRiskReadPolicy, readRiskPointer, riskCompatibilityDimensions, riskNativeCoordinatesMatch, riskReadCompatibility, type RiskReadPolicy } from "@/services/analysis-engines/risk-decision";
import { riskBasis, riskFixture, riskScope } from "./support/risk-decision-fixtures";

function fixture() {
  const f = riskFixture(); const pin = f.snapshots[0]!.pin; const claim = f.request.claims.find((claim) => claim.runId === pin.runId)!;
  const native = { key: claim.nativeKey, unit: { kind: "COUNT" }, method: riskBasis.methodology, value: null, siteId: riskScope.siteId, variant: claim.variant, entityId: claim.entityId };
  const policy: RiskReadPolicy = {
    contract: "jenan.risk-decision.read-policy/v1", policy: f.request.policy, scope: riskScope,
    runs: [{ pin, checks: riskCompatibilityDimensions.map((dimension) => ({
      dimension, state: "EXACT", pointer: "/metrics/0/unit", expected: native.unit, rationale: "Synthetic declared native coordinate",
    })), selections: [{ ...claim, pointer: "/metrics/0", expectedHash: canonicalHash(native), method: { pointer: "/metrics/0/method", expected: native.method } }] }],
  };
  return { policy, native };
}
describe("Risk M2 governed native coordinate binding contracts", () => {
  it("preserves exact native values and explicit approved mappings without deciding or calculating", () => {
    const f = fixture(); expect(parseRiskReadPolicy(f.policy)).toEqual(f.policy);
    expect(riskNativeCoordinatesMatch(f.native, f.policy.runs[0]!.selections[0]!)).toBe(true);
    expect(riskReadCompatibility({ subject: riskScope.subject, result: { metrics: [f.native] } }, f.policy.runs[0]!, riskScope)).toBe(true);
  });
  it.each(["/__proto__/x", "/constructor/x", "/prototype/x", "/bad~escape", `/${"a/".repeat(17)}a`])("refuses unsafe/deep pointer %s", (pointer) => {
    const f = fixture(); f.policy.runs[0]!.selections[0]!.pointer = pointer;
    expect(() => parseRiskReadPolicy(f.policy)).toThrow();
  });
  it("distinguishes a present null from a missing or inherited property", () => {
    expect(readRiskPointer({ value: null }, "/value")).toEqual({ found: true, value: null });
    expect(readRiskPointer({}, "/value")).toEqual({ found: false, value: null });
    expect(readRiskPointer({}, "/toString")).toEqual({ found: false, value: null });
    expect(readRiskPointer({ "a/b": { "~": 0 } }, "/a~1b/~0")).toEqual({ found: true, value: 0 });
  });
  it.each(["duplicate-dimension", "waive-unit", "waive-method", "foreign-run", "foreign-method", "method-version-substitute", "duplicate-selection", "duplicate-run"] as const)("rejects %s", (kind) => {
    const f = fixture(); const run = f.policy.runs[0]!;
    if (kind === "duplicate-dimension") run.checks[1] = structuredClone(run.checks[0]!);
    if (kind === "waive-unit" || kind === "waive-method") run.checks[run.checks.findIndex((check) => check.dimension === (kind === "waive-unit" ? "unit" : "method"))] = { dimension: kind === "waive-unit" ? "unit" : "method", state: "NOT_APPLICABLE", rationale: "Cannot waive methodology" };
    if (kind === "foreign-run") run.selections[0]!.runId = "other";
    if (kind === "foreign-method") run.selections[0]!.method.pointer = "/other/method";
    if (kind === "method-version-substitute") run.selections[0]!.method.pointer = "/metrics/0/version";
    if (kind === "duplicate-selection") run.selections.push(structuredClone(run.selections[0]!));
    if (kind === "duplicate-run") f.policy.runs.push(structuredClone(run));
    expect(() => parseRiskReadPolicy(f.policy)).toThrow();
  });
  it("requires the original persisted subject, not a caller-asserted project mapping", () => {
    const f = fixture();
    expect(riskReadCompatibility({ subject: null, result: { metrics: [f.native] } }, f.policy.runs[0]!, riskScope)).toBe(false);
    expect(riskReadCompatibility({ subject: "other", result: { metrics: [f.native] } }, f.policy.runs[0]!, riskScope)).toBe(false);
  });
  it.each(["unit", "site", "variant", "entity", "method"] as const)("refuses a native %s reinterpretation even under a mapping policy", (kind) => {
    const f = fixture(); const selection = f.policy.runs[0]!.selections[0]!;
    if (kind === "unit") selection.basis.unit = "MONEY";
    if (kind === "site") selection.scope.siteId = "other";
    if (kind === "variant") selection.variant = "other";
    if (kind === "entity") selection.entityId = "other";
    if (kind === "method") selection.basis.methodology.version = "latest";
    expect(riskNativeCoordinatesMatch(f.native, selection)).toBe(false);
  });
  it.each(["currency", "price", "cashflow"] as const)("refuses %s conversion in monetary evidence", (kind) => {
    const f = fixture(); const selection = f.policy.runs[0]!.selections[0]!;
    selection.basis = { ...selection.basis, unit: "MONEY", currency: "SAR", priceBasis: "NOMINAL", cashFlowBasis: "PROJECT_UNLEVERED" };
    const native = { ...f.native, unit: { kind: "MONEY", currency: kind === "currency" ? "USD" : "SAR" },
      basis: { priceBasis: kind === "price" ? "REAL" : "NOMINAL", cashFlowBasis: kind === "cashflow" ? "LEVERED" : "PROJECT_UNLEVERED" } };
    expect(riskNativeCoordinatesMatch(native, selection)).toBe(false);
  });
});
