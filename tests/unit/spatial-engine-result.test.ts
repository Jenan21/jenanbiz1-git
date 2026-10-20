import { describe, expect, it } from "vitest";
import { buildConfidenceBreakdown, buildRunRecord, createGap, deriveInputGaps, runRecordSchema, type EngineInput, type EngineMetric, type RunEnvelope } from "@/services/analysis-engines/shared";
import { scoreSpatialConfidence } from "@/services/analysis-engines/spatial/confidence";
import { compareAnalysisResults, findSpatialResultViolations, resultOrderKey, spatialResultSchema, type SpatialResult } from "@/services/analysis-engines/spatial/contracts";
import { spatialGapCatalog } from "@/services/analysis-engines/spatial/gaps";
import { evaluatedAt, makeUnregisteredSampleInput } from "./support/analysis-engine-fixtures";
import { baseRequest, cleanDataset, makeSpatialResult, resealSpatial, riyadh } from "./support/spatial-engine-fixtures";

const rules = (result: SpatialResult) => findSpatialResultViolations(result).filter((violation) => violation.code === "SPATIAL_RULE").map((violation) => violation.detail);
const codes = (result: SpatialResult) => findSpatialResultViolations(result).map((violation) => violation.code);

describe("a consistent Spatial result", () => {
  it("passes the schema unchanged and has no violation", () => {
    const result = makeSpatialResult();
    expect(spatialResultSchema.parse(result)).toEqual(result);
    expect(findSpatialResultViolations(result)).toEqual([]);
    expect(result.status).toBe("COMPLETED");
  });

  it("states the engine, the policy, what it computed with and what it leaves out", () => {
    const { engine } = makeSpatialResult();
    expect(engine).toMatchObject({ key: "spatial", contracts: { request: "jenan.spatial-analysis.request/v1", result: "jenan.spatial-analysis.result/v1" }, runtime: { backend: "NONE" } });
    expect(engine.policies.map((policy) => `${policy.id}@${policy.version}`)).toEqual(["spatial-confidence-v1@1.0.0"]);
    expect(engine.capabilities.excluded).toEqual(["ROUTE_TRAVEL_TIME", "DRIVING_DISTANCE", "TERRAIN", "GEOCODING", "AI_RECOMMENDATION", "BUSINESS_RECOMMENDATION"]);
  });

  it("refuses members that would turn facts into a verdict, a score or a link to a project", () => {
    for (const extra of [{ recommendation: "open the project" }, { verdict: "excellent" }, { successProbability: 0.87 }, { score: 91 }, { projectId: "p1" }, { mapReleaseId: "r1" }]) {
      expect(spatialResultSchema.safeParse({ ...makeSpatialResult(), ...extra }).success).toBe(false);
    }
  });

  it("applies the metric rules inside a result: a missing measurement cannot carry a number", () => {
    const result = makeSpatialResult();
    const metric = result.results[0]!.metrics[0]!;
    result.results[0]!.metrics = [{ ...metric, status: "NO_COVERAGE", platformState: "UNAVAILABLE" }];
    expect(spatialResultSchema.safeParse(resealSpatial(result)).success).toBe(false);
  });
});

describe("rules of the Spatial Engine", () => {
  it("requires the Spatial key and contracts", () => {
    const wrongKey = makeSpatialResult();
    wrongKey.engine.key = "market";
    expect(rules(wrongKey)).toEqual(["The engine key is spatial"]);
    const wrongContracts = makeSpatialResult();
    wrongContracts.engine.contracts.result = "jenan.market.result/v1";
    expect(rules(resealSpatial(wrongContracts))).toEqual(["The engine must name the Spatial request and result contracts"]);
  });

  it("allows only registered Map layers in production", () => {
    const result = makeSpatialResult();
    result.engine.environment = "production";
    expect(rules(resealSpatial(result))).toEqual(["Production reads registered Map layers only"]);
    const registeredOnly = makeSpatialResult({ environment: "production" });
    expect(registeredOnly.request.mapLayerPolicy).toBe("REGISTERED_ONLY");
    expect(findSpatialResultViolations(registeredOnly)).toEqual([]);
  });

  it("accepts a result for each requested analysis and target, in order, and no other", () => {
    const request = baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY"], candidates: [{ id: "site-a", location: riyadh }] });
    const result = makeSpatialResult({ request });
    const [first] = result.results;
    result.results = [
      { analysis: "LOCATION_CONTEXT", target: "primary", metrics: first!.metrics }, { analysis: "LOCATION_CONTEXT", target: "site-a", metrics: [] },
      { analysis: "PROXIMITY", target: "primary", metrics: [] }, { analysis: "PROXIMITY", target: "site-a", metrics: [] },
    ];
    expect(findSpatialResultViolations(resealSpatial(result))).toEqual([]);
  });

  it("allows only the Spatial analyses this engine version declares, so a result cannot claim an analysis it does not support", () => {
    const result = makeSpatialResult();
    result.engine.capabilities.analyses = ["LOCATION_CONTEXT"];
    expect(rules(resealSpatial(result))).toEqual(["PROXIMITY was requested but this engine version does not support it"]);
  });

  it.each([
    ["a duplicate result", (result: SpatialResult) => { result.results = [result.results[0]!, result.results[0]!]; }, "Duplicate result for PROXIMITY/primary"],
    ["an analysis that was not requested", (result: SpatialResult) => { result.results[0]!.analysis = "CATCHMENT"; }, "CATCHMENT was not requested"],
    ["a target that is not in the request", (result: SpatialResult) => { result.results[0]!.target = "site-x"; }, "Unknown target site-x"],
  ])("rejects %s", (_name, change, detail) => {
    const result = makeSpatialResult();
    change(result);
    expect(rules(resealSpatial(result))).toEqual([detail]);
  });

  it("rejects results that are not ordered by analysis, then the main location, then candidates", () => {
    const byAnalysis = makeSpatialResult({ request: baseRequest({ analyses: ["LOCATION_CONTEXT", "PROXIMITY"] }) });
    byAnalysis.results = [{ analysis: "PROXIMITY", target: "primary", metrics: [] }, { analysis: "LOCATION_CONTEXT", target: "primary", metrics: byAnalysis.results[0]!.metrics }];
    expect(rules(resealSpatial(byAnalysis))).toEqual(["Results must be ordered by analysis, then the main location, then candidates by id"]);
    const byTarget = makeSpatialResult({ request: baseRequest({ candidates: [{ id: "site-a", location: riyadh }] }) });
    byTarget.results = [{ analysis: "PROXIMITY", target: "site-a", metrics: [] }, { analysis: "PROXIMITY", target: "primary", metrics: byTarget.results[0]!.metrics }];
    expect(rules(resealSpatial(byTarget))).toEqual(["Results must be ordered by analysis, then the main location, then candidates by id"]);
  });

  it("orders results by analysis, the main location first, then candidates by id", () => {
    const sorted = [
      { analysis: "CATCHMENT" as const, target: "site-b" }, { analysis: "PROXIMITY" as const, target: "site-a" }, { analysis: "PROXIMITY" as const, target: "primary" }, { analysis: "LOCATION_CONTEXT" as const, target: "primary" }, { analysis: "PROXIMITY" as const, target: "alpha" },
    ].sort(compareAnalysisResults);
    expect(sorted.map((entry) => `${entry.analysis}/${entry.target}`)).toEqual(["LOCATION_CONTEXT/primary", "PROXIMITY/primary", "PROXIMITY/alpha", "PROXIMITY/site-a", "CATCHMENT/site-b"]);
    expect(resultOrderKey({ analysis: "PROXIMITY", target: "primary" })).toBe("01/0");
    expect(resultOrderKey({ analysis: "PROXIMITY", target: "alpha" })).toBe("01/1:alpha");
  });
});

describe("shared rules reach Spatial results", () => {
  it("reports the shared violations as problems of the schema, by code", () => {
    const overBudget = makeSpatialResult();
    overBudget.limits.costUnits = 5000;
    const parsed = spatialResultSchema.safeParse(resealSpatial(overBudget));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("COST_OVER_BUDGET");
    expect(codes(overBudget)).toEqual(["COST_OVER_BUDGET"]);
  });

  it("accepts the gaps of the Spatial catalog and refuses codes from nowhere", () => {
    const withRoadGap = makeSpatialResult({ extraGaps: [createGap(spatialGapCatalog, "ROAD_LABEL_POINTS_ONLY", { dataset: "Roads" }, { inputId: "dc:version-1" })] });
    expect(findSpatialResultViolations(withRoadGap)).toEqual([]);
    expect(withRoadGap.status).toBe("COMPLETED_WITH_GAPS");
    const unknown = makeSpatialResult();
    unknown.gaps = [...unknown.gaps, { code: "MARKET_ONLY_GAP", severity: "INFO", message: { ar: "نص", en: "text" }, remedy: { ar: "إجراء", en: "action" } }];
    expect(codes(resealSpatial(unknown))).toEqual(["GAP_CODE_UNKNOWN"]);
  });

  it("detects a confidence breakdown that does not come from the policy the engine declares", () => {
    const result = makeSpatialResult();
    result.engine.policies[0]!.thresholds.high = 80;
    expect(codes(resealSpatial(result))).toEqual(["BREAKDOWN_POLICY_MISMATCH"]);
  });
});

describe("sample data never reads as an inventory", () => {
  const sample: EngineInput = makeUnregisteredSampleInput({ freshness: { status: "FRESH", sourcePublishedAt: evaluatedAt, freshnessDays: 90, expiresAt: null } });
  const request = baseRequest({ analyses: ["CATCHMENT"], parameters: { roles: ["poi:hospital"], radiiMeters: [500] } });
  const outcome = scoreSpatialConfidence({
    datasets: [{ ...cleanDataset(sample), geometry: { fit: "SUITABLE", positionalAccuracy: "UNDECLARED", valid: true } }], requestedRoles: 1, availableRoles: 1, valueKind: "COUNT", estimated: false, fallbackApplied: false, evaluatedAt,
  });
  if (outcome.kind !== "SCORED") throw new Error("expected a score");
  const count = (over: Partial<EngineMetric> = {}): EngineMetric => ({
    key: "catchment.r500.count.poi:hospital", label: { ar: "عدد المستشفيات ضمن 500 م", en: "Hospitals within 500 m" }, status: "COMPUTED", platformState: "COMPUTED", valueKind: "COUNT", unit: "count", value: 3,
    interpretation: "MAPPED_FEATURES_ONLY", inputRefs: [sample.id], confidence: outcome.breakdown, limitations: [], ...over,
  });
  const build = (metric: EngineMetric, environment: "test" | "production" = "test") => makeSpatialResult({ request, inputs: [sample], metrics: [metric], extraGaps: outcome.gaps, environment });

  it("reports a count over an unregistered sample with every limitation and at most LOW confidence", () => {
    const result = build(count());
    expect(findSpatialResultViolations(result)).toEqual([]);
    expect(result.status).toBe("COMPLETED_WITH_GAPS");
    expect(result.rights.allowExport).toBe(false);
    expect(result.results[0]!.metrics[0]!.confidence?.band).toBe("LOW");
    expect(result.gaps.map((gap) => gap.code)).toEqual(expect.arrayContaining(["MAP_LAYER_UNREGISTERED", "COMPLETENESS_SAMPLE", "COUNT_IS_NOT_AN_INVENTORY", "QUALITY_UNAVAILABLE", "EXPORT_NOT_PERMITTED"]));
  });

  it("refuses to present nothing found in a sample as zero", () => {
    expect(codes(build(count({ value: 0 })))).toEqual(["COUNT_ZERO_FROM_SAMPLE"]);
    const notFound = count({ status: "NOT_FOUND_WITHIN_RADIUS", platformState: "UNAVAILABLE", value: null, confidence: null });
    expect(findSpatialResultViolations(build(notFound))).toEqual([]);
    expect(spatialResultSchema.safeParse(build(notFound)).success).toBe(true);
  });

  it("refuses a count that leaves out the not-an-inventory gap", () => {
    expect(codes(makeSpatialResult({ request, inputs: [sample], metrics: [count()] }))).toEqual(["COUNT_NOT_INVENTORY_UNGUARDED"]);
  });

  it("refuses a count whose confidence ignores the not-an-inventory cap, even when the breakdown is otherwise consistent", () => {
    const uncapped = buildConfidenceBreakdown({ id: "spatial-confidence-v1", version: "1.0.0", thresholds: { high: 75, medium: 50, low: 25 } }, outcome.breakdown.factors, []);
    expect(uncapped.band).toBe("MEDIUM");
    expect(codes(makeSpatialResult({ request, inputs: [sample], metrics: [count({ confidence: uncapped })], extraGaps: outcome.gaps }))).toEqual(["CONFIDENCE_ABOVE_CAP"]);
  });

  it("refuses an unregistered layer in a production result", () => {
    expect(codes(build(count(), "production"))).toContain("UNREGISTERED_INPUT_IN_PRODUCTION");
  });

  it("describes the same data as a documented fact, not a market size", () => {
    const metric = build(count()).results[0]!.metrics[0]!;
    expect(metric.interpretation).toBe("MAPPED_FEATURES_ONLY");
    expect(metric.platformState).toBe("COMPUTED");
    expect(deriveInputGaps(sample).map((gap) => gap.code)).toContain("COMPLETENESS_SAMPLE");
  });
});

describe("the shared run record serves the Spatial Engine", () => {
  it("stores a Spatial result with its request, hashes and inputs, ready to be checked later", () => {
    const result = makeSpatialResult();
    const record = buildRunRecord(result as unknown as RunEnvelope, { actor: { kind: "USER", id: "user-1" }, subject: null, createdAt: "2026-10-20T12:00:01.000Z" });
    expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({
      engineKey: "spatial", engineVersion: "1.0.0-m2", requestContract: "jenan.spatial-analysis.request/v1", resultContract: "jenan.spatial-analysis.result/v1", environment: "test", status: "COMPLETED",
      requestHash: result.determinism.requestHash, outputHash: result.determinism.outputHash, subject: null,
    });
    expect(record.inputs.map((row) => row.inputId)).toEqual(["dc:version-1"]);
    expect(record.runtime).toEqual({ backend: "NONE", placement: null, postgis: null, geos: null, proj: null });
  });

  it("gives the same output hash to the same analysis at the same instant, whatever the run id and timing", () => {
    const first = makeSpatialResult();
    const second = makeSpatialResult();
    second.runId = "run-2";
    second.timing = { startedAt: "2026-10-21T08:00:00.000Z", finishedAt: "2026-10-21T08:00:03.000Z", durationMs: 3000 };
    resealSpatial(second);
    expect(second.determinism).toEqual(first.determinism);
  });

  it("gives a different output hash when the evaluation instant differs, so freshness cannot be borrowed from another day", () => {
    const first = makeSpatialResult();
    const later = makeSpatialResult();
    later.evaluatedAt = "2026-11-20T12:00:00.000Z";
    resealSpatial(later);
    expect(later.determinism.outputHash).not.toBe(first.determinism.outputHash);
    expect(later.determinism.requestHash).toBe(first.determinism.requestHash);
  });
});
