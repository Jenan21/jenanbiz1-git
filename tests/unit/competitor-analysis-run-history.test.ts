import { beforeAll, describe, expect, it } from "vitest";
import {
  buildCompetitorFailureRecord, buildCompetitorRunRecord, competitorInputProvenance, competitorRecordContextSchema, competitorUsageIntent,
  runCompetitorAnalysis, validateCompetitorRunRecord, type CompetitorAnalyticsResult,
} from "@/services/analysis-engines/competitor-analysis";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import { EngineError } from "@/services/analysis-engines/shared/errors";
import { competitorInstant, competitorRequest } from "./support/competitor-analysis-fixtures";
import { competitorPortFixture } from "./support/competitor-data-fixtures";

const execution = { runId: "competitor:m4", evaluatedAt: competitorInstant, environment: "test" as const,
  timing: { startedAt: competitorInstant, finishedAt: competitorInstant, durationMs: 0 } };
const context = { actor: { kind: "USER" as const, id: "owner" }, createdAt: competitorInstant,
  access: { specialty: "competitor", missionContext: "study", organizationId: "org" }, subject: "opaque-subject" };
let result: CompetitorAnalyticsResult;
beforeAll(async () => {
  const request = competitorRequest(); request.data.roles = {};
  result = await runCompetitorAnalysis(competitorPortFixture(15).port, request, execution);
});
describe("Competitor M4 pure history contracts", () => {
  it("retains original M3 arithmetic/version, full identity and source snapshots and hashes", () => {
    const record = buildCompetitorRunRecord(result, context);
    const validated = validateCompetitorRunRecord(record);
    expect(validated.result).toEqual(result); expect(validated.access).toEqual(context.access);
    expect(record.inputs).toHaveLength(4); expect(record.outputHash).toBe(result.determinism.outputHash);
    expect(record.engineVersion).toBe("1.0.0-m3"); expect(record.subject).toBe(context.subject);
  });
  it("keeps source usage/provenance separate from Data Center writes", () => {
    const input = result.inputs[0]!;
    expect(competitorInputProvenance(result, input.id).sources[0]).toMatchObject({ snapshot: "CURRENT", reference: { version: { versionId: input.ref.id } } });
    expect(competitorUsageIntent(result, input.id)).toMatchObject({ consumer: "competitor-analysis", versionId: input.ref.id, checksum: input.checksum!.value });
    expect(() => competitorUsageIntent(result, "missing")).toThrow();
  });
  it.each(["engineVersion", "requestHash", "inputsHash", "outputHash", "status", "runtime", "input", "result", "confidence", "cost"])("rejects mismatched history %s", (kind) => {
    const record = buildCompetitorRunRecord(result, context);
    if (kind === "engineVersion") record.engineVersion = "future";
    if (kind === "requestHash") record.requestHash = "0".repeat(64);
    if (kind === "inputsHash") record.inputsHash = "0".repeat(64);
    if (kind === "outputHash") record.outputHash = "0".repeat(64);
    if (kind === "status") record.status = "FAILED";
    if (kind === "runtime") record.runtime.extra = true;
    if (kind === "input") record.inputs[0]!.refId = "different";
    if (kind === "result") record.result = { invented: true };
    if (kind === "confidence") record.confidence = null;
    if (kind === "cost") record.cost.costUnits++;
    expect(() => validateCompetitorRunRecord(record)).toThrow();
  });
  it("rejects rehashed fabricated arithmetic before building any stored record", () => {
    const changed = structuredClone(result); changed.results[0]!.metrics[0]!.value = 999;
    expect(() => buildCompetitorRunRecord(changed, context)).toThrow();
  });
  it("records explicit failed execution without output/input hashes or fabricated evidence", () => {
    const record = buildCompetitorFailureRecord({ bad: true }, new EngineError("INVALID_INPUT"), execution, context);
    expect(validateCompetitorRunRecord(record).result).toBeNull();
    expect(record).toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", inputsHash: null, outputHash: null, inputs: [] });
    expect(record.requestHash).toBe(canonicalHash(record.request));
  });
  it("bounds oversized failed requests without storing the payload", () => {
    const record = buildCompetitorFailureRecord({ text: "x".repeat(2 * 1024 * 1024) }, new EngineError("REQUEST_TOO_LARGE"), execution, context);
    expect(record.request).toMatchObject({ omitted: true, byteLength: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(validateCompetitorRunRecord(record).result).toBeNull();
  });
  it("rejects incomplete failure diagnostics", () => {
    const record = buildCompetitorFailureRecord({}, new EngineError("INVALID_INPUT"), execution, context);
    delete record.runtime.errorDetails;
    expect(() => validateCompetitorRunRecord(record)).toThrow();
  });
  it.each([{ actor: { kind: "SYSTEM", id: null } }, { createdAt: "bad" }, { access: { organizationId: "" } }])("rejects invalid trusted history context %j", (invalid) => {
    expect(competitorRecordContextSchema.safeParse({ ...context, ...invalid }).success).toBe(false);
  });
});
