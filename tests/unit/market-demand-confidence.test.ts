import { describe, expect, it } from "vitest";
import { calculateMarketConfidence, marketConfidencePolicy, type MarketConfidenceBasis } from "@/services/analysis-engines/market-demand";
import { bandForScore, confidencePolicyDescriptorSchema, findBreakdownPolicyViolations, type EngineInput } from "@/services/analysis-engines/shared";
import { laterObservation, marketInput, marketInstant, marketObservation } from "./support/market-demand-fixtures";

const basis = (): MarketConfidenceBasis => ({ observation: marketObservation(), input: marketInput() });
const score = (change: Partial<EngineInput> = {}) => calculateMarketConfidence([{ ...basis(), input: marketInput(change) }], marketInstant);
describe("market-confidence-v1 evidence quality policy", () => {
  it("has exactly the approved eight factors, 100 points and no success probability", () => {
    expect(confidencePolicyDescriptorSchema.parse(marketConfidencePolicy)).toEqual(marketConfidencePolicy);
    expect(marketConfidencePolicy.id).toBe("market-confidence-v1");
    expect(marketConfidencePolicy.isProbability).toBe(false);
    expect(marketConfidencePolicy.factors.map((factor) => factor.maxPoints)).toEqual([20, 15, 15, 10, 15, 15, 5, 5]);
    const result = score();
    expect(result).toMatchObject({ kind: "SCORED", confidence: { score: 100, scoreBand: "HIGH", band: "HIGH" } });
    if (result.kind === "SCORED") expect(findBreakdownPolicyViolations(result.confidence, marketConfidencePolicy)).toEqual([]);
  });
  it.each([[100, "HIGH"], [80, "HIGH"], [79, "MEDIUM"], [60, "MEDIUM"], [59, "LOW"], [35, "LOW"], [34, "INSUFFICIENT"], [0, "INSUFFICIENT"]])("maps %s to %s", (points, band) => {
    expect(bandForScore(Number(points), marketConfidencePolicy.thresholds)).toBe(band);
  });
  it.each([
    [{ completeness: "SAMPLE" }, "LOW", "MARKET_INCOMPLETE"],
    [{ completeness: "UNKNOWN" }, "LOW", "MARKET_INCOMPLETE"],
    [{ licenseClass: null, allowExport: false }, "LOW", "MARKET_UNVERIFIED"],
    [{ evidenceStatus: "UNVERIFIED" }, "LOW", "MARKET_UNVERIFIED"],
    [{ quality: { status: "UNAVAILABLE" } }, "MEDIUM", "MARKET_QUALITY_UNMEASURED"],
    [{ freshness: { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null } }, "MEDIUM", "MARKET_FRESHNESS_LIMITED"],
    [{ freshness: { status: "STALE", sourcePublishedAt: "2026-01-01T00:00:00.000Z", freshnessDays: 30, expiresAt: null } }, "MEDIUM", "MARKET_FRESHNESS_LIMITED"],
  ] satisfies Array<[Partial<EngineInput>, string, string]>)("applies input cap %j", (change, band, code) => {
    const result = score(change);
    expect(result).toMatchObject({ kind: "SCORED", confidence: { band } });
    if (result.kind === "SCORED") expect(result.confidence.caps.map((cap) => cap.code)).toContain(code);
  });
  it("does not trust a falsely fresh descriptor beyond its declared interval", () => {
    const input = marketInput({ freshness: { status: "FRESH", sourcePublishedAt: "2020-01-01T00:00:00.000Z", freshnessDays: 30, expiresAt: null } });
    const result = calculateMarketConfidence([{ observation: marketObservation(), input }], marketInstant);
    expect(result).toMatchObject({ kind: "SCORED", confidence: { band: "MEDIUM" } });
    expect(input.freshness.status).toBe("FRESH");
  });
  it.each([
    { freshness: { status: "EXPIRED", sourcePublishedAt: "2026-09-01T00:00:00.000Z", freshnessDays: 30, expiresAt: "2026-10-01T00:00:00.000Z" } },
    { freshness: { status: "FRESH", sourcePublishedAt: "2026-09-01T00:00:00.000Z", freshnessDays: 90, expiresAt: marketInstant } },
    { freshness: { status: "FRESH", sourcePublishedAt: "2027-01-01T00:00:00.000Z", freshnessDays: 90, expiresAt: null } },
    { evidenceStatus: "CONFLICTED" },
    { evidenceStatus: "ESTIMATED" },
  ] satisfies Partial<EngineInput>[])("does not score unusable inputs %j", (change) => {
    expect(score(change)).toMatchObject({ kind: "NOT_SCORABLE", confidence: null });
  });
  it("blocks unknown scope, unsupported methods, missing lineage, unresolved assumptions and future reporting", () => {
    for (const observation of [
      marketObservation({ geographicCoverage: "UNKNOWN" }),
      marketObservation({ temporalCoverage: "UNKNOWN" }),
      marketObservation({ measurementMethod: "UNSUPPORTED" }),
      marketObservation({ sourceRefs: [{ inputId: "missing", observationId: "x" }] }),
      marketObservation({ ref: { inputId: "different", observationId: "x" } }),
    ]) expect(calculateMarketConfidence([{ observation, input: marketInput() }], marketInstant).kind).toBe("NOT_SCORABLE");
  });
  it("caps partial scope without fabricating total coverage", () => {
    const result = calculateMarketConfidence([{ ...basis(), observation: marketObservation({ geographicCoverage: "PARTIAL", temporalCoverage: "PARTIAL" }) }], marketInstant);
    expect(result).toMatchObject({ kind: "SCORED", confidence: { band: "LOW" } });
  });
  it("takes the weakest required input per factor with stable order and explicit weakest-operand caps", () => {
    const strong = basis();
    const weak: MarketConfidenceBasis = {
      observation: laterObservation({ ref: { inputId: "dc:weak", observationId: "weak" }, sourceRefs: [{ inputId: "dc:weak", observationId: "weak" }] }),
      input: marketInput({ id: "dc:weak", completeness: "SAMPLE" }),
    };
    const result = calculateMarketConfidence([strong, weak], marketInstant);
    expect(result).toEqual(calculateMarketConfidence([weak, strong], marketInstant));
    expect(result).toMatchObject({ kind: "SCORED", confidence: { band: "LOW", score: 93 } });
    if (result.kind === "SCORED") {
      expect(result.confidence.factors.find((factor) => factor.key === "completeness")?.inputId).toBe("dc:weak");
      expect(result.confidence.caps.map((cap) => cap.code)).toContain("MARKET_OPERAND_LOW");
    }
  });
  it("does not average away insufficient operands or let mixed weakest factors increase confidence", () => {
    const insufficient: MarketConfidenceBasis = {
      observation: marketObservation({ measurementMethod: "LIMITED", geographicCoverage: "PARTIAL", temporalCoverage: "PARTIAL" }),
      input: marketInput({ completeness: "UNKNOWN", evidenceStatus: "UNVERIFIED", quality: { status: "UNAVAILABLE" }, licenseClass: null, allowExport: false, freshness: { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null } }),
    };
    expect(calculateMarketConfidence([insufficient], marketInstant)).toMatchObject({ kind: "NOT_SCORABLE", confidence: null });
  });
  it("rejects conflicting row or input snapshots and invalid raw data, instead of silently choosing one", () => {
    const first = basis();
    expect(calculateMarketConfidence([first, { ...first, observation: marketObservation({ value: 200 }) }], marketInstant).kind).toBe("NOT_SCORABLE");
    expect(calculateMarketConfidence([first, { observation: laterObservation(), input: marketInput({ completeness: "SAMPLE" }) }], marketInstant).kind).toBe("NOT_SCORABLE");
    expect(() => calculateMarketConfidence([], marketInstant)).toThrow();
    expect(() => calculateMarketConfidence([first], "not-a-date")).toThrow();
  });
  it("does not equate export prohibition with loss of analysis permission", () => {
    expect(score({ licenseClass: "RESTRICTED", allowExport: false })).toMatchObject({ kind: "SCORED" });
  });
});
