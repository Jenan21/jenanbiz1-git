import { describe, expect, it } from "vitest";
import {
  analyzeOperationalData, bindOperationalDataset, buildOperationalRunRecord, calculateOperational, captureOperationalReads,
  operationalInputHistory, OperationalHistoryUnavailable, operationalRecordContextSchema, reproduceOperationalTranscript,
  validateOperationalRunRecord, type OperationalReadTranscript,
} from "@/services/analysis-engines/operational-feasibility";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { operationalPortFixture } from "./support/operational-data-fixtures";
import { operationalCalculationDataset } from "./support/operational-calculation-fixtures";
import { operationalContext } from "./support/operational-feasibility-fixtures";

async function fixture() {
  const source = operationalPortFixture(); Object.assign(source.dataset, operationalCalculationDataset());
  source.request = bindOperationalDataset(source.dataset, source.reference, operationalContext.evaluatedAt);
  const capture = captureOperationalReads(source.port);
  const result = await analyzeOperationalData(capture.port, source.request, operationalContext);
  const context = { actor: { kind: "USER" as const, id: "operational-owner" }, createdAt: operationalContext.evaluatedAt, access: {} };
  const record = await buildOperationalRunRecord(result, context, capture.transcript);
  return { source, capture, result, context, record };
}
describe("Operational M4 exact history and reproducibility", () => {
  it("retains the original operational model/approvals, exact evidence and versioned calculation policies", async () => {
    const f = await fixture(); const parsed = await validateOperationalRunRecord(f.record);
    expect(parsed.result).toEqual(f.result); expect(parsed.record.inputs).toHaveLength(1);
    expect(parsed.record.requestHash).toBe(f.result.determinism.requestHash);
    expect(parsed.record.inputsHash).toBe(f.result.determinism.inputsHash);
    expect(parsed.record.outputHash).toBe(f.result.determinism.outputHash);
    expect(parsed.runtime.policies).toEqual({
      calculations: "1.0.0-m3", decimal: "operational-decimal-v1/1.0.0",
      rounding: "6-decimal/HALF_EVEN+declared-whole-deliverables-down+homogeneous-staff-up", confidence: "operational-confidence-v1/1.0.0",
    });
    const input = operationalInputHistory(f.result, f.capture.transcript, f.result.inputs[0]!.id);
    expect(input.provenance.model).toEqual(f.result.request.normalized);
    expect(input.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.contentHash).not.toBe(input.reference.version.checksum.value);
    expect(f.result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(f.record.cost.costUnits).toBe(f.result.limits.totalCostUnits);
  });
  it("reproduces original bytes without latest discovery or replacing old assumptions", async () => {
    const f = await fixture();
    f.source.dataset.model.values[0]!.value = "99999"; f.source.reference.version.versionId = "operational-v2";
    f.source.discover.mockRejectedValue(new Error("Live discovery forbidden"));
    f.source.read.mockRejectedValue(new Error("Live content forbidden"));
    expect(await reproduceOperationalTranscript(f.result, f.capture.transcript)).toEqual(f.result);
    expect(f.source.discover).toHaveBeenCalledTimes(1); expect(f.source.read).toHaveBeenCalledTimes(1);
  });
  it.each(["missing", "extra", "order", "version", "checksum", "content", "rights", "source"] as const)("rejects %s transcript tampering", async (variant) => {
    const f = await fixture(); const transcript: OperationalReadTranscript = structuredClone(f.capture.transcript);
    if (variant === "missing") transcript.pop();
    if (variant === "extra") transcript.push(transcript[0]!);
    if (variant === "order") transcript.reverse();
    if (variant === "version" && transcript[0]!.operation === "DISCOVER") transcript[0]!.query.versionIds = ["operational-v2"];
    const read = transcript.find((entry) => entry.operation === "READ");
    if (variant === "checksum" && read?.operation === "READ") read.query.expectedChecksum = "b".repeat(64);
    if (variant === "content" && read?.operation === "READ" && read.response.status === "AVAILABLE") read.response.content = "{}";
    if (variant === "rights" && read?.operation === "READ" && read.response.status === "AVAILABLE") read.response.reference.rights.allowExport = true;
    if (variant === "source" && read?.operation === "READ" && read.response.status === "AVAILABLE") read.response.reference.source.sourceId = "another-source";
    await expect(reproduceOperationalTranscript(f.result, transcript)).rejects.toThrow();
  });
  it.each(["engine", "requestHash", "inputsHash", "outputHash", "input", "actor", "decimal", "rounding", "confidence", "calculations", "cost", "gaps"] as const)("rejects inconsistent %s record metadata", async (variant) => {
    const f = await fixture(); const record = structuredClone(f.record);
    if (variant === "engine") record.engineVersion = "latest";
    if (variant === "requestHash") record.requestHash = "c".repeat(64);
    if (variant === "inputsHash") record.inputsHash = "c".repeat(64);
    if (variant === "outputHash") record.outputHash = "c".repeat(64);
    if (variant === "input") record.inputs[0]!.snapshot.checksum!.value = "c".repeat(64);
    if (variant === "actor") record.actor.kind = "SYSTEM";
    if (variant === "cost") record.cost.costUnits++;
    if (variant === "gaps") record.gaps.BLOCKING++;
    if (["decimal", "rounding", "confidence", "calculations"].includes(variant)) {
      record.runtime = { ...record.runtime, policies: { ...f.record.runtime.policies as object, [variant]: "new-policy" } };
    }
    await expect(validateOperationalRunRecord(record)).rejects.toThrow();
  });
  it("rejects invented calculations even if their output hash is recomputed", async () => {
    const f = await fixture(); const result = structuredClone(f.result);
    result.metrics.find((m) => m.key === "serial_bottleneck")!.value = "99999";
    result.determinism.outputHash = canonicalHash(omitKeys(result, ["runId", "timing", "determinism"]));
    await expect(buildOperationalRunRecord(result, f.context, f.capture.transcript)).rejects.toThrow();
  });
  it("rejects consistently recalculated caller assumptions that disagree with retained source bytes", async () => {
    const f = await fixture(); const request = structuredClone(f.result.request.normalized);
    request.values.find((v) => v.id === "target")!.value = "999";
    const recalculated = calculateOperational(request, f.result.inputs, operationalContext);
    await expect(buildOperationalRunRecord(recalculated, f.context, f.capture.transcript)).rejects.toThrow();
  });
  it("keeps inaccessible and absent source preparation unavailable with no guessed output", async () => {
    const source = operationalPortFixture();
    source.discover.mockResolvedValue({
      mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE",
      candidates: [], selected: null, unavailableVersionIds: ["operational-v1"], notInForce: [], truncated: false,
    });
    await expect(analyzeOperationalData(source.port, source.request, operationalContext)).rejects.toThrow(OperationalHistoryUnavailable);
    expect(source.read).not.toHaveBeenCalled();
  });
  it("propagates backend failures and rejects partial sources rather than caching success", async () => {
    const source = operationalPortFixture(); source.read.mockRejectedValueOnce(new Error("Backend unavailable"));
    await expect(analyzeOperationalData(source.port, source.request, operationalContext)).rejects.toThrow("Backend unavailable");
    source.reference.freshness.status = "STALE";
    await expect(analyzeOperationalData(source.port, source.request, operationalContext)).rejects.toThrow("PARTIAL");
  });
  it("bounds transcript capture and refuses fabricated trusted context", async () => {
    const source = operationalPortFixture(); const capture = captureOperationalReads(source.port);
    await capture.port.discover({ versionIds: ["operational-v1"] });
    await capture.port.read({ versionId: "operational-v1", expectedChecksum: "a".repeat(64) });
    await expect(capture.port.discover({ versionIds: ["operational-v1"] })).rejects.toThrow("exceeds");
    expect(() => operationalRecordContextSchema.parse({
      actor: { kind: "USER", id: "owner" }, createdAt: operationalContext.evaluatedAt, access: { untrusted: true },
    })).toThrow();
  });
  it("does not mutate the caller or transcript while replaying", async () => {
    const f = await fixture(); const before = structuredClone(f.record);
    await validateOperationalRunRecord(f.record);
    expect(f.record).toEqual(before);
  });
});
