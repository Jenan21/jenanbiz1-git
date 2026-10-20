import { describe, expect, it } from "vitest";
import {
  confidenceBreakdownSchema, confidencePolicyDescriptorSchema, findBreakdownPolicyViolations, findConfidenceViolations, hasGap, isNormalizedGapList, type EngineInput, type ValueKind,
} from "@/services/analysis-engines/shared";
import {
  metricStatusForBlocks, scoreSpatialConfidence, SPATIAL_CONFIDENCE_POLICY_ID, SPATIAL_CONFIDENCE_POLICY_VERSION, spatialConfidencePolicy,
  type ConfidenceBlock, type CoverageAssessment, type GeometryFit, type SpatialConfidenceContext, type SpatialConfidenceDataset,
} from "@/services/analysis-engines/spatial/confidence";
import { spatialGapCatalog } from "@/services/analysis-engines/spatial/gaps";
import { evaluatedAt, makeInput, makeUnregisteredSampleInput, verdictArabic, verdictEnglish } from "./support/analysis-engine-fixtures";
import { cleanDataset } from "./support/spatial-engine-fixtures";

const freshness = (status: "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN", daysOld = 0) => status === "UNKNOWN"
  ? { status, sourcePublishedAt: null, freshnessDays: null, expiresAt: null }
  : { status, sourcePublishedAt: new Date(Date.parse(evaluatedAt) - daysOld * 86_400_000).toISOString(), freshnessDays: 90, expiresAt: null };
const freshInput = (over: Partial<EngineInput> = {}) => makeInput({ freshness: freshness("FRESH"), quality: { status: "MEASURED", score: 1, method: "register-check", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "Compared with a register" }, ...over });
const context = (over: Partial<SpatialConfidenceContext> = {}): SpatialConfidenceContext => ({
  datasets: [cleanDataset(freshInput())], requestedRoles: 1, availableRoles: 1, valueKind: "DISTANCE", estimated: false, fallbackApplied: false, evaluatedAt, ...over,
});
const scored = (over: Partial<SpatialConfidenceContext> = {}) => {
  const outcome = scoreSpatialConfidence(context(over));
  if (outcome.kind !== "SCORED") throw new Error(`expected SCORED, got ${JSON.stringify(outcome)}`);
  return outcome;
};
const points = (over: Partial<SpatialConfidenceContext> = {}) => Object.fromEntries(scored(over).breakdown.factors.map((factor) => [factor.key, factor.points]));
const dataset = (input: EngineInput, over: Partial<SpatialConfidenceDataset> = {}): SpatialConfidenceDataset => ({ ...cleanDataset(input), ...over });
const blocked = (over: Partial<SpatialConfidenceContext>) => {
  const outcome = scoreSpatialConfidence(context(over));
  if (outcome.kind !== "NOT_SCORABLE") throw new Error("expected NOT_SCORABLE");
  return outcome.blockedBy;
};

describe("policy descriptor", () => {
  it("is a valid explainable heuristic that says it is not a probability", () => {
    expect(confidencePolicyDescriptorSchema.parse(spatialConfidencePolicy)).toEqual(spatialConfidencePolicy);
    expect(spatialConfidencePolicy).toMatchObject({ id: "spatial-confidence-v1", version: "1.0.0", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", isProbability: false });
    expect(SPATIAL_CONFIDENCE_POLICY_ID).toBe("spatial-confidence-v1");
    expect(SPATIAL_CONFIDENCE_POLICY_VERSION).toBe("1.0.0");
    expect(spatialConfidencePolicy.disclaimer.en).toContain("not a probability");
    expect(spatialConfidencePolicy.disclaimer.ar).toContain("ليس احتمالًا");
  });

  it("weighs six factors to a total of 100 with the approved weights and thresholds", () => {
    expect(Object.fromEntries(spatialConfidencePolicy.factors.map((factor) => [factor.key, factor.maxPoints]))).toEqual({ coverage: 25, freshness: 20, sourceQuality: 20, provenanceRights: 10, geometryFidelity: 15, completeness: 10 });
    expect(spatialConfidencePolicy.factors.reduce((sum, factor) => sum + factor.maxPoints, 0)).toBe(100);
    expect(spatialConfidencePolicy.thresholds).toEqual({ high: 75, medium: 50, low: 25 });
  });

  it("declares the five caps with their bands", () => {
    expect(Object.fromEntries(spatialConfidencePolicy.caps.map((cap) => [cap.code, cap.maxBand]))).toEqual({
      COUNT_IS_NOT_AN_INVENTORY: "LOW", MAP_LAYER_UNREGISTERED: "MEDIUM", QUALITY_NOT_MEASURED: "MEDIUM", ESTIMATED_VALUE: "MEDIUM", FALLBACK_APPLIED: "MEDIUM",
    });
  });

  it("carries the methodology and disclaimer in both languages", () => {
    for (const field of [spatialConfidencePolicy.methodology, spatialConfidencePolicy.disclaimer]) {
      expect(field.ar).toMatch(/[\u0600-\u06FF]/);
      expect(field.en).toMatch(/[A-Za-z]/);
    }
    expect(spatialConfidencePolicy.methodology.en).toContain("weakest dataset");
  });
});

describe("worked examples", () => {
  it("scores the best possible data 100 with no cap", () => {
    const outcome = scored();
    expect(outcome.breakdown).toMatchObject({ policyId: "spatial-confidence-v1", score: 100, scoreBand: "HIGH", band: "HIGH", caps: [] });
    expect(points()).toEqual({ coverage: 25, freshness: 20, sourceQuality: 20, provenanceRights: 10, geometryFidelity: 15, completeness: 10 });
    expect(outcome.gaps).toEqual([]);
  });

  it("scores unregistered sample data by its points and then lowers it by the caps: 25 + 20 + 0 + 4 + 9 + 2 = 60, MEDIUM by points, LOW after the caps", () => {
    const sample = makeUnregisteredSampleInput({ freshness: freshness("FRESH") });
    const outcome = scored({ datasets: [dataset(sample, { geometry: { fit: "SUITABLE", positionalAccuracy: "UNDECLARED", valid: true } })], valueKind: "COUNT" });
    expect(points({ datasets: [dataset(sample, { geometry: { fit: "SUITABLE", positionalAccuracy: "UNDECLARED", valid: true } })], valueKind: "COUNT" })).toEqual({
      coverage: 25, freshness: 20, sourceQuality: 0, provenanceRights: 4, geometryFidelity: 9, completeness: 2,
    });
    expect(outcome.breakdown).toMatchObject({ score: 60, scoreBand: "MEDIUM", band: "LOW" });
    expect(outcome.breakdown.caps.map((cap) => cap.code)).toEqual(["COUNT_IS_NOT_AN_INVENTORY", "MAP_LAYER_UNREGISTERED", "QUALITY_NOT_MEASURED"]);
  });

  it("verifies against its own policy and against the generic self-check", () => {
    const { breakdown } = scored({ datasets: [dataset(makeUnregisteredSampleInput({ freshness: freshness("FRESH") }))], valueKind: "COUNT" });
    expect(findConfidenceViolations(breakdown)).toEqual([]);
    expect(findBreakdownPolicyViolations(breakdown, spatialConfidencePolicy)).toEqual([]);
    expect(confidenceBreakdownSchema.safeParse(breakdown).success).toBe(true);
  });
});

describe("factor rules", () => {
  it("coverage: full, partial in proportion, undeclared none", () => {
    const withCoverage = (coverage: CoverageAssessment) => points({ datasets: [dataset(freshInput(), { coverage })] }).coverage;
    expect([withCoverage({ status: "FULL" }), withCoverage({ status: "PARTIAL", fraction: 0.4 }), withCoverage({ status: "PARTIAL", fraction: 0.5 }), withCoverage({ status: "PARTIAL", fraction: 0.01 }), withCoverage({ status: "UNDECLARED" })]).toEqual([25, 10, 13, 0, 0]);
  });

  it("freshness: falls linearly as the source ages inside its period, and is nothing once stale or unknown", () => {
    const withFreshness = (status: "FRESH" | "STALE" | "UNKNOWN", daysOld = 0) => points({ datasets: [dataset(freshInput({ freshness: freshness(status, daysOld) }))] }).freshness;
    expect([withFreshness("FRESH", 0), withFreshness("FRESH", 30), withFreshness("FRESH", 45), withFreshness("FRESH", 90), withFreshness("FRESH", 120), withFreshness("STALE", 200), withFreshness("UNKNOWN")]).toEqual([20, 13, 10, 0, 0, 0, 0]);
  });

  it("freshness: a source dated after the evaluation instant is not rewarded beyond the maximum", () => {
    expect(points({ datasets: [dataset(freshInput({ freshness: freshness("FRESH", -10) }))] }).freshness).toBe(20);
  });

  it("sourceQuality: proportional to a measured score, nothing without a measurement", () => {
    const withQuality = (quality: EngineInput["quality"]) => points({ datasets: [dataset(freshInput({ quality }))] }).sourceQuality;
    const measured = (score: number) => ({ status: "MEASURED" as const, score, method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" });
    expect([withQuality(measured(1)), withQuality(measured(0.55)), withQuality(measured(0.025)), withQuality(measured(0)), withQuality({ status: "INSUFFICIENT_DATA", method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" }), withQuality({ status: "UNAVAILABLE" })]).toEqual([20, 11, 1, 0, 0, 0]);
  });

  it("provenanceRights: publication path, license text, license class and attribution each add points", () => {
    const withProvenance = (over: Partial<EngineInput>) => points({ datasets: [dataset(freshInput(over))] }).provenanceRights;
    expect(withProvenance({})).toBe(10);
    expect(withProvenance({ licenseClass: null })).toBe(8);
    expect(withProvenance({ attribution: { text: null, required: false } })).toBe(8);
    expect(withProvenance({ license: "Unknown" })).toBe(8);
    expect(withProvenance({ license: "  UNSPECIFIED " })).toBe(8);
    expect(withProvenance({ license: "غير محدد" })).toBe(8);
    expect(withProvenance({ licenseClass: null, attribution: { text: null, required: false }, license: "unknown" })).toBe(4);
    expect(withProvenance({ governance: "MAP_REGISTERED", kind: "MAP_LAYER", ref: { system: "JENAN_MAP", id: "r/l", version: null, label: "Layer" } })).toBe(10);
    expect(points({ datasets: [dataset(makeUnregisteredSampleInput({ freshness: freshness("FRESH") }))] }).provenanceRights).toBe(4);
  });

  it("geometryFidelity: how well the geometry fits the measurement plus whether accuracy is declared", () => {
    const withGeometry = (fit: GeometryFit, positionalAccuracy: "DECLARED" | "UNDECLARED") => points({ datasets: [dataset(freshInput(), { geometry: { fit, positionalAccuracy, valid: true } })] }).geometryFidelity;
    expect([withGeometry("EXACT", "DECLARED"), withGeometry("EXACT", "UNDECLARED"), withGeometry("SUITABLE", "UNDECLARED"), withGeometry("PROXY", "UNDECLARED"), withGeometry("UNSUITABLE", "UNDECLARED"), withGeometry("UNSUITABLE", "DECLARED")]).toEqual([15, 12, 9, 5, 2, 5]);
  });

  it("completeness: an inventory earns the points, a sample or unknown data few, and missing roles scale them down", () => {
    const withCompleteness = (completeness: EngineInput["completeness"], requestedRoles = 1, availableRoles = 1) => points({ datasets: [dataset(freshInput({ completeness }))], requestedRoles, availableRoles }).completeness;
    expect([withCompleteness("INVENTORY"), withCompleteness("SAMPLE"), withCompleteness("UNKNOWN"), withCompleteness("INVENTORY", 2, 1), withCompleteness("INVENTORY", 2, 0), withCompleteness("SAMPLE", 3, 1)]).toEqual([10, 2, 1, 5, 0, 1]);
  });
});

describe("weakest dataset", () => {
  const strong = freshInput({ id: "dc:a" });
  const weak = freshInput({ id: "dc:b", quality: { status: "MEASURED", score: 0.5, method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" }, completeness: "SAMPLE" });

  it("takes each factor from the weakest dataset and names it", () => {
    const { breakdown } = scored({ datasets: [dataset(strong), dataset(weak)] });
    const factor = (key: string) => breakdown.factors.find((entry) => entry.key === key);
    expect(factor("sourceQuality")).toMatchObject({ points: 10, inputId: "dc:b" });
    expect(factor("completeness")).toMatchObject({ points: 2, inputId: "dc:b" });
    expect(factor("coverage")).toMatchObject({ points: 25, inputId: "dc:a" });
  });

  it("breaks ties by input id and does not depend on the order of the datasets", () => {
    const one = scored({ datasets: [dataset(freshInput({ id: "dc:b" })), dataset(freshInput({ id: "dc:a" }))] });
    expect(one.breakdown.factors.every((factor) => factor.inputId === "dc:a")).toBe(true);
    const forward = scoreSpatialConfidence(context({ datasets: [dataset(strong), dataset(weak)] }));
    const backward = scoreSpatialConfidence(context({ datasets: [dataset(weak), dataset(strong)] }));
    expect(backward).toEqual(forward);
  });

  it("lets a poor dataset lower the result however good the other is", () => {
    const together = scored({ datasets: [dataset(strong), dataset(weak)] }).breakdown.score;
    expect(together).toBe(scored({ datasets: [dataset(weak)] }).breakdown.score);
    expect(together).toBeLessThan(scored({ datasets: [dataset(strong)] }).breakdown.score);
  });
});

describe("caps and gaps", () => {
  const sample = (over: Partial<EngineInput> = {}) => freshInput({ completeness: "SAMPLE", ...over });
  const capCodes = (over: Partial<SpatialConfidenceContext>) => scored(over).breakdown.caps.map((cap) => cap.code);

  it("caps a count or a density from data that is not an inventory at LOW, and reports each such dataset", () => {
    for (const valueKind of ["COUNT", "DENSITY"] as const) {
      const outcome = scored({ datasets: [dataset(sample({ id: "dc:a" })), dataset(sample({ id: "dc:b" }))], valueKind });
      expect(outcome.breakdown.band).toBe("LOW");
      expect(outcome.breakdown.caps.map((cap) => cap.code)).toEqual(["COUNT_IS_NOT_AN_INVENTORY"]);
      expect(outcome.gaps.map((gap) => `${gap.code}:${gap.inputId}`)).toEqual(["COUNT_IS_NOT_AN_INVENTORY:dc:a", "COUNT_IS_NOT_AN_INVENTORY:dc:b"]);
    }
  });

  it("treats unknown completeness like a sample for counts, and an inventory as fine", () => {
    expect(capCodes({ datasets: [dataset(freshInput({ completeness: "UNKNOWN" }))], valueKind: "COUNT" })).toContain("COUNT_IS_NOT_AN_INVENTORY");
    expect(capCodes({ datasets: [dataset(freshInput({ completeness: "INVENTORY" }))], valueKind: "COUNT" })).toEqual([]);
  });

  it("does not cap a distance, an area or a categorical value for being a sample", () => {
    for (const valueKind of ["DISTANCE", "AREA", "CATEGORICAL", "BOOLEAN", "TEXT", "POPULATION"] as ValueKind[]) {
      const outcome = scored({ datasets: [dataset(sample())], valueKind });
      expect(outcome.breakdown.caps.map((cap) => cap.code)).not.toContain("COUNT_IS_NOT_AN_INVENTORY");
      expect(outcome.gaps).toEqual([]);
    }
  });

  it("caps at MEDIUM for an unregistered layer, an unmeasured quality, an estimate and a fallback", () => {
    expect(capCodes({ datasets: [dataset(makeUnregisteredSampleInput({ freshness: freshness("FRESH"), completeness: "INVENTORY" }))] })).toEqual(["MAP_LAYER_UNREGISTERED", "QUALITY_NOT_MEASURED"]);
    expect(capCodes({ datasets: [dataset(freshInput({ quality: { status: "UNAVAILABLE" } }))] })).toEqual(["QUALITY_NOT_MEASURED"]);
    expect(capCodes({ datasets: [dataset(freshInput({ quality: { status: "INSUFFICIENT_DATA", method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" } }))] })).toEqual(["QUALITY_NOT_MEASURED"]);
    expect(capCodes({ estimated: true })).toEqual(["ESTIMATED_VALUE"]);
    expect(capCodes({ fallbackApplied: true })).toEqual(["FALLBACK_APPLIED"]);
    expect(scored({ estimated: true, fallbackApplied: true }).breakdown).toMatchObject({ score: 100, scoreBand: "HIGH", band: "MEDIUM" });
  });

  it("never lets a cap raise a low score", () => {
    const poor = freshInput({ freshness: freshness("UNKNOWN"), quality: { status: "UNAVAILABLE" }, completeness: "SAMPLE", licenseClass: null, attribution: { text: null, required: false } });
    const outcome = scored({ datasets: [dataset(poor, { coverage: { status: "UNDECLARED" }, geometry: { fit: "PROXY", positionalAccuracy: "UNDECLARED", valid: true } })], valueKind: "COUNT" });
    expect(outcome.breakdown.score).toBeLessThan(25);
    expect(outcome.breakdown.band).toBe("INSUFFICIENT");
  });

  it("reports a partial coverage as a gap that names the dataset", () => {
    const outcome = scored({ datasets: [dataset(freshInput({ id: "dc:a", ref: { system: "DATA_CENTER", id: "version-1", version: 3, label: "Hospitals atlas" } }), { coverage: { status: "PARTIAL", fraction: 0.6 } })] });
    expect(outcome.gaps).toHaveLength(1);
    expect(outcome.gaps[0]).toMatchObject({ code: "COVERAGE_PARTIAL", severity: "WARNING", inputId: "dc:a" });
    expect(outcome.gaps[0]?.message.en).toContain("Hospitals atlas");
  });

  it("returns gaps from the Spatial catalog, normalized, so the envelope can include them as they are", () => {
    const outcome = scored({ datasets: [dataset(sample({ id: "dc:b" }), { coverage: { status: "PARTIAL", fraction: 0.5 } }), dataset(sample({ id: "dc:a" }))], valueKind: "COUNT" });
    expect(isNormalizedGapList(outcome.gaps)).toBe(true);
    for (const gap of outcome.gaps) expect(Object.keys(spatialGapCatalog)).toContain(gap.code);
    expect(hasGap(outcome.gaps, "COUNT_IS_NOT_AN_INVENTORY", "dc:a")).toBe(true);
    expect(hasGap(outcome.gaps, "COVERAGE_PARTIAL", "dc:b")).toBe(true);
  });
});

describe("what cannot be scored", () => {
  it("does not score a location outside the coverage, expired data, unusable geometry or no data at all", () => {
    expect(blocked({ datasets: [dataset(freshInput(), { coverage: { status: "NONE" } })] })).toEqual([{ code: "NO_COVERAGE", inputId: "dc:version-1" }]);
    expect(blocked({ datasets: [dataset(freshInput({ freshness: freshness("EXPIRED", 200) }))] })).toEqual([{ code: "DATA_EXPIRED", inputId: "dc:version-1" }]);
    expect(blocked({ datasets: [dataset(freshInput(), { geometry: { fit: "EXACT", positionalAccuracy: "DECLARED", valid: false } })] })).toEqual([{ code: "DATASET_GEOMETRY_INVALID", inputId: "dc:version-1" }]);
    expect(blocked({ datasets: [] })).toEqual([{ code: "DATASET_NOT_AVAILABLE", inputId: null }]);
  });

  it("lists every blocker in a stable order", () => {
    const outcome = blocked({
      datasets: [dataset(freshInput({ id: "dc:b" }), { coverage: { status: "NONE" }, geometry: { fit: "EXACT", positionalAccuracy: "DECLARED", valid: false } }), dataset(freshInput({ id: "dc:a", freshness: freshness("EXPIRED", 200) }))],
    });
    expect(outcome).toEqual([{ code: "DATASET_GEOMETRY_INVALID", inputId: "dc:b" }, { code: "DATA_EXPIRED", inputId: "dc:a" }, { code: "NO_COVERAGE", inputId: "dc:b" }]);
  });

  it("blocks the whole measurement when any one of its datasets is blocked", () => {
    expect(blocked({ datasets: [dataset(freshInput({ id: "dc:a" })), dataset(freshInput({ id: "dc:b" }), { coverage: { status: "NONE" } })] })).toEqual([{ code: "NO_COVERAGE", inputId: "dc:b" }]);
  });

  it("maps blockers to the status of the measurement: unknown coverage first, then unusable geometry, otherwise not available", () => {
    const status = (...codes: ConfidenceBlock["code"][]) => metricStatusForBlocks(codes.map((code) => ({ code, inputId: null })));
    expect(status("NO_COVERAGE")).toBe("NO_COVERAGE");
    expect(status("DATA_EXPIRED")).toBe("NOT_AVAILABLE");
    expect(status("DATASET_NOT_AVAILABLE")).toBe("NOT_AVAILABLE");
    expect(status("DATASET_GEOMETRY_INVALID")).toBe("NOT_COMPUTABLE");
    expect(status("NO_COVERAGE", "DATASET_GEOMETRY_INVALID")).toBe("NO_COVERAGE");
    expect(status("DATASET_GEOMETRY_INVALID", "DATA_EXPIRED")).toBe("NOT_COMPUTABLE");
    expect(status()).toBe("NOT_AVAILABLE");
  });
});

describe("arguments", () => {
  it.each([
    ["no requested roles", { requestedRoles: 0 }], ["a fractional number of roles", { requestedRoles: 1.5 }], ["a negative number of available roles", { availableRoles: -1 }],
    ["more available roles than requested", { availableRoles: 2 }], ["an instant that is not a date", { evaluatedAt: "soon" }],
  ])("rejects %s", (_name, change) => {
    expect(() => scoreSpatialConfidence(context(change))).toThrow(RangeError);
  });

  it.each([0, 1, 1.5, Number.NaN, -0.2])("rejects a partial coverage fraction of %s (use NONE or FULL at the ends)", (fraction) => {
    expect(() => scoreSpatialConfidence(context({ datasets: [dataset(freshInput(), { coverage: { status: "PARTIAL", fraction } })] }))).toThrow(RangeError);
  });

  it("does not modify what it is given and gives the same answer twice", () => {
    const input = context({ datasets: [dataset(makeUnregisteredSampleInput({ freshness: freshness("FRESH") }))], valueKind: "COUNT" });
    const before = structuredClone(input);
    const first = scoreSpatialConfidence(input);
    expect(input).toEqual(before);
    expect(scoreSpatialConfidence(input)).toEqual(first);
  });
});

describe("every combination keeps its promises", () => {
  const coverages: CoverageAssessment[] = [{ status: "FULL" }, { status: "PARTIAL", fraction: 0.5 }, { status: "UNDECLARED" }];
  const freshnesses = [freshness("FRESH"), freshness("FRESH", 45), freshness("STALE", 200), freshness("UNKNOWN")];
  const qualities: Array<EngineInput["quality"]> = [
    { status: "MEASURED", score: 0.8, method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" },
    { status: "INSUFFICIENT_DATA", method: "m", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "e" }, { status: "UNAVAILABLE" },
  ];
  const completenesses = ["INVENTORY", "SAMPLE", "UNKNOWN"] as const;
  const fits: GeometryFit[] = ["EXACT", "SUITABLE", "PROXY", "UNSUITABLE"];
  const texts: string[] = [];
  let combinations = 0;

  it("holds the score range, the caps, the self-checks and the wording for 1,728 combinations", () => {
    for (const coverage of coverages) for (const fresh of freshnesses) for (const quality of qualities) for (const completeness of completenesses) for (const unregistered of [false, true]) for (const fit of fits) for (const valueKind of ["DISTANCE", "COUNT"] as const) {
      const base = unregistered ? makeUnregisteredSampleInput({ completeness, quality, freshness: fresh as EngineInput["freshness"] }) : makeInput({ completeness, quality, freshness: fresh as EngineInput["freshness"] });
      const outcome = scoreSpatialConfidence(context({ datasets: [dataset(base, { coverage, geometry: { fit, positionalAccuracy: "UNDECLARED", valid: true } })], valueKind }));
      combinations += 1;
      expect(outcome.kind).toBe("SCORED");
      if (outcome.kind !== "SCORED") continue;
      const { breakdown } = outcome;
      expect(breakdown.score).toBeGreaterThanOrEqual(0);
      expect(breakdown.score).toBeLessThanOrEqual(100);
      expect(confidenceBreakdownSchema.safeParse(breakdown).success).toBe(true);
      expect(findBreakdownPolicyViolations(breakdown, spatialConfidencePolicy)).toEqual([]);
      if (valueKind === "COUNT" && completeness !== "INVENTORY") expect(["LOW", "INSUFFICIENT"]).toContain(breakdown.band);
      if (unregistered || quality.status !== "MEASURED") expect(["MEDIUM", "LOW", "INSUFFICIENT"]).toContain(breakdown.band);
      for (const gap of outcome.gaps) expect(gap.inputId).toBe(base.id);
      texts.push(...breakdown.factors.flatMap((factor) => [factor.explanation.ar, factor.explanation.en]), ...breakdown.caps.flatMap((cap) => [cap.reason.ar, cap.reason.en]));
    }
    expect(combinations).toBe(1728);
  });

  it("never judges, promises or prints a percentage in any explanation or cap reason it can produce", () => {
    expect(texts.length).toBeGreaterThan(1000);
    for (const value of new Set(texts)) {
      expect(value).not.toMatch(verdictEnglish);
      expect(value).not.toMatch(verdictArabic);
      expect(value).not.toMatch(/[%٪]/);
    }
    for (const factor of spatialConfidencePolicy.factors) { expect(factor.description.en).not.toMatch(verdictEnglish); expect(factor.description.ar).not.toMatch(verdictArabic); }
    for (const cap of spatialConfidencePolicy.caps) { expect(cap.appliesWhen.en).not.toMatch(verdictEnglish); expect(cap.appliesWhen.ar).not.toMatch(verdictArabic); }
  });

  it("offers no probability-like member anywhere in a breakdown", () => {
    const { breakdown } = scored();
    const keys = JSON.stringify(Object.keys(breakdown)) + JSON.stringify(breakdown.factors.map((factor) => Object.keys(factor)));
    expect(keys).not.toMatch(/probab|chance|likelihood|successRate/i);
  });
});
