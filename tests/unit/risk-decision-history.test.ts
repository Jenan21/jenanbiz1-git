import { describe, expect, it } from "vitest";
import { canonicalHash, canonicalize, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { ENGINE_RUN_RECORD_CONTRACT, MAX_RUN_JSON_BYTES, runRecordSchema, toRunInputRecord } from "@/services/analysis-engines/shared/run-record";
import {
  ensureRiskJsonSize, interpretRiskPreparation, normalizeRiskRequest, RISK_HISTORY_VERSION, RISK_INTERPRETATION_VERSION,
  riskDecimalPolicy, riskHistoryAccessSchema, riskHistoryContextSchema, riskHistoryRecordHash, riskHistoryRuntimeSchema,
  validateRiskHistoryRecord, type RiskInterpretationPolicy, type RiskPreparation,
} from "@/services/analysis-engines/risk-decision";
import { riskContext, riskFixture, riskInstant } from "./support/risk-decision-fixtures";

function fixture() {
  const f = riskFixture(); const normalized = normalizeRiskRequest(f.request, riskInstant);
  const policy: RiskInterpretationPolicy = {
    contract: "jenan.risk-decision.interpretation-policy/v1", method: { id: "history-test", version: "1" },
    engineSlots: f.request.engineSlots, declaredScenarios: [], projections: [], findings: [], conflicts: [], scenarios: [],
  };
  const preparation: RiskPreparation = {
    contract: "jenan.risk-decision.preparation/v1", phase: "M2_EXACT_READS", status: "PARTIAL",
    decision: null, findings: [], conditionOutcomes: [], automaticAction: false,
    outcomes: f.request.engineSlots.flatMap((slot) => slot.state === "PINNED"
      ? slot.runs.map((pin) => ({ runId: pin.runId, status: "NOT_SUPPORTED" as const, evidence: null })) : []),
    declaredMissing: [], realDataAcceptance: "BLOCKED / NOT VERIFIED", limitations: ["Synthetic unit test only"],
    determinism: { requestHash: normalized.requestHash, inputsHash: "", outputHash: "" },
  };
  preparation.determinism.inputsHash = canonicalHash(preparation.outcomes);
  preparation.determinism.outputHash = canonicalHash(omitKeys(preparation, ["determinism"]));
  const result = interpretRiskPreparation(f.request, preparation, policy, riskInstant);
  const record = runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: riskContext.runId, environment: "test",
    engineKey: "risk-decision", engineVersion: RISK_HISTORY_VERSION, requestContract: f.request.contract, resultContract: result.contract,
    status: "COMPLETED_WITH_GAPS", requestHash: normalized.requestHash, inputsHash: canonicalHash(f.inputs),
    outputHash: canonicalHash(result), request: normalized.normalized, result, errorCode: null, confidence: null,
    gaps: { BLOCKING: 1, WARNING: 0, INFO: 0 }, actor: { kind: "USER", id: "synthetic-owner" }, subject: f.request.scope.subject,
    timing: riskContext.timing, createdAt: riskInstant, cost: result.limits, inputs: f.inputs.map(toRunInputRecord),
    runtime: {
      contract: "jenan.risk-decision.history/v1", historyVersion: RISK_HISTORY_VERSION, interpreterVersion: RISK_INTERPRETATION_VERSION,
      decimal: `${riskDecimalPolicy.id}/${riskDecimalPolicy.version}`, rounding: "NONE_PRESERVE_UPSTREAM",
      confidence: "NATIVE_EVIDENCE_QUALITY_ONLY_NO_COMMON_BAND_OR_PROBABILITY",
      access: {}, evaluatedAt: riskInstant, policyHash: canonicalHash(policy), preparationHash: canonicalHash(preparation),
      parent: null, recordHash: "0".repeat(64),
    },
  });
  record.runtime.recordHash = riskHistoryRecordHash(record); return record;
}
describe("Risk M4 strict history storage contracts and reproducibility", () => {
  it("round-trips the unmodified Shared contract with deterministic request/input/output/record hashes", () => {
    const record = fixture();
    expect(validateRiskHistoryRecord(record).record).toEqual(record);
    expect(fixture()).toEqual(record); expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record.outputHash).toBe(canonicalHash(record.result));
    expect(record.runtime.recordHash).toBe(canonicalHash({ ...record, runtime: omitKeys(record.runtime, ["recordHash"]) }));
    expect(record.result?.decision).toBe("NOT_SUPPORTED");
  });
  it.each(["runId", "engineVersion", "requestContract", "resultContract", "subject", "requestHash", "inputsHash", "outputHash"] as const)(
    "rejects altered %s instead of accepting or migrating history", (key) => {
      const record = fixture(); const changed = { ...record, [key]: key.endsWith("Hash") ? "a".repeat(64) : "tampered" };
      expect(() => validateRiskHistoryRecord(changed)).toThrow("RISK_HISTORY_MISMATCH");
    });
  it.each(["result", "request", "runtime", "actor", "gaps", "timing", "cost"] as const)("binds every %s field into the record hash", (field) => {
    const record = fixture(); const changed = { ...record, [field]: {} };
    expect(() => validateRiskHistoryRecord(changed)).toThrow("RISK_HISTORY_MISMATCH");
  });
  it.each(["historyVersion", "interpreterVersion", "decimal", "rounding", "confidence", "contract"] as const)(
    "refuses an unknown %s without silent migration", (key) => {
      const record = fixture(); record.runtime[key] = "unsupported";
      expect(riskHistoryRuntimeSchema.safeParse(record.runtime).success).toBe(false);
      expect(() => validateRiskHistoryRecord(record)).toThrow("RISK_HISTORY_MISMATCH");
    });
  it("binds separate reinterpretation lineage and creation context without modifying business output", () => {
    const original = fixture(); const child = structuredClone(original); child.runId = "risk-child";
    child.runtime.parent = { runId: original.runId, recordHash: original.runtime.recordHash, outputHash: original.outputHash };
    child.runtime.recordHash = riskHistoryRecordHash(child);
    expect(validateRiskHistoryRecord(child).runtime.parent?.runId).toBe(original.runId);
    expect(child.outputHash).toBe(original.outputHash); expect(child.runtime.recordHash).not.toBe(original.runtime.recordHash);
    expect(fixture()).toEqual(original);
    child.runtime.parent = { runId: child.runId, recordHash: original.runtime.recordHash, outputHash: original.outputHash };
    child.runtime.recordHash = riskHistoryRecordHash(child);
    expect(() => validateRiskHistoryRecord(child)).toThrow("RISK_HISTORY_MISMATCH");
  });
  it.each([
    { createdAt: "2026-01-01T00:00:00.000Z" }, { extra: true },
    { timing: { ...riskContext.timing, durationMs: 1 } }, { environment: "TEST" },
  ])("rejects invalid explicit history context %j", (changes) => {
    const context = { runId: riskContext.runId, environment: riskContext.environment, timing: riskContext.timing };
    expect(riskHistoryContextSchema.safeParse({ ...context, createdAt: riskInstant, ...changes }).success).toBe(false);
  });
  it("requires the original evaluation instant to precede storage creation", () => {
    const record = fixture();
    const earlier = "2026-01-01T00:00:00.000Z";
    record.createdAt = earlier; record.timing = { startedAt: earlier, finishedAt: earlier, durationMs: 0 };
    record.runtime.recordHash = riskHistoryRecordHash(record);
    expect(() => validateRiskHistoryRecord(record)).toThrow("RISK_HISTORY_MISMATCH");
  });
  it.each(["subject", "actor", "bypass", "latest"] as const)("does not accept arbitrary %s authorization-context extensions", (key) => {
    expect(riskHistoryAccessSchema.safeParse({ [key]: "forbidden" }).success).toBe(false);
  });
  it("enforces the exact complete storage-envelope byte limit, including JSON syntax overhead", () => {
    const base = fixture(); base.runtime.padding = "";
    const length = Buffer.byteLength(canonicalize(base), "utf8");
    base.runtime.padding = "x".repeat(MAX_RUN_JSON_BYTES - length);
    expect(Buffer.byteLength(canonicalize(base), "utf8")).toBe(MAX_RUN_JSON_BYTES);
    expect(() => ensureRiskJsonSize(base)).not.toThrow();
    base.runtime.padding += "x";
    expect(Buffer.byteLength(canonicalize(base), "utf8")).toBe(MAX_RUN_JSON_BYTES + 1);
    expect(() => ensureRiskJsonSize(base)).toThrow(RangeError);
    expect(() => validateRiskHistoryRecord(base)).toThrow("RISK_HISTORY_MISMATCH");
  });
  it("checks the original interpretation hash even when the outer envelope has been rehashed", () => {
    const record = fixture(); record.result!.decision = "invented";
    record.outputHash = canonicalHash(record.result); record.runtime.recordHash = riskHistoryRecordHash(record);
    expect(() => validateRiskHistoryRecord(record)).toThrow("RISK_HISTORY_MISMATCH");
  });
});
