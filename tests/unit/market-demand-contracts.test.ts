import { describe, expect, it } from "vitest";
import { calculateMarketMetric, marketRequestSchema, marketResultSchema, normalizeMarketRequest, type MarketRequest, type MarketResult } from "@/services/analysis-engines/market-demand";
import { canonicalHash, canonicalize, computeOutputHash, deriveInputGaps, engineMetricSchema, normalizeGaps } from "@/services/analysis-engines/shared";
import { makeMetric } from "./support/analysis-engine-fixtures";
import { laterObservation, marketEnvelope, marketInput, marketInstant, marketObservation, marketRequest, marketSeed, sealMarket } from "./support/market-demand-fixtures";

describe("jenan.market-demand.request/v1", () => {
  it("accepts bounded explicit inputs and normalizes without mutation", () => {
    const request = marketRequest();
    const original = structuredClone(request);
    const result = normalizeMarketRequest(request, { evaluatedAt: marketInstant });
    expect(result.normalized.parameters).toEqual({ comparisons: [], basePeriods: [], estimates: [] });
    expect(result.evaluatedAt).toBe(marketInstant);
    expect(request).toEqual(original);
  });
  it("normalizes ordering, duplicate analysis/measures, explicit defaults and correlation ids identically", () => {
    const request = marketRequest({ analyses: ["MARKET_CONTEXT", "OBSERVED_DEMAND"] });
    const reversed = structuredClone(request);
    reversed.analyses = ["OBSERVED_DEMAND", "MARKET_CONTEXT", "MARKET_CONTEXT"];
    reversed.series[0]!.periods.reverse();
    reversed.parameters = { comparisons: [], basePeriods: [], estimates: [] };
    reversed.options = { requestId: "other-request" };
    const first = normalizeMarketRequest(request, { evaluatedAt: marketInstant });
    const second = normalizeMarketRequest(reversed, { evaluatedAt: marketInstant });
    expect(first.normalized).toEqual(second.normalized);
    expect(first.requestHash).toBe(second.requestHash);
  });
  it("captures by-type selection time and canonicalizes timestamp spellings", () => {
    const request = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations" } } } });
    const explicit = structuredClone(request);
    explicit.data = { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations", asOf: "2026-10-21T09:00:00Z" } } };
    expect(normalizeMarketRequest(request, { evaluatedAt: marketInstant }).requestHash).toBe(normalizeMarketRequest(explicit, { evaluatedAt: marketInstant }).requestHash);
  });
  it("rejects unauthorized/future evaluation overrides and future selection", () => {
    expect(() => normalizeMarketRequest(marketRequest({ options: { evaluatedAt: marketInstant } }), { evaluatedAt: marketInstant })).toThrow();
    expect(() => normalizeMarketRequest(marketRequest({ options: { evaluatedAt: "2027-01-01T00:00:00Z" } }), { evaluatedAt: marketInstant, allowEvaluatedAtOverride: true })).toThrow();
    const request = marketRequest({ data: { roles: { "demand.observations": { source: "DATA_CENTER", typeKey: "market-demand-observations", asOf: "2027-01-01T00:00:00Z" } } } });
    expect(() => normalizeMarketRequest(request, { evaluatedAt: marketInstant })).toThrow();
    expect(normalizeMarketRequest(marketRequest({ options: { evaluatedAt: "2026-10-20T09:00:00Z" } }), { evaluatedAt: marketInstant, allowEvaluatedAtOverride: true }).evaluatedAt).toBe("2026-10-20T09:00:00.000Z");
  });
  it.each(["revenueForecast", "successProbability", "investmentRecommendation", "marketSizeSar", "projectId", "populationToDemand", "interpolation", "url", "rawObservations"])("rejects unsupported %s input", (field) => {
    expect(marketRequestSchema.safeParse({ ...marketRequest(), [field]: true }).success).toBe(false);
  });
  it("rejects mixed exact/type selectors, historical asOf for exact pins, duplicate/unrelated inputs and unit mismatches", () => {
    const requests: unknown[] = [
      { ...marketRequest(), data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "version-1", asOf: marketInstant }] } } },
      { ...marketRequest(), data: { roles: { "demand.observations": { source: "DATA_CENTER", versionId: "version-1", typeKey: "x" } } } },
      { ...marketRequest(), data: { roles: { "spatial.output": [] } } },
      marketRequest({ data: { roles: { "context.indicators": [{ source: "DATA_CENTER", versionId: "version-1" }] } } }),
      marketRequest({ data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "v" }, { source: "DATA_CENTER", versionId: "v" }] } } }),
      marketRequest({ analyses: ["DEMAND_TREND"] }),
      marketRequest({ analyses: ["ASSUMPTION_BASED_DEMAND"] }),
    ];
    for (const request of requests) expect(marketRequestSchema.safeParse(request).success).toBe(false);
  });
  it("enforces explicit comparisons and base periods without inventing a period", () => {
    const parameters: NonNullable<MarketRequest["parameters"]> = { comparisons: [{ seriesId: "transactions", fromPeriodId: "2026-08", toPeriodId: "2026-09", measures: ["INDEX", "PERCENT_CHANGE", "ABSOLUTE_CHANGE"] }], basePeriods: [{ seriesId: "transactions", periodId: "2026-08" }] };
    const request = marketRequest({ analyses: ["DEMAND_TREND"], parameters });
    expect(marketRequestSchema.safeParse(request).success).toBe(true);
    expect(marketRequestSchema.safeParse({ ...request, parameters: { ...parameters, basePeriods: [] } }).success).toBe(false);
    expect(marketRequestSchema.safeParse({ ...request, parameters: { ...parameters, basePeriods: [{ seriesId: "transactions", periodId: "2026-09" }] } }).success).toBe(false);
    expect(marketRequestSchema.safeParse({ ...request, parameters: { ...parameters, comparisons: [{ ...parameters.comparisons![0], toPeriodId: "missing" }] } }).success).toBe(false);
  });
  it("enforces total period, series, input-version and output bounds before any data access", () => {
    const request = marketRequest();
    expect(marketRequestSchema.safeParse({ ...request, series: Array.from({ length: 21 }, (_, i) => ({ ...request.series[0], id: `s${i}` })) }).success).toBe(false);
    expect(marketRequestSchema.safeParse({ ...request, series: [request.series[0], request.series[0]] }).success).toBe(false);
    expect(marketRequestSchema.safeParse({ ...request, series: [{ ...request.series[0], timeWindow: { startDate: "2026-09-01", endDate: "2026-10-01" } }] }).success).toBe(false);
    const pins = Array.from({ length: 32 }, (_, i) => ({ source: "DATA_CENTER" as const, versionId: `v${i}` }));
    expect(marketRequestSchema.safeParse(marketRequest({ data: { roles: { "demand.observations": pins, "dimensions.dictionary": [pins[0]!] } } })).success).toBe(false);
    const periods = Array.from({ length: 120 }, (_, i) => ({ ...marketObservation().semantics.time, id: `p${i}` }));
    expect(marketRequestSchema.safeParse({ ...request, series: [{ ...request.series[0], periods }, { ...request.series[0], id: "s2" }] }).success).toBe(false);
  });
  it("accepts exact admission maxima: 20 series, 120 periods, 32 selections and 500 projected metrics", () => {
    const request = marketRequest({ analyses: ["MARKET_CONTEXT", "OBSERVED_DEMAND", "DEMAND_TREND", "AUDIENCE_CONTEXT", "ASSUMPTION_BASED_DEMAND"] });
    const periods = Array.from({ length: 6 }, (_, i) => ({
      kind: "INTERVAL" as const, id: `p${i}`, startDate: new Date(Date.UTC(2026, 3 + i, 1)).toISOString().slice(0, 10),
      endDate: new Date(Date.UTC(2026, 4 + i, 1)).toISOString().slice(0, 10), frequency: "MONTHLY" as const, calendar: "GREGORIAN" as const, timeZone: "Asia/Riyadh",
    }));
    const unit = request.series[0]!.unit;
    request.series = Array.from({ length: 20 }, (_, i) => ({
      ...request.series[0]!, id: `s${i}`, metricDefinition: { id: `m${i}`, version: "1" },
      timeWindow: { startDate: "2026-04-01", endDate: "2026-10-01" }, periods,
    }));
    request.parameters = {
      comparisons: request.series.flatMap((series) => [1, 2].map((end) => ({ seriesId: series.id, fromPeriodId: "p0", toPeriodId: `p${end}`, measures: ["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"] }))),
      basePeriods: request.series.map((series) => ({ seriesId: series.id, periodId: "p0" })),
      estimates: request.series.map((series) => ({
        id: `e-${series.id}`, seriesId: series.id, periodId: "p0", outputUnit: unit,
        cohortObservationRef: { inputId: "v0", observationId: "population" },
        adoptionObservationRef: { inputId: "v0", observationId: "adoption" },
        frequencyObservationRef: { inputId: "v0", observationId: "frequency" },
      })),
    };
    request.data = { roles: { "demand.observations": Array.from({ length: 32 }, (_, i) => ({ source: "DATA_CENTER", versionId: `v${i}` })) } };
    expect(marketRequestSchema.safeParse(request).success).toBe(true);
    const extraComparison = structuredClone(request);
    extraComparison.parameters!.comparisons!.push({ ...extraComparison.parameters!.comparisons![0]!, toPeriodId: "p3" });
    expect(marketRequestSchema.safeParse(extraComparison).success).toBe(false);
  });
  it("changes request hashes for exact scope, unit, base or source version changes", () => {
    const first = normalizeMarketRequest(marketRequest(), { evaluatedAt: marketInstant }).requestHash;
    const changed = marketRequest();
    changed.scope.sector.version = "2";
    expect(normalizeMarketRequest(changed, { evaluatedAt: marketInstant }).requestHash).not.toBe(first);
    expect(normalizeMarketRequest(marketRequest({ data: { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "version-2" }] } } }), { evaluatedAt: marketInstant }).requestHash).not.toBe(first);
  });
});

describe("jenan.market-demand.result/v1 integrity", () => {
  it("validates the full shared envelope, evidence, method and exact confidence without transforming output", () => {
    const result = marketEnvelope();
    expect(marketResultSchema.parse(result)).toEqual(result);
    expect(canonicalize(marketResultSchema.parse(result))).toBe(canonicalize(result));
  });
  it.each(["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"] as const)("validates a complete %s envelope, and zero-base gaps without pretending a value exists", (operation) => {
    for (const before of [0, 100]) {
      const input = marketInput();
      const first = marketObservation({ value: before });
      const metric = calculateMarketMetric(marketSeed, { operation, operands: [first, laterObservation()] }, [input], marketInstant);
      const request = marketRequest({
        analyses: ["DEMAND_TREND"],
        parameters: {
          comparisons: [{ seriesId: "transactions", fromPeriodId: "2026-08", toPeriodId: "2026-09", measures: [operation] }],
          basePeriods: operation === "INDEX" ? [{ seriesId: "transactions", periodId: "2026-08" }] : [],
        },
      });
      const result = marketEnvelope();
      result.request.normalized = normalizeMarketRequest(request, { evaluatedAt: marketInstant }).normalized;
      result.results = [{ analysis: "DEMAND_TREND", seriesId: "transactions", metrics: [metric] }];
      result.gaps = normalizeGaps([...deriveInputGaps(input), ...metric.gaps]);
      expect(marketResultSchema.parse(sealMarket(result))).toEqual(result);
    }
  });
  it("validates unavailable/suppressed and limited-sample envelopes, with explicit null values and gaps", () => {
    for (const [row, input] of [
      [marketObservation({ value: null, status: "SUPPRESSED" }), marketInput()],
      [marketObservation({ geographicCoverage: "OUTSIDE" }), marketInput()],
      [marketObservation(), marketInput({ completeness: "SAMPLE" })],
    ] as const) {
      const result = marketEnvelope();
      const metric = calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [row] }, [input], marketInstant);
      result.inputs = [input];
      result.results[0]!.metrics = [metric];
      result.gaps = normalizeGaps([...deriveInputGaps(input), ...metric.gaps]);
      expect(marketResultSchema.parse(sealMarket(result))).toEqual(result);
      if (input.completeness === "SAMPLE") expect(metric.status).toBe("PARTIAL");
      else expect(metric.value).toBeNull();
    }
  });
  it("rejects invented lineage, future source selection and missing per-metric gaps as schema issues, not exceptions", () => {
    const lineage = marketEnvelope();
    lineage.results[0]!.metrics[0]!.trace.operands[0].sourceRefs = [{ inputId: "missing-source", observationId: "x" }];
    expect(marketResultSchema.safeParse(sealMarket(lineage)).success).toBe(false);
    const future = marketEnvelope();
    future.request.normalized.data.roles["demand.observations"] = { source: "DATA_CENTER", typeKey: "market-demand-observations", asOf: "2027-01-01T00:00:00Z" };
    expect(marketResultSchema.safeParse(sealMarket(future)).success).toBe(false);
    const limited = marketEnvelope();
    const input = marketInput({ completeness: "SAMPLE" });
    limited.inputs = [input];
    limited.results[0]!.metrics = [calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [marketObservation()] }, [input], marketInstant)];
    limited.gaps = deriveInputGaps(input);
    expect(marketResultSchema.safeParse(sealMarket(limited)).success).toBe(false);
  });
  const mutations: Array<[string, (result: MarketResult) => void]> = [
    ["value", (result) => { result.results[0]!.metrics[0]!.value = 999; }],
    ["taxonomy", (result) => { result.results[0]!.metrics[0]!.resultClass = "CONTEXTUAL"; }],
    ["signal", (result) => { result.results[0]!.metrics[0]!.signalRole = "CONTEXT"; }],
    ["lineage", (result) => { result.results[0]!.metrics[0]!.lineageNature = "ESTIMATE"; }],
    ["method", (result) => { result.results[0]!.metrics[0]!.method = "undocumented"; }],
    ["confidence", (result) => { result.results[0]!.metrics[0]!.confidence!.policyId = "spatial-confidence-v1"; }],
    ["scope", (result) => { result.results[0]!.metrics[0]!.trace.operands[0].semantics.dimensions.geography.version = "changed"; }],
    ["source pin", (result) => { result.inputs[0]!.ref.id = "different-version"; }],
    ["source role", (result) => { result.inputs[0]!.roles = ["context.indicators"]; }],
    ["unresolved input", (result) => { result.inputs = []; }],
    ["duplicate input", (result) => { result.inputs.push(structuredClone(result.inputs[0]!)); }],
    ["evaluation", (result) => { result.request.evaluatedAt = "2026-01-01T00:00:00.000Z"; }],
    ["analysis", (result) => { result.results[0]!.analysis = "MARKET_CONTEXT"; }],
    ["duplicate result", (result) => { result.results.push(structuredClone(result.results[0]!)); }],
    ["missing selected period", (result) => { result.request.normalized.series[0]!.periods.push(laterObservation().semantics.time); }],
    ["missing selected group", (result) => { result.request.normalized.analyses.push("MARKET_CONTEXT"); }],
    ["empty unsupported result", (result) => { result.results[0]!.metrics = []; }],
    ["invented rights", (result) => { result.rights = { allowExport: false, denials: [] }; }],
  ];
  it.each(mutations)("rejects tampered %s even after hashes are recomputed", (_name, mutate) => {
    const result = structuredClone(marketEnvelope());
    mutate(result);
    sealMarket(result);
    expect(marketResultSchema.safeParse(result).success).toBe(false);
  });
  it.each(["successProbability", "revenueForecast", "investmentRecommendation", "marketSizeSar"])("does not emit %s", (field) => {
    expect(marketResultSchema.safeParse({ ...marketEnvelope(), [field]: 100 }).success).toBe(false);
  });
  it("rejects a result larger than the common 2 MiB persistence bound", () => {
    const result = marketEnvelope();
    const metric = result.results[0]!.metrics[0]!;
    result.results[0]!.metrics = Array.from({ length: 500 }, (_, index) => ({
      ...structuredClone(metric), key: `demand.m${index}`, limitations: Array.from({ length: 10 }, (_, n) => `${n}${"x".repeat(499)}`),
    }));
    const parsed = marketResultSchema.safeParse(sealMarket(result));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.message.includes("2 MiB"))).toBe(true);
  });
  it("checks all three hashes but excludes run id/timing from deterministic output", () => {
    const result = marketEnvelope();
    expect(computeOutputHash({ ...result, runId: "different", timing: { ...result.timing, durationMs: 9 } })).toBe(result.determinism.outputHash);
    expect(marketResultSchema.safeParse({ ...result, determinism: { ...result.determinism, outputHash: "0".repeat(64) } }).success).toBe(false);
    expect(result.determinism.inputsHash).toBe(canonicalHash(result.inputs));
    const metric = calculateMarketMetric(marketSeed, { operation: "ABSOLUTE_CHANGE", operands: [marketObservation(), laterObservation()] }, [marketInput()], marketInstant);
    expect(metric).toEqual(calculateMarketMetric(marketSeed, metric.trace, [marketInput()], marketInstant));
  });
  it("preserves legacy parsed bytes, hash and negative-value rejection", () => {
    const metric = makeMetric();
    expect(canonicalize(engineMetricSchema.parse(metric))).toBe(canonicalize(metric));
    expect(canonicalHash(engineMetricSchema.parse(metric))).toBe(canonicalHash(metric));
    expect(engineMetricSchema.parse(metric)).not.toHaveProperty("semantics");
    expect(engineMetricSchema.safeParse({ ...metric, value: -1 }).success).toBe(false);
  });
});
