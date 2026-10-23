import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectRetainedRiskEnvelope, riskEngineKeys, riskNativeManifest, riskRunPinSchema, type RiskRunPin } from "@/services/analysis-engines/risk-decision";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import { runRecordSchema, toRunInputRecord, type RunRecord } from "@/services/analysis-engines/shared/run-record";
import { engineInputSchema, timingSchema } from "@/services/analysis-engines/shared/contracts";
import { analyzeFinancialData } from "@/services/analysis-engines/financial-feasibility";
import { analyzeOperationalData } from "@/services/analysis-engines/operational-feasibility";
import { runMarketAnalysis } from "@/services/analysis-engines/market-demand";
import { runCompetitorAnalysis } from "@/services/analysis-engines/competitor-analysis";
import { analyzeOpportunityData } from "@/services/analysis-engines/opportunity-gap";
import { financialContext } from "./support/financial-feasibility-fixtures";
import { financialPortFixture } from "./support/financial-data-fixtures";
import { operationalAcceptanceFixture } from "./support/operational-acceptance-fixtures";
import { operationalContext } from "./support/operational-feasibility-fixtures";
import { marketInstant, marketRequest } from "./support/market-demand-fixtures";
import { marketPortFixture } from "./support/market-data-fixtures";
import { competitorInstant, competitorRequest } from "./support/competitor-analysis-fixtures";
import { competitorPortFixture } from "./support/competitor-data-fixtures";
import { opportunityContext, opportunityRequest } from "./support/opportunity-gap-fixtures";
import { opportunityPortFixture } from "./support/opportunity-data-fixtures";
import { contextRequest, resultOf } from "./support/spatial-run";

const records = new Map<typeof riskEngineKeys[number], { record: RunRecord; pin: RiskRunPin }>();
beforeAll(async () => {
  const financial = financialPortFixture(); const operational = operationalAcceptanceFixture();
  const execution = (runId: string, evaluatedAt: string) => ({ runId, evaluatedAt, environment: "test" as const,
    timing: { startedAt: evaluatedAt, finishedAt: evaluatedAt, durationMs: 0 } });
  const competitor = competitorRequest(); competitor.data.roles = {};
  const results: unknown[] = [
    await resultOf(contextRequest()),
    await runMarketAnalysis(marketRequest(), marketPortFixture().port, execution("native-market", marketInstant)),
    await runCompetitorAnalysis(competitorPortFixture(15).port, competitor, execution("native-competitor", competitorInstant)),
    await analyzeOpportunityData(opportunityPortFixture().port, opportunityRequest(), opportunityContext),
    await analyzeFinancialData(financial.port, financial.request, financialContext),
    await analyzeOperationalData(operational.port, operational.request, operationalContext),
  ];
  const shell = z.looseObject({
    contract: z.string(), runId: z.string(), evaluatedAt: z.string(), status: z.string(), request: z.record(z.string(), z.unknown()),
    inputs: z.array(engineInputSchema), engine: z.looseObject({ key: z.enum(riskEngineKeys), version: z.string(), environment: z.string() }),
    determinism: z.object({ requestHash: z.string(), inputsHash: z.string(), outputHash: z.string() }), timing: timingSchema,
  });
  for (const raw of results) {
    const result = shell.parse(raw); const manifest = riskNativeManifest[result.engine.key];
    const pin = riskRunPinSchema.parse({
      engineKey: result.engine.key, runId: result.runId, engineVersion: result.engine.version,
      requestContract: manifest.request, resultContract: result.contract,
      ...result.determinism, contentHash: canonicalHash(raw), evaluatedAt: result.evaluatedAt,
    });
    const record = runRecordSchema.parse({
      contract: "jenan.analysis-engine.run-record/v1", runId: result.runId, engineKey: result.engine.key,
      engineVersion: result.engine.version, requestContract: manifest.request, resultContract: result.contract,
      environment: result.engine.environment, status: result.status, ...result.determinism,
      request: result.request, result: raw, errorCode: null, confidence: null, gaps: { BLOCKING: 0, WARNING: 0, INFO: 0 },
      actor: { kind: "USER", id: "synthetic-owner" }, subject: null, timing: result.timing,
      cost: { costUnits: 0, budgetUnits: 20_000 }, runtime: { synthetic: true }, createdAt: result.evaluatedAt,
      inputs: result.inputs.map(toRunInputRecord),
    });
    records.set(result.engine.key, { record, pin });
  }
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
