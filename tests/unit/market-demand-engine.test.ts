import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  calculateAdvancedMarketMetric, marketM3ResultSchema, marketResultSchema, runMarketAnalysis,
  type MarketAdvancedTrace, type MarketDataset, type MarketDatasetRole, type MarketM3Result, type MarketRequest, type MarketRunContext,
} from "@/services/analysis-engines/market-demand";
import { computeDeterminism } from "@/services/analysis-engines/shared";
import { EngineError } from "@/services/analysis-engines/shared/errors";
import { marketDataset, marketPortFixture, marketReference } from "./support/market-data-fixtures";
import { laterObservation, marketEnvelope, marketInput, marketInstant, marketObservation, marketRequest, marketSeed } from "./support/market-demand-fixtures";

const context: MarketRunContext = {
  runId: "m3-test-run", evaluatedAt: marketInstant, environment: "test",
  timing: { startedAt: marketInstant, finishedAt: marketInstant, durationMs: 0 },
};
function fixture() {
  const f = marketPortFixture();
  const put = (version: string, dataset: MarketDataset) => {
    const content = JSON.stringify(dataset);
    const reference = f.versions.get(version)?.reference ?? marketReference(version, dataset.role);
    reference.version.checksum.value = createHash("sha256").update(content).digest("hex");
    f.versions.set(version, { reference, content });
    return reference;
  };
  for (const [version, entry] of f.versions) put(version, JSON.parse(entry.content));
  return { ...f, put, dataset: (version: string): MarketDataset => JSON.parse(f.versions.get(version)!.content) };
}
async function run(request = marketRequest(), f = fixture()) {
  try { return await runMarketAnalysis(request, f.port, context); }
  catch (error) {
    if (error instanceof EngineError) throw new Error(`${error.code}: ${JSON.stringify(error.details)}`, { cause: error });
    throw error;
  }
}
const metrics = (result: MarketM3Result) => result.results.flatMap((entry) => entry.metrics);
const reseal = (result: MarketM3Result) => { result.determinism = computeDeterminism(result); return result; };
function trends(): MarketRequest {
  const request = marketRequest({ analyses: ["DEMAND_TREND"] });
  request.parameters = {
    comparisons: [{ seriesId: "transactions", fromPeriodId: "2026-08", toPeriodId: "2026-09", measures: ["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"] }],
    basePeriods: [{ seriesId: "transactions", periodId: "2026-08" }],
  };
  return request;
}
function contextual(f = fixture()) {
  const data = marketDataset("context.indicators");
  if (data.role !== "context.indicators") throw new Error("Wrong synthetic role");
  f.versions.delete("version-1");
  f.put("context-1", data);
  const dictionary = marketDataset("dimensions.dictionary");
  if (dictionary.role !== "dimensions.dictionary") throw new Error("Wrong synthetic role");
  dictionary.coverage = data.coverage;
  dictionary.definitions = data.rows.map((row) => ({
    metricDefinition: row.semantics.dimensions.metricDefinition, subject: row.subject, unit: row.semantics.unit,
    measureKind: row.semantics.measureKind, methodology: row.semantics.dimensions.methodology,
  }));
  f.put("dictionary-1", dictionary);
  const semantics = data.rows[0]!.semantics;
  const request = marketRequest({ analyses: ["MARKET_CONTEXT", "AUDIENCE_CONTEXT"], data: { roles: { "context.indicators": [{ source: "DATA_CENTER", versionId: "context-1" }] } } });
  request.series[0] = { ...request.series[0]!, unit: semantics.unit, periods: [semantics.time] };
  return { f, request };
}
function estimated() {
  const { f } = contextual();
  const demand = marketDataset();
  const dictionary = marketDataset("dimensions.dictionary");
  if (demand.role !== "demand.observations" || dictionary.role !== "dimensions.dictionary") throw new Error("Wrong synthetic role");
  f.put("dictionary-1", dictionary);
  const cohortData = f.dataset("context-1");
  if (cohortData.role !== "context.indicators") throw new Error("Wrong synthetic role");
  cohortData.rows[0]!.value = 1000; f.put("context-1", cohortData);
  const assumptions = marketDataset("demand.assumptions");
  if (assumptions.role !== "demand.assumptions") throw new Error("Wrong synthetic role");
  const adoption = assumptions.rows[0]!;
  adoption.unit.entity = "population_count"; adoption.value = 0.25;
  assumptions.rows.push({
    ...structuredClone(adoption), id: "frequency", kind: "CONSUMPTION_FREQUENCY", value: 2,
    unit: { id: "monthly-consumption", version: "1", dimension: "FREQUENCY", entity: "purchase_transactions", per: { entity: "population_count", frequency: "MONTHLY" } },
    sourceRefs: [{ observationId: "frequency" }],
    assumptions: [{ id: "declared-frequency", description: "Synthetic consumption assumption", sourceRefs: [{ observationId: "frequency" }] }],
  });
  f.put("assumptions-1", assumptions);
  const request = marketRequest({ analyses: ["ASSUMPTION_BASED_DEMAND"], data: { roles: {
    "context.indicators": [{ source: "DATA_CENTER", versionId: "context-1" }],
    "demand.assumptions": [{ source: "DATA_CENTER", versionId: "assumptions-1" }],
  } } });
  request.series[0]!.periods = [demand.rows[0]!.semantics.time];
  request.parameters = { estimates: [{
    id: "declared-scenario", seriesId: "transactions", periodId: "2026-08", outputUnit: request.series[0]!.unit,
    cohortObservationRef: { inputId: "dc:context-1", observationId: cohortData.rows[0]!.id },
    adoptionObservationRef: { inputId: "dc:assumptions-1", observationId: "adoption" },
    frequencyObservationRef: { inputId: "dc:assumptions-1", observationId: "frequency" },
  }] };
  return { f, request };
}
function disjoint() {
  const f = fixture(); const data = f.dataset("version-1");
  if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
  data.rows = data.rows.flatMap((row) => ["a", "b"].map((key) => ({
    ...structuredClone(row), id: `${row.id}-${key}`, value: key === "a" ? row.value : row.value! / 2,
    partition: { scheme: { id: "nonoverlapping-registers", version: "1" }, key, disjoint: true as const },
    sourceRefs: [{ observationId: `${row.id}-${key}` }],
  })));
  f.put("version-1", data);
  const request = trends(); request.analyses = ["OBSERVED_DEMAND", "DEMAND_TREND"];
  request.series[0]!.aggregation = "SUM_DISJOINT";
  return { f, request };
}

describe("Market M3 deterministic governed engine (synthetic fixtures, not real demand)", () => {
  it("runs real M2 discovery/read/validation before emitting OBSERVED levels", async () => {
    const f = fixture(); const result = await run(marketRequest(), f);
    expect(result.engine.version).toBe("1.0.0-m3");
    expect(result.outcomes.map((entry) => entry.value).sort((a, b) => a! - b!)).toEqual([80, 100]);
    expect(metrics(result).every((metric) => metric.resultClass === "OBSERVED" && metric.lineageNature === "OBSERVATION")).toBe(true);
    expect(result.rights.allowExport).toBe(false);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(marketResultSchema.safeParse(result).success).toBe(true);
  });
  it("retains the accepted M1 envelope without changing its interpretation or version", () => {
    const envelope = marketEnvelope();
    expect(marketResultSchema.parse(envelope)).toEqual(envelope);
  });
  it("calculates historical absolute -20, percentage -20 and base index 80", async () => {
    const result = await run(trends());
    const values = Object.fromEntries(result.outcomes.map((entry) => [entry.operation, entry.value]));
    expect(values).toEqual({ ABSOLUTE_CHANGE: -20, PERCENT_CHANGE: -20, INDEX: 80 });
    expect(metrics(result).every((metric) => metric.resultClass === "DERIVED")).toBe(true);
  });
  it("permits absolute change at zero but does not divide by zero", async () => {
    const f = fixture(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    data.rows[0]!.value = 0; f.put("version-1", data);
    const result = await run(trends(), f);
    expect(result.outcomes.find((entry) => entry.operation === "ABSOLUTE_CHANGE")?.value).toBe(80);
    expect(result.outcomes.filter((entry) => entry.operation !== "ABSOLUTE_CHANGE").every((entry) => entry.status === "NOT_COMPUTABLE" && entry.value === null)).toBe(true);
  });
  it("keeps population contextual in both context and audience analyses", async () => {
    const { f, request } = contextual(); const result = await run(request, f);
    expect(result.outcomes).toHaveLength(2);
    expect(metrics(result).every((metric) => metric.resultClass === "CONTEXTUAL" && metric.signalRole === "CONTEXT")).toBe(true);
    expect(f.discover.mock.calls.flatMap(([query]) => query.typeKeys ?? [])).not.toContain("market-demand-observations");
  });
  it("does not transform population into observed demand under an observation role", async () => {
    const { f, request } = contextual();
    request.analyses = ["OBSERVED_DEMAND"];
    request.data = { roles: { "demand.observations": [{ source: "DATA_CENTER", versionId: "context-1" }] } };
    const result = await run(request, f);
    expect(result.outcomes[0]).toMatchObject({ value: null, resultClass: null, status: "NOT_COMPUTABLE" });
  });
  it("does not call a DERIVED or ESTIMATED source observation OBSERVED", async () => {
    const f = fixture(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    for (const row of data.rows) row.semantics.evidenceNature = "DERIVED";
    f.put("version-1", data);
    expect((await run(marketRequest(), f)).outcomes.every((entry) => entry.status === "NOT_COMPUTABLE" && entry.value === null)).toBe(true);
  });
  it("preserves missing periods as unknown without interpolation or zero replacement", async () => {
    const f = fixture(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    data.rows.splice(1); f.put("version-1", data);
    const request = trends(); request.analyses.push("OBSERVED_DEMAND");
    const result = await run(request, f);
    expect(result.outcomes.filter((entry) => entry.periodIds.includes("2026-09")).every((entry) => entry.value === null && entry.status === "NOT_AVAILABLE")).toBe(true);
    expect(metrics(result).map((metric) => metric.value)).toEqual([100]);
  });
  it.each(["unit", "methodology", "metricDefinition", "method", "sector", "geography", "frequency"] as const)("rejects incompatible %s in a historical series", async (field) => {
    const f = fixture(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    const row = data.rows[1]!;
    if (field === "unit") row.semantics.unit.version = "2";
    else if (field === "method") row.method = "Different collection method";
    else if (field === "sector") row.semantics.dimensions.sector.code = "other";
    else if (field === "geography") row.semantics.dimensions.geography.code = "other";
    else if (field === "frequency" && row.semantics.time.kind === "INTERVAL") row.semantics.time.frequency = "CUSTOM";
    else if (field === "methodology" || field === "metricDefinition") row.semantics.dimensions[field].version = "2";
    f.put("version-1", data);
    const result = await run(trends(), f);
    expect(result.outcomes.every((entry) => entry.value === null)).toBe(true);
    expect(metrics(result).every((metric) => metric.value === null)).toBe(true);
  });
  it("sums only declared disjoint components and derives a traceable historical comparison", async () => {
    const { f, request } = disjoint(); const result = await run(request, f);
    expect(result.outcomes.filter((entry) => entry.operation === "LEVEL").map((entry) => entry.value).sort((a, b) => a! - b!)).toEqual([120, 150]);
    expect(result.outcomes.find((entry) => entry.operation === "ABSOLUTE_CHANGE")?.value).toBe(-30);
    expect(result.outcomes.find((entry) => entry.operation === "PERCENT_CHANGE")?.value).toBe(-20);
    expect(result.outcomes.find((entry) => entry.operation === "INDEX")?.value).toBe(80);
    expect(metrics(result).every((metric) => metric.resultClass === "DERIVED")).toBe(true);
  });
  it.each(["missing", "duplicate-key", "scheme", "changed-partitions"] as const)("rejects aggregation with %s disjointness proof", async (problem) => {
    const { f, request } = disjoint(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    if (problem === "missing") for (const row of data.rows) delete row.partition;
    if (problem === "duplicate-key") for (const row of data.rows) row.partition!.key = "same";
    if (problem === "scheme") data.rows[1]!.partition!.scheme.version = "2";
    if (problem === "changed-partitions") data.rows[3]!.partition!.key = "c";
    f.put("version-1", data);
    const result = await run(request, f);
    expect(result.outcomes.filter((entry) => entry.operation !== "LEVEL").every((entry) => entry.value === null && entry.status === "NOT_COMPUTABLE")).toBe(true);
  });
  it("does not aggregate duplicated records under IDENTITY", async () => {
    const { f, request } = disjoint(); request.series[0]!.aggregation = "IDENTITY";
    expect((await run(request, f)).outcomes.every((entry) => entry.value === null)).toBe(true);
  });
  it("calculates only an explicit cohort × adoption × frequency estimate with an exact policy and cap", async () => {
    const { f, request } = estimated(); const result = await run(request, f);
    expect(result.outcomes[0]).toMatchObject({ status: "ESTIMATED", value: 500, resultClass: "ESTIMATED" });
    const metric = metrics(result)[0]!;
    expect(metric.confidence?.caps.some((cap) => cap.code === "MARKET_ESTIMATED")).toBe(true);
    expect(metric.confidence?.band).not.toBe("HIGH");
    expect(metric.confidence?.policyVersion).toBe("1.0.0");
    expect(metric.trace.operation).toBe("EXPLICIT_ESTIMATE");
    expect(metric.inputRefs).toEqual(["dc:assumptions-1", "dc:context-1", "dc:dictionary-1"]);
    expect(metric.limitations.some((text) => text.includes("not observed demand"))).toBe(true);
  });
  it.each(["assumptions", "limitations", "denominator", "period", "cohort-date", "unit", "adoption-range", "noninteger", "missing-source"] as const)("fails closed for estimate %s without hidden correction", async (problem) => {
    const { f, request } = estimated(); const assumptions = f.dataset("assumptions-1"); const cohort = f.dataset("context-1");
    if (assumptions.role !== "demand.assumptions" || cohort.role !== "context.indicators") throw new Error("Wrong synthetic role");
    if (problem === "assumptions") assumptions.rows[0]!.assumptions = [];
    if (problem === "limitations") assumptions.rows[0]!.limitations = [];
    if (problem === "denominator") assumptions.rows[1]!.unit.per!.entity = "household_count";
    if (problem === "period") assumptions.rows[1]!.time = laterObservation().semantics.time;
    if (problem === "cohort-date" && cohort.rows[0]!.semantics.time.kind === "SNAPSHOT") { cohort.rows[0]!.semantics.time.date = "2026-08-02"; cohort.coverage.periods = [cohort.rows[0]!.semantics.time]; }
    if (problem === "unit") assumptions.rows[1]!.unit.entity = "service_use";
    if (problem === "adoption-range") assumptions.rows[0]!.value = 1.01;
    if (problem === "noninteger") { cohort.rows[0]!.value = 1; assumptions.rows[0]!.value = 0.25; }
    f.put("assumptions-1", assumptions); f.put("context-1", cohort);
    if (problem === "missing-source") f.versions.delete("assumptions-1");
    const result = await run(request, f);
    expect(result.outcomes[0]).toMatchObject({ value: null, resultClass: null });
    expect(result.gaps.some((gap) => gap.severity === "BLOCKING")).toBe(true);
  });
  it("does not silently replace a missing exact pin with another valid dataset", async () => {
    const f = fixture(); const request = marketRequest();
    request.data!.roles["demand.observations"] = [{ source: "DATA_CENTER", versionId: "version-1" }, { source: "DATA_CENTER", versionId: "missing" }];
    const result = await run(request, f);
    expect(result.outcomes.every((entry) => entry.value === null)).toBe(true);
  });
  it("uses deterministic type discovery when the caller does not pin a version, retaining its actual decision", async () => {
    const f = fixture(); const request = marketRequest(); delete request.data;
    const result = await run(request, f);
    expect(metrics(result)).toHaveLength(2);
    expect(result.sourceEvidence.every((source) => source.selection?.mode === "BY_TYPE")).toBe(true);
    expect(result.request.normalized.data.roles).toEqual({});
  });
  it("normalizes request permutations and ignores injected run ids/timing in deterministic hashes", async () => {
    const f = fixture(); const request = trends();
    const first = await run(request, f);
    request.series[0]!.periods.reverse(); request.parameters!.comparisons![0]!.measures.reverse();
    const second = await runMarketAnalysis(request, f.port, { ...context, runId: "different-run", timing: { ...context.timing, durationMs: 20, finishedAt: "2026-10-21T09:00:00.020Z" } });
    expect(second.determinism).toEqual(first.determinism);
  });
  it.each(["value", "confidence", "classification", "rights", "missing-output", "duplicate-output", "lineage", "method", "period", "formula"] as const)("rejects a rehashed %s forgery", async (problem) => {
    const { f, request } = estimated(); const result = await run(request, f); const metric = metrics(result)[0]!;
    if (problem === "value") { metric.value = 999; result.outcomes[0]!.value = 999; }
    if (problem === "confidence" && metric.confidence) metric.confidence.band = "HIGH";
    if (problem === "classification") metric.resultClass = "OBSERVED";
    if (problem === "rights") result.rights.allowExport = true;
    if (problem === "missing-output") result.outcomes = [];
    if (problem === "duplicate-output") result.outcomes.push(result.outcomes[0]!);
    if (problem === "lineage") metric.inputRefs = ["dc:context-1"];
    if (problem === "method") metric.method = "Unapproved hidden model";
    if (problem === "period") metric.semantics.time.id = "forged-period";
    if (problem === "formula" && metric.trace.operation === "EXPLICIT_ESTIMATE") metric.trace.adoption.row.value = 0.9;
    expect(marketM3ResultSchema.safeParse(reseal(result)).success).toBe(false);
  });
  it("keeps restricted rights and complete source/version/hash metadata even on unavailable output", async () => {
    const f = fixture(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    data.coverage.geographies = null; f.put("version-1", data);
    const result = await run(marketRequest(), f);
    expect(result.rights.allowExport).toBe(false);
    expect(result.sourceEvidence[0]!.reference).not.toBeNull();
    expect(result.inputs.find((input) => input.id === "dc:version-1")?.checksum?.value).toHaveLength(64);
    expect(result.outcomes.every((entry) => entry.value === null)).toBe(true);
  });
  it("rejects overflow without emitting Infinity or a misleading value", async () => {
    const { f, request } = disjoint(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    for (const row of data.rows) row.value = Number.MAX_SAFE_INTEGER;
    f.put("version-1", data);
    const result = await run(request, f);
    expect(result.outcomes.every((entry) => entry.value === null)).toBe(true);
  });
  it("does not accept a fabricated advanced trace with unresolved source input", () => {
    const trace: MarketAdvancedTrace = { operation: "SUM_DISJOINT", operands: [marketObservation()], supporting: [] };
    expect(() => calculateAdvancedMarketMetric(marketSeed, trace, [], marketInstant)).toThrow();
  });
  it("requires every lineage row, not merely an input with the same version id", () => {
    const row = marketObservation({ sourceRefs: [{ inputId: "dc:version-1", observationId: "missing-row" }] });
    const metric = calculateAdvancedMarketMetric(marketSeed, { operation: "MARKET_LEVEL", operands: [row], supporting: [] }, [marketInput()], marketInstant);
    expect(metric).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
  });
  it.each(["successProbability", "revenueForecast", "investmentRecommendation", "marketSizeSar", "projectRanking"])("rejects forbidden M3 output %s", async (field) => {
    const result = await run();
    expect(marketM3ResultSchema.safeParse({ ...result, [field]: 100 }).success).toBe(false);
  });
  it("caps DERIVED confidence by the weakest transitive required source, retaining all source hashes", async () => {
    const f = fixture();
    const data = f.dataset("version-1"); const upstream = marketDataset();
    if (data.role !== "demand.observations" || upstream.role !== "demand.observations") throw new Error("Wrong synthetic role");
    upstream.coverage.completeness = "SAMPLE";
    for (const row of upstream.rows) row.semantics.dimensions.metricDefinition.id = "survey-basis";
    f.put("upstream", upstream);
    for (const row of data.rows) row.sourceRefs.push({ versionId: "upstream", observationId: row.id });
    const reference = f.put("version-1", data); reference.version.upstreamVersionIds = ["upstream"];
    for (const version of f.versions.values()) version.reference.quality = marketInput().quality;
    const request = trends(); request.data!.roles["demand.observations"] = [
      { source: "DATA_CENTER", versionId: "version-1" }, { source: "DATA_CENTER", versionId: "upstream" },
    ];
    const result = await run(request, f);
    expect(metrics(result)).toHaveLength(3);
    for (const metric of metrics(result)) {
      expect(metric.resultClass).toBe("DERIVED");
      expect(metric.confidence?.band).toBe("LOW");
      expect(metric.inputRefs).toContain("dc:upstream");
      expect(metric.trace.supporting.some((entry) => entry.kind === "OBSERVATION" && entry.row.ref.inputId === "dc:upstream")).toBe(true);
    }
  });
  it("also caps calculations by a required dictionary's quality instead of silently omitting it", async () => {
    const f = fixture();
    for (const version of f.versions.values()) version.reference.quality = marketInput().quality;
    const dictionary = f.dataset("dictionary-1"); dictionary.coverage.completeness = "SAMPLE"; f.put("dictionary-1", dictionary);
    const result = await run(trends(), f);
    expect(metrics(result).every((metric) => metric.confidence?.band === "LOW" && metric.inputRefs.includes("dc:dictionary-1"))).toBe(true);
  });
  it.each(["geography", "sector", "period"] as const)("returns NO_COVERAGE, not zero, outside %s", async (dimension) => {
    const f = fixture(); const request = marketRequest();
    if (dimension === "geography") request.scope.geography.code = "uncovered";
    if (dimension === "sector") request.scope.sector.code = "uncovered";
    if (dimension === "period") {
      request.series[0]!.periods = [{ ...marketObservation().semantics.time, id: "2026-07", kind: "INTERVAL", frequency: "MONTHLY", startDate: "2026-07-01", endDate: "2026-08-01" }];
      request.series[0]!.timeWindow.startDate = "2026-07-01";
    }
    const result = await run(request, f);
    expect(result.outcomes.every((entry) => entry.status === "NO_COVERAGE" && entry.value === null)).toBe(true);
  });
  it.each(["expired", "effective-end", "future-publication", "checksum"] as const)("does not calculate from %s source evidence", async (problem) => {
    const f = fixture(); const reference = f.versions.get("version-1")!.reference; const request = marketRequest();
    if (problem === "expired") reference.freshness.status = "EXPIRED";
    if (problem === "effective-end") reference.freshness.effectiveTo = "2026-10-20T00:00:00.000Z";
    if (problem === "future-publication") reference.publication.publishedAt = "2027-01-01T00:00:00.000Z";
    if (problem === "checksum") request.data!.roles["demand.observations"] = [{ source: "DATA_CENTER", versionId: "version-1", expectedChecksum: "0".repeat(64) }];
    expect((await run(request, f)).outcomes.every((entry) => entry.value === null)).toBe(true);
  });
  it("does not round fractional event estimates to a misleading zero or integer", async () => {
    const { f, request } = estimated(); const data = f.dataset("assumptions-1"); const cohort = f.dataset("context-1");
    if (data.role !== "demand.assumptions" || cohort.role !== "context.indicators") throw new Error("Wrong synthetic role");
    data.rows[0]!.value = 0.000000001; cohort.rows[0]!.value = 1;
    f.put("assumptions-1", data); f.put("context-1", cohort);
    expect((await run(request, f)).outcomes[0]).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
  });
  it("accepts exactly 500 requested outcome slots, keeping every unavailable value null", async () => {
    const request = marketRequest({ analyses: ["MARKET_CONTEXT", "OBSERVED_DEMAND", "AUDIENCE_CONTEXT", "DEMAND_TREND", "ASSUMPTION_BASED_DEMAND"] });
    const periods = Array.from({ length: 6 }, (_, i) => ({
      kind: "INTERVAL" as const, id: `p${i}`, startDate: new Date(Date.UTC(2026, 3 + i, 1)).toISOString().slice(0, 10),
      endDate: new Date(Date.UTC(2026, 4 + i, 1)).toISOString().slice(0, 10), frequency: "MONTHLY" as const, calendar: "GREGORIAN" as const, timeZone: "Asia/Riyadh",
    }));
    const prototype = request.series[0]!;
    request.series = Array.from({ length: 20 }, (_, i) => ({
      ...prototype, id: `s${i}`, metricDefinition: { id: `metric-${i}`, version: "1" },
      periods, timeWindow: { startDate: "2026-04-01", endDate: "2026-10-01" },
    }));
    request.parameters = {
      comparisons: request.series.flatMap((series) => [1, 2].map((end) => ({
        seriesId: series.id, fromPeriodId: "p0", toPeriodId: `p${end}`, measures: ["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"],
      }))),
      basePeriods: request.series.map((series) => ({ seriesId: series.id, periodId: "p0" })),
      estimates: request.series.map((series) => ({
        id: `estimate-${series.id}`, seriesId: series.id, periodId: "p0", outputUnit: series.unit,
        cohortObservationRef: { inputId: "dc:missing", observationId: "cohort" },
        adoptionObservationRef: { inputId: "dc:missing", observationId: "adoption" },
        frequencyObservationRef: { inputId: "dc:missing", observationId: "frequency" },
      })),
    };
    delete request.data;
    const f = fixture(); f.versions.clear();
    const result = await run(request, f);
    expect(result.outcomes).toHaveLength(500);
    expect(new Set(result.outcomes.map((entry) => entry.key)).size).toBe(500);
    expect(result.outcomes.every((entry) => entry.value === null && entry.status === "NOT_AVAILABLE")).toBe(true);
    result.outcomes.push(structuredClone(result.outcomes[0]!));
    expect(marketM3ResultSchema.safeParse(reseal(result)).success).toBe(false);
  });
  it("rejects an over-budget request before discovery or any read", async () => {
    const f = fixture(); const request = marketRequest();
    request.series = Array.from({ length: 21 }, (_, i) => ({ ...request.series[0]!, id: `s${i}` }));
    await expect(runMarketAnalysis(request, f.port, context)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.discover).not.toHaveBeenCalled(); expect(f.read).not.toHaveBeenCalled();
  });
  it("rejects evidence beyond 2 MiB instead of truncating provenance", async () => {
    const { f, request } = disjoint(); const data = f.dataset("version-1");
    if (data.role !== "demand.observations") throw new Error("Wrong synthetic role");
    const prototype = data.rows[0]!;
    prototype.limitations = Array.from({ length: 10 }, (_, index) => `${index}${"x".repeat(480)}`);
    data.rows = Array.from({ length: 30 }, (_, i) => ({
      ...structuredClone(prototype), id: `part-${i}`, partition: { scheme: { id: "source-register", version: "1" }, key: `p${i}`, disjoint: true },
      sourceRefs: [{ observationId: `part-${i}` }],
    }));
    f.put("version-1", data);
    request.analyses = ["OBSERVED_DEMAND"];
    delete request.parameters;
    request.series = Array.from({ length: 20 }, (_, i) => ({ ...request.series[0]!, id: `series-${i}`, periods: [prototype.semantics.time] }));
    await expect(runMarketAnalysis(request, f.port, context)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
  });
  it("rejects omission of a pinned source decision even after all hashes are recomputed", async () => {
    const f = fixture(); const request = marketRequest();
    request.data!.roles["demand.observations"] = [{ source: "DATA_CENTER", versionId: "version-1" }, { source: "DATA_CENTER", versionId: "missing" }];
    const result = await run(request, f);
    result.sourceEvidence = result.sourceEvidence.filter((source) => source.requestedVersionId !== "missing");
    expect(marketM3ResultSchema.safeParse(reseal(result)).success).toBe(false);
  });
  it("retains every failed exact pin when discovery refuses its candidate budget", async () => {
    const f = fixture(); const request = marketRequest();
    request.data!.roles["demand.observations"] = [{ source: "DATA_CENTER", versionId: "version-1" }, { source: "DATA_CENTER", versionId: "missing" }];
    f.port.discover = async (query) => ({ ...await f.discover(query), status: "TOO_MANY_CANDIDATES", candidates: [], selected: null });
    const result = await run(request, f);
    expect(result.sourceEvidence.filter((source) => source.role === "demand.observations").map((source) => source.requestedVersionId).sort()).toEqual(["missing", "version-1"]);
    expect(result.outcomes.every((entry) => entry.status === "NOT_COMPUTABLE" && entry.value === null)).toBe(true);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("rejects a rehashed type-selection instant that differs from the request", async () => {
    const request = marketRequest(); delete request.data;
    const result = await run(request);
    result.sourceEvidence[0]!.selection!.asOf = "2026-10-20T00:00:00.000Z";
    expect(marketM3ResultSchema.safeParse(reseal(result)).success).toBe(false);
  });
  it.each(["demand.observations", "context.indicators", "demand.assumptions", "dimensions.dictionary"] as MarketDatasetRole[])("retains the explicit governed role %s", async (role) => {
    const { f, request } = estimated();
    if (role === "demand.observations") { request.analyses.push("OBSERVED_DEMAND"); f.put("version-1", marketDataset()); request.data!.roles[role] = [{ source: "DATA_CENTER", versionId: "version-1" }]; }
    const result = await run(request, f);
    expect(result.sourceEvidence.find((source) => source.role === role)?.role).toBe(role);
  });
});
