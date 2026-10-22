import { describe, expect, it } from "vitest";
import {
  analyzeOpportunityData, buildOpportunityRunRecord, captureOpportunityReads, reproduceOpportunityTranscript,
  validateOpportunityRunRecord, opportunityInputHistory, opportunityRecordContextSchema, type OpportunityReadTranscript,
} from "@/services/analysis-engines/opportunity-gap";
import { computeDeterminism } from "@/services/analysis-engines/shared";
import { opportunityPortFixture } from "./support/opportunity-data-fixtures";
import { opportunityContext, opportunityRequest } from "./support/opportunity-gap-fixtures";

async function fixture() {
  const source = opportunityPortFixture();
  const capture = captureOpportunityReads(source.port);
  const result = await analyzeOpportunityData(capture.port, opportunityRequest(), opportunityContext);
  const context = { actor: { kind: "USER" as const, id: "history-owner" }, createdAt: opportunityContext.evaluatedAt, access: {} };
  const record = buildOpportunityRunRecord(result, context, capture.transcript);
  return { source, capture, result, record, context };
}
describe("Opportunity M4 pure Run/Input contracts and exact historical transcript", () => {
  it("retains request, full result, exact version/hash and source bytes in bounded runtime", async () => {
    const f = await fixture();
    const parsed = validateOpportunityRunRecord(f.record);
    expect(parsed.result).toEqual(f.result);
    expect(parsed.runtime.transcript).toEqual(f.capture.transcript);
    expect(parsed.record.inputs).toHaveLength(2);
    expect(parsed.record.requestHash).toBe(f.result.determinism.requestHash);
    expect(parsed.record.inputsHash).toBe(f.result.determinism.inputsHash);
    expect(parsed.record.outputHash).toBe(f.result.determinism.outputHash);
    const history = opportunityInputHistory(f.result, f.capture.transcript, f.result.inputs[0]!.id);
    expect(history.reference.source.sourceId).toBe("synthetic-source");
    expect(history.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(history.contentHash).not.toBe(f.result.inputs[0]!.checksum!.value);
  });
  it("reproduces identical full output without calling live discovery/read again", async () => {
    const f = await fixture();
    f.source.discover.mockRejectedValue(new Error("Live discovery forbidden"));
    f.source.read.mockRejectedValue(new Error("Live read forbidden"));
    expect(await reproduceOpportunityTranscript(f.result, f.capture.transcript)).toEqual(f.result);
    expect(f.source.discover).toHaveBeenCalledTimes(2);
    expect(f.source.read).toHaveBeenCalledTimes(2);
  });
  it("does not fill originally missing evidence from a newer available source", async () => {
    const f = opportunityPortFixture(); f.versions.delete("capacity-v1");
    const capture = captureOpportunityReads(f.port);
    const result = await analyzeOpportunityData(capture.port, opportunityRequest(), opportunityContext);
    expect(await reproduceOpportunityTranscript(result, capture.transcript)).toEqual(result);
    expect(result.results[0]!.metrics.find((metric) => metric.key === "current.demand_supply_gap")?.value).toBeNull();
  });
  it.each(["missing", "extra", "order", "version", "checksum", "content"] as const)("rejects %s transcript tampering without a fallback", async (variant) => {
    const f = await fixture(); const transcript: OpportunityReadTranscript = structuredClone(f.capture.transcript);
    if (variant === "missing") transcript.pop();
    if (variant === "extra") transcript.push(transcript[0]!);
    if (variant === "order") transcript.reverse();
    if (variant === "version" && transcript[0]!.operation === "DISCOVER") transcript[0]!.query.versionIds = ["latest"];
    const read = transcript.find((entry) => entry.operation === "READ")!;
    if (variant === "checksum" && read.operation === "READ") read.query.expectedChecksum = "c".repeat(64);
    if (variant === "content" && read.operation === "READ" && read.response.status === "AVAILABLE") read.response.content = "{}";
    await expect(reproduceOpportunityTranscript(f.result, transcript)).rejects.toThrow();
  });
  it.each(["engine", "result", "input", "requestHash", "outputHash", "actor"] as const)("rejects %s record inconsistency", async (variant) => {
    const f = await fixture(); const record = structuredClone(f.record);
    if (variant === "engine") record.engineVersion = "newest";
    if (variant === "result") record.result = { ...f.result, rights: { ...f.result.rights, allowExport: true } };
    if (variant === "input") record.inputs[0]!.checksum = "c".repeat(64);
    if (variant === "requestHash") record.requestHash = "c".repeat(64);
    if (variant === "outputHash") record.outputHash = "c".repeat(64);
    if (variant === "actor") record.actor.kind = "SYSTEM";
    expect(() => validateOpportunityRunRecord(record)).toThrow();
  });
  it("rejects rehashed fabricated output before storage", async () => {
    const f = await fixture(); f.result.results[0]!.metrics[0]!.value = 500;
    f.result.determinism = computeDeterminism(f.result);
    expect(() => buildOpportunityRunRecord(f.result, f.context, f.capture.transcript)).toThrow();
  });
  it("refuses oversized transcripts instead of dropping provenance", async () => {
    const f = await fixture();
    expect(() => buildOpportunityRunRecord(f.result, f.context, Array.from({ length: 65 }, () => f.capture.transcript[0]!))).toThrow();
    expect(() => opportunityRecordContextSchema.parse({ ...f.context, access: { invented: true } })).toThrow();
  });
});
