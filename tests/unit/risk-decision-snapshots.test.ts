import { beforeAll, describe, expect, it } from "vitest";
import { inspectRetainedRiskEnvelope, riskEngineKeys, riskNativeManifest, type RiskRunPin } from "@/services/analysis-engines/risk-decision";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import type { RunRecord } from "@/services/analysis-engines/shared/run-record";
import { riskNativeRecords } from "./support/risk-retained-fixtures";

const records = new Map<typeof riskEngineKeys[number], { record: RunRecord; pin: RiskRunPin }>();
beforeAll(async () => {
  for (const [key, record] of await riskNativeRecords()) records.set(key, record);
}, 30_000);
describe("Risk M1 exact native envelope/version/hash compatibility without upstream recalculation", () => {
  it.each(riskEngineKeys)("recognizes real synthetic %s output and its exact native hash recipe", (key) => {
    const f = records.get(key)!; const original = structuredClone(f);
    expect(inspectRetainedRiskEnvelope(f.record, f.pin)).toEqual({
      pin: f.pin, recipe: riskNativeManifest[key].recipe, integrity: "ENVELOPE_HASHES_ONLY", currentAuthorization: "NOT_CHECKED",
    });
    expect(f).toEqual(original);
  });
  it.each(riskEngineKeys.flatMap((key) => (["content", "outputHash", "requestHash", "inputsHash", "identity", "version", "request", "status", "input", "environment", "evaluatedAt", "timing"] as const).map((kind) => [key, kind] as const)))("detects %s %s mismatch without a native validator", (key, kind) => {
    const f = structuredClone(records.get(key)!);
    if (kind === "content") f.record.result!.fabricated = true;
    if (kind === "outputHash") f.record.outputHash = "b".repeat(64);
    if (kind === "requestHash") f.record.requestHash = "b".repeat(64);
    if (kind === "inputsHash") f.record.inputsHash = "b".repeat(64);
    if (kind === "identity") f.record.runId = "foreign-run";
    if (kind === "version") f.record.engineVersion = "1.0.0-latest";
    if (kind === "request") f.record.request.fabricated = true;
    if (kind === "status") f.record.status = "FAILED";
    if (kind === "input") f.record.inputs[0]!.refId = "another-version";
    if (kind === "environment") f.record.environment = "production";
    if (kind === "evaluatedAt") f.pin.evaluatedAt = "2026-10-23T00:00:00.000Z";
    if (kind === "timing") f.record.timing.durationMs++;
    expect(() => inspectRetainedRiskEnvelope(f.record, f.pin)).toThrow();
  });
  it.each(["financial-feasibility", "operational-feasibility"] as const)("does not treat %s foundation output as calculation evidence", (key) => {
    const f = structuredClone(records.get(key)!); f.record.result!.phase = "M1_FOUNDATION";
    f.pin.contentHash = canonicalHash(f.record.result);
    expect(() => inspectRetainedRiskEnvelope(f.record, f.pin)).toThrow(/Foundation/);
  });
  it("does not describe a self-consistently rehashed native payload as authenticated or recalculated", () => {
    const f = records.get("operational-feasibility")!;
    const receipt = inspectRetainedRiskEnvelope(f.record, f.pin);
    expect(receipt.integrity).toBe("ENVELOPE_HASHES_ONLY");
    expect(receipt.currentAuthorization).toBe("NOT_CHECKED");
  });
});
