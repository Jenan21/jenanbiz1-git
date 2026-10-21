import { beforeAll, describe, expect, it } from "vitest";
import { runMarketAnalysis, type MarketM3Result } from "@/services/analysis-engines/market-demand";
import { EngineError } from "@/services/analysis-engines/shared/errors";
import { buildMarketFailureRecord, buildMarketRunRecord, marketUsageIntent, validateMarketRunRecord } from "@/services/analysis-engines/market-demand/run-history";
import type { RunRecord } from "@/services/analysis-engines/shared/run-record";
import { marketInstant, marketRequest } from "./support/market-demand-fixtures";
import { marketPortFixture } from "./support/market-data-fixtures";

const context = { actor: { kind: "USER" as const, id: "owner-1" }, createdAt: marketInstant, access: {} };
const execution = { runId: "history-test", evaluatedAt: marketInstant, environment: "test" as const,
  timing: { startedAt: marketInstant, finishedAt: marketInstant, durationMs: 0 } };
let result: MarketM3Result;
beforeAll(async () => { result = await runMarketAnalysis(marketRequest(), marketPortFixture().port, execution); });

describe("Market M4 shared run-record contract (synthetic evidence)", () => {
  it("builds the existing shared record and keeps exact request/result/input hashes without altering M3", () => {
    const record = buildMarketRunRecord(result, context);
    expect(record.contract).toBe("jenan.analysis-engine.run-record/v1");
    expect(record.outputHash).toBe(result.determinism.outputHash);
    expect(record.inputs.map((input) => input.snapshot)).toEqual(result.inputs);
    expect(validateMarketRunRecord(record)).toMatchObject({ record, result, access: {} });
    expect(record.runtime).toEqual({ contract: "jenan.market-demand.run-history/v1", replayAuthorizationContext: {} });
  });
  it("retains a specialty, mission and organization context solely from the trusted server", () => {
    const access = { specialty: "market", missionContext: "sector-study", organizationId: "org-1" };
    expect(validateMarketRunRecord(buildMarketRunRecord(result, { ...context, access, subject: "opaque-subject" })).access).toEqual(access);
  });
  it("records usage/provenance intent on existing input rows, not a Data Center usage write", () => {
    for (const input of result.inputs) {
      expect(marketUsageIntent(result, input.id)).toMatchObject({
        versionId: input.ref.id, checksum: input.checksum?.value, roles: input.roles,
        consumer: "market-demand", purpose: "CALCULATION_EVIDENCE",
      });
    }
    expect(() => marketUsageIntent(result, "missing-input")).toThrow();
  });
  const mutations: [string, (record: RunRecord) => void][] = [
    ["engine", (record) => { record.engineKey = "spatial"; }],
    ["engine version", (record) => { record.engineVersion = "1.0.0-future"; }],
    ["request contract", (record) => { record.requestContract = "wrong"; }],
    ["status", (record) => { record.status = "FAILED"; }],
    ["request hash", (record) => { record.requestHash = "0".repeat(64); }],
    ["inputs hash", (record) => { record.inputsHash = "0".repeat(64); }],
    ["output hash", (record) => { record.outputHash = "0".repeat(64); }],
    ["confidence", (record) => { record.confidence!.metricCount++; }],
    ["gaps", (record) => { record.gaps.WARNING++; }],
    ["request", (record) => { record.request = { omitted: true }; }],
    ["input snapshot", (record) => { record.inputs[0]!.snapshot.allowExport = true; }],
    ["input version", (record) => { record.inputs[0]!.refId = "different"; }],
    ["missing input", (record) => { record.inputs.pop(); }],
    ["subject runtime", (record) => { record.runtime = {}; }],
    ["timing", (record) => { record.timing.durationMs++; }],
    ["cost", (record) => { record.cost.costUnits++; }],
  ];
  it.each(mutations)("rejects inconsistent persisted %s", (_name, mutate) => {
    const record = structuredClone(buildMarketRunRecord(result, context));
    mutate(record);
    expect(() => validateMarketRunRecord(record)).toThrow();
  });
  it("captures deterministic execution failures without an invented input/output/confidence", () => {
    const error = new EngineError("INVALID_INPUT", { first: "Invalid request" });
    const record = buildMarketFailureRecord({ contract: "invalid" }, error, execution, context);
    expect(record).toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", result: null, inputs: [], confidence: null, inputsHash: null, outputHash: null });
    expect(validateMarketRunRecord(record).result).toBeNull();
  });
  it("retains a bounded hash/size marker for an oversized rejected request, not a second oversized dataset", () => {
    const record = buildMarketFailureRecord({ value: "x".repeat(2 * 1024 * 1024) }, new EngineError("REQUEST_TOO_LARGE"), execution, context);
    expect(record.request).toMatchObject({ omitted: true, byteLength: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(validateMarketRunRecord(record).result).toBeNull();
  });
  it("rejects malformed failure history instead of replaying a successful empty result", () => {
    const record = buildMarketFailureRecord({}, new EngineError("INVALID_INPUT"), execution, context);
    record.requestHash = "0".repeat(64);
    expect(() => validateMarketRunRecord(record)).toThrow();
  });
  it.each(["actor", "cost", "gaps", "request capture", "runtime error"] as const)("rejects a corrupted failed-run %s", (field) => {
    const record = buildMarketFailureRecord({}, new EngineError("INVALID_INPUT"), execution, context);
    if (field === "actor") record.actor = { kind: "SYSTEM", id: null };
    if (field === "cost") record.cost.costUnits = 1;
    if (field === "gaps") record.gaps.WARNING = 1;
    if (field === "request capture") record.request = {};
    if (field === "runtime error") delete record.runtime.errorDetails;
    expect(() => validateMarketRunRecord(record)).toThrow();
  });
  it("does not mutate a previously accepted M3 envelope when building persistence records", () => {
    const before = structuredClone(result);
    buildMarketRunRecord(result, context);
    expect(result).toEqual(before);
  });
});
