import { describe, expect, it } from "vitest";
import { calculateMarketMetric, classifyMarketEvidence, comparableSeriesProblems, marketObservationSchema, metricWithoutMarketFields, type MarketObservation } from "@/services/analysis-engines/market-demand";
import { engineMetricSchema, intervalSchema, quantitySemanticsSchema, quantityValueProblems, temporalReferenceSchema, unitDefinitionSchema, type QuantitySemantics } from "@/services/analysis-engines/shared";
import { laterObservation, marketInput, marketInstant, marketObservation, marketSeed, marketSemantics } from "./support/market-demand-fixtures";

const calculate = (operation: "ABSOLUTE_CHANGE" | "PERCENT_CHANGE" | "INDEX", first = marketObservation(), second = laterObservation()) =>
  calculateMarketMetric(marketSeed, { operation, operands: [first, second] }, [marketInput()], marketInstant);

describe("generic time and unit primitives", () => {
  it("accepts complete monthly, quarterly, annual, custom intervals and stock snapshots", () => {
    const time = marketSemantics().time;
    expect(temporalReferenceSchema.parse(time)).toEqual(time);
    expect(intervalSchema.safeParse({ ...time, frequency: "QUARTERLY", startDate: "2026-01-01", endDate: "2026-04-01" }).success).toBe(true);
    expect(intervalSchema.safeParse({ ...time, frequency: "ANNUAL", startDate: "2025-01-01", endDate: "2026-01-01" }).success).toBe(true);
    expect(intervalSchema.safeParse({ ...time, frequency: "CUSTOM", startDate: "2026-01-02", endDate: "2026-01-03" }).success).toBe(true);
    expect(temporalReferenceSchema.safeParse({ kind: "SNAPSHOT", id: "census", date: "2026-01-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" }).success).toBe(true);
  });
  it.each([
    { startDate: "2026-02-30" }, { endDate: "2026-08-01" }, { startDate: "2026-08-02" },
    { timeZone: "invented/timezone" }, { calendar: "UNKNOWN" }, { frequency: "DAILY" },
    { frequency: "QUARTERLY", startDate: "2026-02-01", endDate: "2026-05-01" },
    { frequency: "ANNUAL", startDate: "2025-02-01", endDate: "2026-02-01" },
    { endDate: "2026-09-02" }, { extra: "no" },
  ])("rejects invalid periods %j", (change) => {
    expect(temporalReferenceSchema.safeParse({ ...marketSemantics().time, ...change }).success).toBe(false);
  });
  it("enforces dimension/entity/denominator and quantity ranges", () => {
    const unit = marketSemantics().unit;
    expect(unitDefinitionSchema.safeParse({ ...unit, per: { entity: "person", frequency: "MONTHLY" } }).success).toBe(false);
    expect(unitDefinitionSchema.safeParse({ ...unit, dimension: "FREQUENCY" }).success).toBe(false);
    expect(unitDefinitionSchema.safeParse({ ...unit, dimension: "CURRENCY" }).success).toBe(false);
    expect(quantityValueProblems(1.5, marketSemantics(), false)).not.toEqual([]);
    expect(quantityValueProblems(Infinity, marketSemantics(), true)).not.toEqual([]);
    expect(quantityValueProblems(-1, marketSemantics(), false)).not.toEqual([]);
    const fraction = marketSemantics({ unit: { ...unit, dimension: "FRACTION" }, measureKind: "SHARE" });
    expect(quantitySemanticsSchema.safeParse(fraction).success).toBe(true);
    expect(quantityValueProblems(1.1, fraction, false)).not.toEqual([]);
    expect(quantityValueProblems(0, fraction, false)).toEqual([]);
    expect(quantitySemanticsSchema.safeParse({ ...fraction, measureKind: "FLOW" }).success).toBe(false);
  });
});

describe("M1 deterministic change and base-index arithmetic", () => {
  it.each([
    ["ABSOLUTE_CHANGE", 100, 80, -20], ["PERCENT_CHANGE", 100, 80, -20], ["INDEX", 100, 80, 80],
    ["ABSOLUTE_CHANGE", 100, 150, 50], ["PERCENT_CHANGE", 100, 150, 50], ["INDEX", 100, 150, 150],
    ["ABSOLUTE_CHANGE", 0, 80, 80], ["ABSOLUTE_CHANGE", 0, 0, 0],
    ["PERCENT_CHANGE", 100, 0, -100], ["INDEX", 100, 0, 0], ["PERCENT_CHANGE", 10, 100, 900],
  ] as const)("%s of %s to %s is %s", (operation, before, after, value) => {
    const result = calculate(operation, marketObservation({ value: before }), laterObservation({ value: after }));
    expect(result).toMatchObject({ value, status: "COMPUTED", resultClass: "DERIVED", lineageNature: "DERIVED" });
    expect(result.semantics.comparison?.operation).toBe(operation);
  });
  it.each(["PERCENT_CHANGE", "INDEX"] as const)("refuses zero base for %s without hiding absolute change", (operation) => {
    const result = calculate(operation, marketObservation({ value: 0 }));
    expect(result).toMatchObject({ value: null, confidence: null, resultClass: null, status: "NOT_COMPUTABLE" });
    expect(result.gaps[0]?.code).toBe("MARKET_INVALID_BASE");
    expect(calculate("ABSOLUTE_CHANGE", marketObservation({ value: 0 })).value).toBe(80);
  });
  it("rounds only final output, distinguishes percent from fractions, and does not mutate inputs", () => {
    const first = marketObservation({ value: 3 });
    const original = structuredClone(first);
    expect(calculate("PERCENT_CHANGE", first, laterObservation({ value: 4 })).value).toBe(33.333333);
    expect(first).toEqual(original);
    expect(calculate("PERCENT_CHANGE", marketObservation(), laterObservation({ value: 110 })).value).toBe(10);
  });
  it("normalizes equivalent observation reference/limitation ordering before hashing", () => {
    const row = marketObservation({
      sourceRefs: [{ inputId: "dc:version-1", observationId: "b" }, { inputId: "dc:version-1", observationId: "a" }],
      limitations: ["b", "a"],
    });
    const reordered = { ...row, sourceRefs: [...row.sourceRefs].reverse(), limitations: [...row.limitations].reverse() };
    const level = (observation: MarketObservation) => calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [observation] }, [marketInput()], marketInstant);
    expect(level(row)).toEqual(level(reordered));
  });
  it("preserves gaps and never interpolates missing intermediate periods", () => {
    const second = laterObservation({ semantics: marketSemantics({ time: { kind: "INTERVAL", id: "2026-10", startDate: "2026-10-01", endDate: "2026-11-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" } }) });
    const result = calculateMarketMetric(marketSeed, { operation: "ABSOLUTE_CHANGE", operands: [marketObservation(), second] }, [marketInput()], "2026-12-01T00:00:00.000Z");
    expect(result.trace.operands).toHaveLength(2);
    expect(result.value).toBe(-20);
  });
  it("rejects future/incomplete periods and accepts historical observations as historic only", () => {
    const future = laterObservation({ semantics: marketSemantics({ time: { kind: "INTERVAL", id: "future", startDate: "2026-10-01", endDate: "2026-11-01", frequency: "MONTHLY", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" } }) });
    expect(calculate("ABSOLUTE_CHANGE", marketObservation(), future).value).toBeNull();
    expect(calculate("ABSOLUTE_CHANGE").semantics.time).toEqual(laterObservation().semantics.time);
  });
  it("does not compute a suppressed observation, unknown scope, or outside coverage as zero", () => {
    for (const row of [
      marketObservation({ value: null, status: "SUPPRESSED" }),
      marketObservation({ value: null, status: "NOT_AVAILABLE" }),
      marketObservation({ geographicCoverage: "UNKNOWN" }),
      marketObservation({ geographicCoverage: "OUTSIDE" }),
    ]) {
      expect(calculate("ABSOLUTE_CHANGE", row)).toMatchObject({ value: null, confidence: null });
    }
    expect(calculate("ABSOLUTE_CHANGE", marketObservation({ geographicCoverage: "OUTSIDE" })).status).toBe("NO_COVERAGE");
  });
  it("reports PARTIAL for a sample without extrapolating it into a market total", () => {
    const result = calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [marketObservation()] }, [marketInput({ completeness: "SAMPLE" })], marketInstant);
    expect(result).toMatchObject({ value: 100, status: "PARTIAL", resultClass: "OBSERVED", confidence: { band: "LOW" } });
    expect(result.gaps).not.toEqual([]);
  });
  it("refuses nonfinite/negative observations, fractional discrete counts and arithmetic overflow", () => {
    for (const value of [NaN, Infinity, -1, 1.5]) expect(marketObservationSchema.safeParse(marketObservation({ value })).success).toBe(false);
    const semantics = marketSemantics({ measuredSubject: "product_units", unit: { id: "items", version: "1", dimension: "ITEMS", entity: "product_units", per: null } });
    const first = marketObservation({ subject: "product_units", semantics, value: Number.MIN_VALUE });
    const second = laterObservation({ subject: "product_units", semantics: { ...semantics, time: laterObservation().semantics.time }, value: 1e300 });
    expect(calculate("INDEX", first, second).value).toBeNull();
  });
});

describe("comparable-series guard", () => {
  it.each(["metricDefinition", "geography", "sector", "cohort", "methodology", "universe"] as const)("blocks changed %s", (key) => {
    const row = laterObservation();
    const dimensions = structuredClone(row.semantics.dimensions);
    dimensions[key].version = "changed";
    const second = { ...row, semantics: { ...row.semantics, dimensions } };
    expect(comparableSeriesProblems(marketObservation(), second)).not.toEqual([]);
    expect(calculate("ABSOLUTE_CHANGE", marketObservation(), second).status).toBe("NOT_COMPUTABLE");
  });
  it("blocks different unit definitions, timezones, frequencies, adjustments, coverage and reversed periods", () => {
    const row = laterObservation();
    const variants: MarketObservation[] = [
      { ...row, semantics: { ...row.semantics, unit: { ...row.semantics.unit, version: "2" } } },
      { ...row, semantics: { ...row.semantics, dimensions: { ...row.semantics.dimensions, adjustment: "SEASONALLY_ADJUSTED" } } },
      { ...row, semantics: { ...row.semantics, time: { ...row.semantics.time, timeZone: "UTC" } } },
      { ...row, temporalCoverage: "PARTIAL" },
      { ...row, geographicCoverage: "PARTIAL" },
      { ...row, measurementMethod: "LIMITED" },
      { ...row, semantics: { ...row.semantics, time: { kind: "INTERVAL", id: "q3", startDate: "2026-07-01", endDate: "2026-10-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh", frequency: "QUARTERLY" } } },
    ];
    for (const variant of variants) expect(calculate("ABSOLUTE_CHANGE", marketObservation(), variant).status).toBe("NOT_COMPUTABLE");
    expect(comparableSeriesProblems(row, marketObservation())).not.toEqual([]);
  });
  it("requires equal custom durations and rejects stock/flow comparisons", () => {
    const custom = (id: string, startDate: string, endDate: string): QuantitySemantics["time"] => ({ kind: "INTERVAL", id, startDate, endDate, frequency: "CUSTOM", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" });
    const first = marketObservation({ semantics: marketSemantics({ time: custom("a", "2026-01-01", "2026-01-03") }) });
    const second = laterObservation({ semantics: marketSemantics({ time: custom("b", "2026-02-01", "2026-02-04") }) });
    expect(calculate("PERCENT_CHANGE", first, second).status).toBe("NOT_COMPUTABLE");
    const snapshot = marketObservation({ subject: "population_count", semantics: marketSemantics({
      measuredSubject: "population_count", unit: { id: "persons", version: "1", entity: "population_count", dimension: "PEOPLE", per: null }, measureKind: "STOCK",
      time: { kind: "SNAPSHOT", id: "census", date: "2026-01-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
    }) });
    expect(comparableSeriesProblems(first, snapshot)).not.toEqual([]);
  });
});

describe("evidence taxonomy and quantity backward compatibility", () => {
  it.each(["population_count", "household_count", "business_count", "competitor_count", "poi_count"] as const)("%s is CONTEXTUAL, never observed demand", (subject) => {
    const row = marketObservation({ subject, semantics: marketSemantics({
      measuredSubject: subject, measureKind: "STOCK",
      unit: { id: "context-unit", version: "1", entity: subject, dimension: subject === "population_count" ? "PEOPLE" : subject === "household_count" ? "HOUSEHOLDS" : "ENTITIES", per: null },
      time: { kind: "SNAPSHOT", id: "snapshot", date: "2026-01-01", calendar: "GREGORIAN", timeZone: "Asia/Riyadh" },
    }) });
    expect(classifyMarketEvidence(row)).toBe("CONTEXTUAL");
    expect(classifyMarketEvidence(row, true)).toBe("CONTEXTUAL");
  });
  it("requires estimate assumptions, sources, method, limitations and caps", () => {
    const row = marketObservation({ semantics: marketSemantics({ evidenceNature: "ESTIMATE" }) });
    expect(marketObservationSchema.safeParse(row).success).toBe(false);
    const estimated = { ...row, assumptions: [{ id: "a", description: "Explicit reviewed assumption", sourceRefs: row.sourceRefs }], limitations: ["Estimate limited to declared assumptions"] };
    const result = calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [estimated] }, [marketInput()], marketInstant);
    expect(result).toMatchObject({ resultClass: "ESTIMATED", status: "ESTIMATED", confidence: { band: "MEDIUM" } });
    expect(classifyMarketEvidence(estimated, true)).toBe("ESTIMATED");
    expect(calculate("ABSOLUTE_CHANGE", estimated).resultClass).toBe("ESTIMATED");
    expect(marketObservationSchema.safeParse({ ...estimated, semantics: marketSemantics() }).success).toBe(false);
    expect(marketObservationSchema.safeParse({ ...estimated, method: "" }).success).toBe(false);
    expect(marketObservationSchema.safeParse({ ...estimated, sourceRefs: [] }).success).toBe(false);
  });
  it("validates new kinds but never permits reinterpreting COUNT", () => {
    const calculated = calculate("ABSOLUTE_CHANGE");
    const metric = metricWithoutMarketFields(calculated);
    expect(engineMetricSchema.safeParse(metric).success).toBe(true);
    expect(engineMetricSchema.safeParse({ ...metric, valueKind: "COUNT", unit: "count" }).success).toBe(false);
    expect(engineMetricSchema.safeParse({ ...metric, semantics: undefined }).success).toBe(false);
    expect(engineMetricSchema.safeParse({ ...metric, interpretation: "MAPPED_FEATURES_ONLY" }).success).toBe(false);
  });
  it("does not let a contextual source role or monetary unit masquerade as demand", () => {
    const result = calculateMarketMetric(marketSeed, { operation: "LEVEL", operands: [marketObservation()] }, [marketInput({ roles: ["context.indicators"] })], marketInstant);
    expect(result).toMatchObject({ value: null, confidence: null, status: "NOT_COMPUTABLE" });
    expect(marketObservationSchema.safeParse({ ...marketObservation(), subject: "sales_amount_sar" }).success).toBe(false);
  });
});
