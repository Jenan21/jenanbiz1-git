import { describe, expect, it } from "vitest";
import {
  analyzeFinancialData, buildFinancialCalculationResult, buildFinancialRunRecord, captureFinancialReads, financialInputHistory,
  FinancialHistoryUnavailable, financialRecordContextSchema, reproduceFinancialTranscript,
  validateFinancialRunRecord, type FinancialReadTranscript,
} from "@/services/analysis-engines/financial-feasibility";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { financialPortFixture } from "./support/financial-data-fixtures";
import { financialContext } from "./support/financial-feasibility-fixtures";

async function fixture() {
  const source = financialPortFixture(); const capture = captureFinancialReads(source.port);
  const result = await analyzeFinancialData(capture.port, source.request, financialContext);
  const context = { actor: { kind: "USER" as const, id: "financial-owner" }, createdAt: financialContext.evaluatedAt, access: {} };
  const record = await buildFinancialRunRecord(result, context, capture.transcript);
  return { source, capture, result, context, record };
}
describe("Financial M4 pure exact financial history contracts", () => {
  it("retains exact request, original assumptions, result, input hashes and all calculation policies", async () => {
    const f = await fixture(); const parsed = await validateFinancialRunRecord(f.record);
    expect(parsed.result).toEqual(f.result);
    expect(parsed.record.inputs).toHaveLength(1);
    expect(parsed.record.requestHash).toBe(f.result.determinism.requestHash);
    expect(parsed.record.inputsHash).toBe(f.result.determinism.inputsHash);
    expect(parsed.record.outputHash).toBe(f.result.determinism.outputHash);
    expect(parsed.runtime.policies).toEqual({
      calculations: "financial-calculation-v1/1.0.0", decimal: "financial-decimal-v1/1.0.0",
      rounding: "currency-minor-units+6-decimal-percentage-quantity/HALF_EVEN", confidence: "financial-confidence-v1/1.0.0",
    });
    const input = financialInputHistory(f.result, f.capture.transcript, f.result.inputs[0]!.id);
    expect(input.reference.version.versionId).toBe("financial-v1");
    expect(input.provenance.assumptions).toEqual(f.result.request.normalized.assumptions);
    expect(input.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.contentHash).not.toBe(input.reference.version.checksum.value);
    expect(f.result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
  });
  it("reproduces only original bytes without live latest discovery or newer assumptions", async () => {
    const f = await fixture();
    f.source.dataset.model.assumptions[0]!.value = "99999";
    f.source.reference.version.versionId = "financial-v2";
    f.source.discover.mockRejectedValue(new Error("Live discovery forbidden"));
    f.source.read.mockRejectedValue(new Error("Live content forbidden"));
    expect(await reproduceFinancialTranscript(f.result, f.capture.transcript)).toEqual(f.result);
    expect(f.source.discover).toHaveBeenCalledTimes(1); expect(f.source.read).toHaveBeenCalledTimes(1);
  });
  it.each(["missing", "extra", "order", "version", "checksum", "content", "rights"] as const)("rejects %s transcript tampering", async (variant) => {
    const f = await fixture(); const transcript: FinancialReadTranscript = structuredClone(f.capture.transcript);
    if (variant === "missing") transcript.pop();
    if (variant === "extra") transcript.push(transcript[0]!);
    if (variant === "order") transcript.reverse();
    if (variant === "version" && transcript[0]!.operation === "DISCOVER") transcript[0]!.query.versionIds = ["financial-v2"];
    const read = transcript.find((entry) => entry.operation === "READ");
    if (variant === "checksum" && read?.operation === "READ") read.query.expectedChecksum = "b".repeat(64);
    if (variant === "content" && read?.operation === "READ" && read.response.status === "AVAILABLE") read.response.content = "{}";
    if (variant === "rights" && read?.operation === "READ" && read.response.status === "AVAILABLE") read.response.reference.rights.allowExport = true;
    await expect(reproduceFinancialTranscript(f.result, transcript)).rejects.toThrow();
  });
  it.each(["engine", "requestHash", "inputsHash", "outputHash", "input", "actor", "decimal", "rounding"] as const)("rejects inconsistent %s storage metadata", async (variant) => {
    const f = await fixture(); const record = structuredClone(f.record);
    if (variant === "engine") record.engineVersion = "latest";
    if (variant === "requestHash") record.requestHash = "c".repeat(64);
    if (variant === "inputsHash") record.inputsHash = "c".repeat(64);
    if (variant === "outputHash") record.outputHash = "c".repeat(64);
    if (variant === "input") record.inputs[0]!.snapshot.checksum!.value = "c".repeat(64);
    if (variant === "actor") record.actor.kind = "SYSTEM";
    if (variant === "decimal" || variant === "rounding") {
      record.runtime = { ...record.runtime, policies: { ...f.record.runtime.policies as object, [variant]: "new-policy" } };
    }
    await expect(validateFinancialRunRecord(record)).rejects.toThrow();
  });
  it("rejects fabricated calculations even when the output hash is recomputed", async () => {
    const f = await fixture(); const result = structuredClone(f.result);
    result.metrics.find((entry) => entry.key === "revenue.p1")!.value = "99999.00";
    result.determinism.outputHash = canonicalHash(omitKeys(result, ["runId", "timing", "determinism"]));
    await expect(buildFinancialRunRecord(result, f.context, f.capture.transcript)).rejects.toThrow();
  });
  it("rejects a consistently recalculated caller override that disagrees with original governed bytes", async () => {
    const f = await fixture(); const request = structuredClone(f.source.request);
    request.assumptions.find((entry) => entry.id === "net-sales")!.value = "999";
    const recalculated = buildFinancialCalculationResult(request, f.result.inputs, financialContext);
    await expect(buildFinancialRunRecord(recalculated, f.context, f.capture.transcript)).rejects.toThrow();
  });
  it("keeps missing/hidden source failures indistinguishable and never builds a guessed result", async () => {
    const f = financialPortFixture();
    f.discover.mockResolvedValue({
      mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE",
      candidates: [], selected: null, unavailableVersionIds: ["financial-v1"], notInForce: [], truncated: false,
    });
    await expect(analyzeFinancialData(f.port, f.request, financialContext)).rejects.toThrow(FinancialHistoryUnavailable);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("refuses backend errors rather than returning a cached success", async () => {
    const f = financialPortFixture(); f.read.mockRejectedValue(new Error("Backend unavailable"));
    await expect(analyzeFinancialData(f.port, f.request, financialContext)).rejects.toThrow("Backend unavailable");
  });
  it("rejects partial/unsupported models with an explicit preparation error", async () => {
    const f = financialPortFixture(); f.reference.freshness.status = "STALE";
    await expect(analyzeFinancialData(f.port, f.request, financialContext)).rejects.toThrow(/PARTIAL/);
  });
  it("bounds transcript capture and trusted access without dropping evidence", async () => {
    const f = financialPortFixture(); const capture = captureFinancialReads(f.port);
    await capture.port.discover({ versionIds: ["financial-v1"] });
    await capture.port.read({ versionId: "financial-v1", expectedChecksum: "a".repeat(64) });
    await expect(capture.port.discover({ versionIds: ["financial-v1"] })).rejects.toThrow(/exceeds/);
    expect(() => financialRecordContextSchema.parse({
      actor: { kind: "USER", id: "owner" }, createdAt: financialContext.evaluatedAt, access: { untrusted: true },
    })).toThrow();
  });
});
