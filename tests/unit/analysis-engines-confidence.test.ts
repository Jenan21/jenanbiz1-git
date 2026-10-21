import { describe, expect, it } from "vitest";
import {
  bandForScore, bandThresholdsSchema, buildConfidenceBreakdown, confidenceBreakdownSchema, confidencePolicyDescriptorSchema, findBreakdownPolicyViolations, findConfidenceViolations,
  type ConfidenceBreakdown,
} from "@/services/analysis-engines/shared";
import { makeBreakdown, testPolicy } from "./support/analysis-engine-fixtures";

const thresholds = { high: 75, medium: 50, low: 25 };

describe("bandForScore", () => {
  it.each([[100, "HIGH"], [75, "HIGH"], [74, "MEDIUM"], [50, "MEDIUM"], [49, "LOW"], [25, "LOW"], [24, "INSUFFICIENT"], [0, "INSUFFICIENT"]])("score %s is %s", (score, band) => {
    expect(bandForScore(score, thresholds)).toBe(band);
  });

  it("requires strictly decreasing thresholds", () => {
    expect(bandThresholdsSchema.safeParse(thresholds).success).toBe(true);
    expect(bandThresholdsSchema.safeParse({ high: 50, medium: 50, low: 25 }).success).toBe(false);
    expect(bandThresholdsSchema.safeParse({ high: 75, medium: 30, low: 30 }).success).toBe(false);
    expect(bandThresholdsSchema.safeParse({ high: 75, medium: 50, low: 0 }).success).toBe(false);
  });
});

describe("buildConfidenceBreakdown", () => {
  it("builds a breakdown whose score, score band and band follow from its parts", () => {
    const breakdown = makeBreakdown([40, 30, 10]);
    expect(breakdown).toMatchObject({ policyId: "test-confidence-v1", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", score: 80, scoreBand: "HIGH", band: "HIGH", caps: [] });
    expect(findConfidenceViolations(breakdown)).toEqual([]);
    expect(confidenceBreakdownSchema.parse(breakdown)).toEqual(breakdown);
  });

  it("lets the weakest cap win over a higher score band", () => {
    expect(makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED"])).toMatchObject({ score: 100, scoreBand: "HIGH", band: "MEDIUM" });
    expect(makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED", "COUNT_IS_NOT_AN_INVENTORY"])).toMatchObject({ band: "LOW" });
  });

  it("never lets a cap raise the band", () => {
    expect(makeBreakdown([10, 10, 0], ["MAP_LAYER_UNREGISTERED"])).toMatchObject({ score: 20, scoreBand: "INSUFFICIENT", band: "INSUFFICIENT" });
    expect(makeBreakdown([20, 10, 5], ["MAP_LAYER_UNREGISTERED"])).toMatchObject({ score: 35, scoreBand: "LOW", band: "LOW" });
  });

  it("collapses duplicate caps and sorts them by code", () => {
    const breakdown = makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED", "COUNT_IS_NOT_AN_INVENTORY", "MAP_LAYER_UNREGISTERED"]);
    expect(breakdown.caps.map((cap) => cap.code)).toEqual(["COUNT_IS_NOT_AN_INVENTORY", "MAP_LAYER_UNREGISTERED"]);
  });

  it("copies its inputs instead of aliasing them", () => {
    const breakdown = makeBreakdown();
    expect(breakdown.thresholds).not.toBe(testPolicy.thresholds);
    expect(breakdown.thresholds).toEqual(testPolicy.thresholds);
  });
});

describe("confidence breakdown self-verification", () => {
  const tampered = (change: (draft: ConfidenceBreakdown) => void) => {
    const draft = structuredClone(makeBreakdown([40, 30, 10], ["MAP_LAYER_UNREGISTERED"]));
    change(draft);
    return draft;
  };

  it("accepts an honest breakdown", () => {
    expect(confidenceBreakdownSchema.safeParse(makeBreakdown([40, 30, 10], ["MAP_LAYER_UNREGISTERED"])).success).toBe(true);
  });

  it.each([
    ["a score that is not the sum of the factor points", (draft: ConfidenceBreakdown) => { draft.score = 99; }, "add up"],
    ["a band that ignores the caps", (draft: ConfidenceBreakdown) => { draft.band = "HIGH"; }, "band must be MEDIUM"],
    ["a score band that ignores the thresholds", (draft: ConfidenceBreakdown) => { draft.scoreBand = "LOW"; }, "scoreBand"],
    ["factor weights that do not total 100", (draft: ConfidenceBreakdown) => { draft.factors[0]!.maxPoints = 39; }, "not 100"],
    ["a factor above its maximum", (draft: ConfidenceBreakdown) => { draft.factors[0]!.points = 41; }, "exceed"],
    ["duplicate factor keys", (draft: ConfidenceBreakdown) => { draft.factors[1]!.key = "coverage"; }, "unique"],
    ["duplicate caps", (draft: ConfidenceBreakdown) => { draft.caps.push({ ...draft.caps[0]! }); }, "unique"],
  ])("rejects %s", (_name, change, fragment) => {
    const result = confidenceBreakdownSchema.safeParse(tampered(change));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(fragment);
  });

  it("rejects caps that are not sorted", () => {
    const draft = structuredClone(makeBreakdown([40, 30, 10], ["MAP_LAYER_UNREGISTERED", "COUNT_IS_NOT_AN_INVENTORY"]));
    draft.caps.reverse();
    expect(findConfidenceViolations(draft)).toContain("Caps must be sorted by code");
  });

  it("rejects a probability-style or unknown scale and kind", () => {
    expect(confidenceBreakdownSchema.safeParse({ ...makeBreakdown(), scale: "PERCENT" }).success).toBe(false);
    expect(confidenceBreakdownSchema.safeParse({ ...makeBreakdown(), kind: "PROBABILITY" }).success).toBe(false);
    expect(confidenceBreakdownSchema.safeParse({ ...makeBreakdown(), probability: 0.87 }).success).toBe(false);
  });
});

describe("confidence policy descriptor", () => {
  it("accepts a policy that states it is not a probability and whose weights total 100", () => {
    expect(confidencePolicyDescriptorSchema.parse(testPolicy)).toEqual(testPolicy);
  });

  it("refuses any policy that claims to be a probability", () => {
    expect(confidencePolicyDescriptorSchema.safeParse({ ...testPolicy, isProbability: true }).success).toBe(false);
  });

  it("rejects weights that do not total 100 and duplicate factor or cap keys", () => {
    const light = { ...testPolicy, factors: testPolicy.factors.map((factor, index) => (index === 0 ? { ...factor, maxPoints: 39 } : factor)) };
    expect(confidencePolicyDescriptorSchema.safeParse(light).success).toBe(false);
    const doubled = { ...testPolicy, factors: [testPolicy.factors[0]!, { ...testPolicy.factors[1]!, key: "coverage" }, testPolicy.factors[2]!] };
    expect(confidencePolicyDescriptorSchema.safeParse(doubled).success).toBe(false);
    const caps = { ...testPolicy, caps: [testPolicy.caps[0]!, { ...testPolicy.caps[1]!, code: testPolicy.caps[0]!.code }] };
    expect(confidencePolicyDescriptorSchema.safeParse(caps).success).toBe(false);
  });
});

describe("findBreakdownPolicyViolations", () => {
  it("accepts the breakdown its own policy produces", () => {
    expect(findBreakdownPolicyViolations(makeBreakdown([40, 30, 10], ["MAP_LAYER_UNREGISTERED"]), testPolicy)).toEqual([]);
  });

  it("detects another policy version, edited thresholds, edited weights and undeclared caps", () => {
    expect(findBreakdownPolicyViolations(makeBreakdown(), { ...testPolicy, version: "2.0.0" })).toContain("The breakdown does not belong to this policy version");
    expect(findBreakdownPolicyViolations(makeBreakdown(), { ...testPolicy, thresholds: { high: 80, medium: 50, low: 25 } })).toContain("The breakdown thresholds differ from the policy");
    const reweighted = { ...testPolicy, factors: [{ ...testPolicy.factors[0]!, maxPoints: 30 }, { ...testPolicy.factors[1]!, maxPoints: 40 }, testPolicy.factors[2]!] };
    expect(findBreakdownPolicyViolations(makeBreakdown(), reweighted)).toContain("The breakdown factors or weights differ from the policy");
    const noCaps = { ...testPolicy, caps: [] };
    expect(findBreakdownPolicyViolations(makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED"]), noCaps)).toContain("Cap MAP_LAYER_UNREGISTERED is not declared by the policy");
  });

  it("builds from a plain basis without a descriptor", () => {
    const breakdown = buildConfidenceBreakdown({ id: "x-confidence-v1", version: "1.0.0", thresholds }, [{ key: "only", maxPoints: 100, points: 100, inputId: null, explanation: { ar: "ن", en: "t" } }], []);
    expect(breakdown).toMatchObject({ score: 100, band: "HIGH" });
    expect(findConfidenceViolations(breakdown)).toEqual([]);
  });
});
