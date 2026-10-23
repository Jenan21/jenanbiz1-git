import { z } from "zod";
import { riskEngineKeys, riskNativeManifest, riskRunPinSchema, type RiskRunPin } from "@/services/analysis-engines/risk-decision";
import { canonicalHash } from "@/services/analysis-engines/shared/canonical";
import { runRecordSchema, toRunInputRecord, type RunRecord } from "@/services/analysis-engines/shared/run-record";
import { engineInputSchema, timingSchema } from "@/services/analysis-engines/shared/contracts";
import { analyzeFinancialData } from "@/services/analysis-engines/financial-feasibility";
import { analyzeOperationalData } from "@/services/analysis-engines/operational-feasibility";
import { runMarketAnalysis } from "@/services/analysis-engines/market-demand";
import { runCompetitorAnalysis } from "@/services/analysis-engines/competitor-analysis";
import { analyzeOpportunityData } from "@/services/analysis-engines/opportunity-gap";
import { financialContext } from "./financial-feasibility-fixtures";
import { financialPortFixture } from "./financial-data-fixtures";
import { operationalAcceptanceFixture } from "./operational-acceptance-fixtures";
import { operationalContext } from "./operational-feasibility-fixtures";
import { marketInstant, marketRequest } from "./market-demand-fixtures";
import { marketPortFixture } from "./market-data-fixtures";
import { competitorInstant, competitorRequest } from "./competitor-analysis-fixtures";
import { competitorPortFixture } from "./competitor-data-fixtures";
import { opportunityContext, opportunityRequest } from "./opportunity-gap-fixtures";
import { opportunityPortFixture } from "./opportunity-data-fixtures";
import { contextRequest, resultOf } from "./spatial-run";

/** Actual native calculators are used in tests only, never in the Risk reader. */
export async function riskNativeRecords() {
  const records = new Map<typeof riskEngineKeys[number], { record: RunRecord; pin: RiskRunPin }>();
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
  return records;
}
