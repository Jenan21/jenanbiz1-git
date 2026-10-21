import {
  calculateMarketMetric, MARKET_ENGINE_KEY, MARKET_REQUEST_CONTRACT, MARKET_RESULT_CONTRACT, MARKET_VERSION,
  marketConfidencePolicy, normalizeMarketRequest, type MarketObservation, type MarketRequest, type MarketResult,
} from "@/services/analysis-engines/market-demand";
import { computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, normalizeGaps, type EngineInput, type QuantitySemantics } from "@/services/analysis-engines/shared";
import { makeInput } from "./analysis-engine-fixtures";

// Synthetic evidence for unit tests, never real-data acceptance.
export const marketInstant = "2026-10-21T09:00:00.000Z";
export const marketSeed = { key: "demand.level", label: { ar: "الطلب المرصود", en: "Observed demand" } };
export function marketInput(over: Partial<EngineInput> = {}): EngineInput {
  return makeInput({ roles: ["demand.observations"], ...over });
}
export function marketSemantics(over: Partial<QuantitySemantics> = {}): QuantitySemantics {
  return {
    measuredSubject: "purchase_transactions",
    unit: { id: "transactions", version: "1", dimension: "EVENTS", entity: "purchase_transactions", per: null },
    measureKind: "FLOW", evidenceNature: "OBSERVATION",
    time: { kind: "INTERVAL", id: "2026-08", startDate: "2026-08-01", endDate: "2026-09-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
    dimensions: {
      geography: { countryCode: "SA", authority: "test-statistics", level: "city", code: "riyadh", version: "1" },
      sector: { taxonomy: "test-sector", version: "1", code: "food" }, cohort: { id: "all", version: "1" },
      metricDefinition: { id: "fulfilled-transactions", version: "1" },
      methodology: { id: "register", version: "1" }, universe: { id: "defined-sample-universe", version: "1" }, adjustment: "UNADJUSTED",
    },
    ...over,
  };
}
export function marketObservation(over: Partial<MarketObservation> = {}): MarketObservation {
  return {
    ref: { inputId: "dc:version-1", observationId: "obs-august" }, subject: "purchase_transactions",
    semantics: marketSemantics(), value: 100, status: "AVAILABLE", geographicCoverage: "EXACT", temporalCoverage: "COMPLETE",
    measurementMethod: "DOCUMENTED", method: "Count fulfilled transactions in the declared universe",
    sourceRefs: [{ inputId: "dc:version-1", observationId: "obs-august" }], assumptions: [], limitations: [],
    ...over,
  };
}
export function laterObservation(over: Partial<MarketObservation> = {}): MarketObservation {
  return marketObservation({
    ref: { inputId: "dc:version-1", observationId: "obs-september" },
    sourceRefs: [{ inputId: "dc:version-1", observationId: "obs-september" }],
    semantics: marketSemantics({ time: { kind: "INTERVAL", id: "2026-09", startDate: "2026-09-01", endDate: "2026-10-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" } }),
    value: 80, ...over,
  });
}
export function marketRequest(over: Partial<MarketRequest> = {}): MarketRequest {
  const semantics = marketSemantics();
  return {
    contract: MARKET_REQUEST_CONTRACT, analyses: ["OBSERVED_DEMAND"],
    scope: { geography: semantics.dimensions.geography, sector: semantics.dimensions.sector, cohort: semantics.dimensions.cohort },
    series: [{
      id: "transactions", metricDefinition: semantics.dimensions.metricDefinition, unit: semantics.unit, aggregation: "IDENTITY",
      timeWindow: { startDate: "2026-08-01", endDate: "2026-10-01" }, periods: [semantics.time, laterObservation().semantics.time],
    }],
    data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "version-1" }] } },
    ...over,
  };
}
export function marketEnvelope(): MarketResult {
  const input = marketInput();
  const rawRequest = marketRequest();
  rawRequest.series[0]!.periods = [marketObservation().semantics.time];
  const normalized = normalizeMarketRequest(rawRequest, { evaluatedAt: marketInstant });
  const metric = calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [marketObservation()] }, [input], marketInstant);
  const request = { normalized: normalized.normalized, evaluatedAt: marketInstant };
  const envelope: MarketResult = {
    contract: MARKET_RESULT_CONTRACT, runId: "test-market-run", evaluatedAt: marketInstant,
    engine: { key: MARKET_ENGINE_KEY, version: MARKET_VERSION, contracts: { request: MARKET_REQUEST_CONTRACT, result: MARKET_RESULT_CONTRACT }, environment: "test", policies: [marketConfidencePolicy] },
    status: "COMPLETED", request, inputs: [input],
    dataAvailability: [{ role: "demand.observations", status: "AVAILABLE", inputIds: [input.id] }],
    results: [{ analysis: "OBSERVED_DEMAND", seriesId: "transactions", metrics: [metric] }],
    gaps: normalizeGaps([...deriveInputGaps(input), ...metric.gaps]),
    attribution: deriveAttribution([input]), rights: deriveRights([input]),
    determinism: { requestHash: "0".repeat(64), inputsHash: "0".repeat(64), outputHash: "0".repeat(64) },
    limits: { costUnits: 1, budgetUnits: 1000 },
    timing: { startedAt: marketInstant, finishedAt: marketInstant, durationMs: 0 },
  };
  return sealMarket(envelope);
}
export function sealMarket(envelope: MarketResult): MarketResult {
  envelope.status = deriveRunStatus(envelope.results.flatMap((result) => result.metrics), envelope.gaps);
  envelope.determinism = computeDeterminism(envelope);
  return envelope;
}
