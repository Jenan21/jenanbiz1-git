import { describe, expect, it } from "vitest";
import {
  buildRunRecord, canonicalize, createGap, ENGINE_RUN_RECORD_CONTRACT, EngineError, MAX_RUN_JSON_BYTES, runInputRecordSchema, runRecordSchema, sharedGapCatalog, summarizeConfidence,
  toRunInputRecord, type RunRecord,
} from "@/services/analysis-engines/shared";
import { digest, makeBreakdown, makeEnvelope, makeInput, makeMetric, makeUnregisteredSampleInput, reseal } from "./support/analysis-engine-fixtures";

const context = { actor: { kind: "USER" as const, id: "user-1" }, subject: null, createdAt: "2026-10-20T12:00:01.000Z" };

describe("confidence summary", () => {
  it("counts valued measurements per band and ignores valueless ones", () => {
    const summary = summarizeConfidence([
      makeMetric({ key: "a.one" }), makeMetric({ key: "a.two", confidence: makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED"]) }),
      makeMetric({ key: "a.three", confidence: makeBreakdown([40, 30, 30], ["COUNT_IS_NOT_AN_INVENTORY"]) }),
      makeMetric({ key: "a.four", status: "NOT_FOUND_WITHIN_RADIUS", platformState: "UNAVAILABLE", value: null, confidence: null }),
      makeMetric({ key: "a.five", valueKind: "AREA", unit: "km2", interpretation: "MEASURED_GEOMETRY", inputRefs: [], confidence: null }),
    ]);
    expect(summary).toEqual({ metricCount: 5, valuedCount: 4, lowestBand: "LOW", bands: { HIGH: 1, MEDIUM: 1, LOW: 1, INSUFFICIENT: 0 }, policies: ["test-confidence-v1@1.0.0"] });
  });

  it("has no lowest band when nothing carries a confidence", () => {
    expect(summarizeConfidence([makeMetric({ status: "NO_COVERAGE", platformState: "UNAVAILABLE", value: null, confidence: null })])).toMatchObject({ lowestBand: null, valuedCount: 0 });
    expect(summarizeConfidence([])).toMatchObject({ metricCount: 0, lowestBand: null });
  });
});

describe("run input rows", () => {
  it("repeat what the snapshot says and keep the complete descriptor", () => {
    const row = toRunInputRecord(makeInput());
    expect(row).toMatchObject({ inputId: "dc:version-1", roles: ["poi:hospital"], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED", completeness: "INVENTORY", refSystem: "DATA_CENTER", refId: "version-1", refVersion: 3, checksum: digest });
    expect(row.snapshot).toEqual(makeInput());
    expect(runInputRecordSchema.parse(row)).toEqual(row);
  });

  it("have a null checksum when the layer has none", () => {
    const row = toRunInputRecord(makeUnregisteredSampleInput());
    expect(row.checksum).toBeNull();
    expect(runInputRecordSchema.parse(row)).toEqual(row);
  });

  it.each([
    ["inputId", { inputId: "other" }], ["kind", { kind: "MAP_LAYER" }], ["completeness", { completeness: "SAMPLE" }], ["refId", { refId: "other" }], ["refVersion", { refVersion: 9 }], ["checksum", { checksum: "b".repeat(64) }], ["roles", { roles: ["poi:school"] }],
  ] as const)("reject a %s column that disagrees with the snapshot", (_name, change) => {
    expect(runInputRecordSchema.safeParse({ ...toRunInputRecord(makeInput()), ...change }).success).toBe(false);
  });
});

describe("run record", () => {
  const record = () => buildRunRecord(makeEnvelope(), context);

  it("is built from a consistent result and validates", () => {
    const built = record();
    expect(runRecordSchema.parse(built)).toEqual(built);
    expect(built).toMatchObject({
      contract: ENGINE_RUN_RECORD_CONTRACT, runId: "run-1", engineKey: "test", engineVersion: "1.0.0", requestContract: "test.engine.request/v1", resultContract: "test.engine.result/v1",
      environment: "test", status: "COMPLETED", errorCode: null, subject: null, actor: { kind: "USER", id: "user-1" }, createdAt: "2026-10-20T12:00:01.000Z",
      gaps: { BLOCKING: 0, WARNING: 0, INFO: 1 }, cost: { costUnits: 10, budgetUnits: 1000 }, timing: { startedAt: "2026-10-20T12:00:00.100Z", finishedAt: "2026-10-20T12:00:00.250Z", durationMs: 150 },
    });
    expect(built.confidence).toMatchObject({ metricCount: 1, lowestBand: "HIGH" });
    expect(built.inputs).toHaveLength(1);
  });

  it("keeps the full request, the full result and the three hashes so the run can be checked later", () => {
    const envelope = makeEnvelope();
    const built = buildRunRecord(envelope, context);
    expect(canonicalize(built.result)).toBe(canonicalize(envelope));
    expect(canonicalize(built.request)).toBe(canonicalize(envelope.request));
    expect([built.requestHash, built.inputsHash, built.outputHash]).toEqual([envelope.determinism.requestHash, envelope.determinism.inputsHash, envelope.determinism.outputHash]);
  });

  it("gives two executions of the same analysis the same hashes whatever their run id and timing", () => {
    const first = makeEnvelope();
    const second = makeEnvelope();
    second.runId = "run-2";
    second.timing = { startedAt: "2026-10-21T08:00:00.000Z", finishedAt: "2026-10-21T08:00:03.000Z", durationMs: 3000 };
    reseal(second);
    expect(second.determinism).toEqual(first.determinism);
    const recorded = buildRunRecord(second, context);
    expect(recorded.outputHash).toBe(buildRunRecord(first, context).outputHash);
    expect(recorded.timing.durationMs).toBe(3000);
  });

  it("summarizes gaps by severity and carries an opaque subject without any foreign key", () => {
    const envelope = makeEnvelope({ extraGaps: [createGap(sharedGapCatalog, "RESULT_TRUNCATED", { limit: 20 }, { subject: "s" })] });
    const built = buildRunRecord(envelope, { ...context, subject: "project:abc" });
    expect(built.gaps).toEqual({ BLOCKING: 0, WARNING: 1, INFO: 1 });
    expect(built.subject).toBe("project:abc");
    expect(runRecordSchema.safeParse({ ...built, projectId: "abc" }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, mapReleaseId: "abc" }).success).toBe(false);
  });

  it("refuses a result that breaks its own contract instead of storing it", () => {
    const envelope = makeEnvelope();
    envelope.limits.costUnits = 5000;
    expect(() => buildRunRecord(envelope, context)).toThrow(EngineError);
    expect(() => buildRunRecord(envelope, context)).toThrow("CONTRACT_VIOLATION");
  });

  it("refuses a result larger than the stored limit", () => {
    const envelope = makeEnvelope();
    envelope.padding = "x".repeat(MAX_RUN_JSON_BYTES);
    reseal(envelope);
    expect(() => buildRunRecord(envelope, context)).toThrow("CONTRACT_VIOLATION");
  });

  it("counts the size in bytes, not characters", () => {
    const envelope = makeEnvelope();
    envelope.padding = "ع".repeat(Math.ceil(MAX_RUN_JSON_BYTES / 2));
    reseal(envelope);
    expect(() => buildRunRecord(envelope, context)).toThrow("CONTRACT_VIOLATION");
  });
});

describe("run record rules", () => {
  const completed = () => buildRunRecord(makeEnvelope(), context);
  const failed = (over: Partial<RunRecord> = {}): RunRecord => ({ ...completed(), status: "FAILED", result: null, inputsHash: null, outputHash: null, errorCode: "BACKEND_UNAVAILABLE", confidence: null, inputs: [], ...over });
  const issues = (candidate: unknown) => JSON.stringify(runRecordSchema.safeParse(candidate).error?.issues ?? []);

  it("accepts a failed run that stopped before producing a result", () => {
    expect(runRecordSchema.safeParse(failed()).success).toBe(true);
  });

  it("requires a run without a result to be FAILED with its error code", () => {
    expect(issues(failed({ status: "COMPLETED" }))).toContain("A run without a result is FAILED");
    expect(issues(failed({ errorCode: null }))).toContain("A run without a result is FAILED");
  });

  it("keeps hashes, confidence and inputs consistent with the presence of a result", () => {
    expect(issues(failed({ outputHash: digest }))).toContain("outputHash exists exactly when the result exists");
    expect(issues(failed({ inputsHash: digest }))).toContain("inputsHash exists exactly when the result exists");
    expect(issues(failed({ confidence: { metricCount: 0, valuedCount: 0, lowestBand: null, bands: { HIGH: 0, MEDIUM: 0, LOW: 0, INSUFFICIENT: 0 }, policies: [] } }))).toContain("no confidence summary and no inputs");
    expect(issues({ ...completed(), errorCode: "BACKEND_UNAVAILABLE" })).toContain("has no error code");
    expect(issues({ ...completed(), outputHash: null })).toContain("outputHash exists exactly when the result exists");
  });

  it("rejects duplicate input ids and payloads that are not JSON objects or are too large", () => {
    const built = completed();
    expect(issues({ ...built, inputs: [built.inputs[0], built.inputs[0]] })).toContain("unique within a run");
    expect(runRecordSchema.safeParse({ ...built, request: [] }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, request: { value: Number.NaN } }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, request: { padding: "x".repeat(MAX_RUN_JSON_BYTES) } }).success).toBe(false);
  });

  it("rejects an unknown contract, status, actor kind or environment", () => {
    const built = completed();
    expect(runRecordSchema.safeParse({ ...built, contract: "other/v1" }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, status: "DONE" }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, actor: { kind: "ROOT", id: null } }).success).toBe(false);
    expect(runRecordSchema.safeParse({ ...built, environment: "staging" }).success).toBe(false);
  });
});
