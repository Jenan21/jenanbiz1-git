import { describe, expect, it } from "vitest";
import { compareText } from "@/services/analysis-engines/shared";
import { MapReadError } from "@/services/analysis-engines/spatial/map-read-error";
import { realDescription } from "./support/spatial-map-fixtures";
import {
  nearestPlace, nothingNearby, outsideLocate, riyadhLocate, unit, RIYADH_GOVERNORATE, RIYADH_REGION, PUBLISHED_RELEASE_ID,
} from "./support/spatial-fake-map-port";
import { contextRequest, expectNoVerdictsAndNoPercentages, gapCodes, gapsOf, metricsOf, resultOf, run, statuses } from "./support/spatial-run";
import { square } from "./support/spatial-request-fixtures";

const dubai = { type: "Point" as const, coordinates: [55.2708, 25.2048] as [number, number] };
const downtown = { type: "Polygon" as const, coordinates: [square(46.6, 24.6, 0.2)] };
const coast = { type: "Polygon" as const, coordinates: [square(39.0, 21.4, 0.3)] };

describe("LOCATION_CONTEXT in Riyadh", () => {
  it("states the country, region, governorate and nearest neighbourhood the Map holds for the location, each with its source and its limits", async () => {
    const { result, port } = run(contextRequest());
    const output = await result;
    expect(Object.keys(metricsOf(output))).toEqual([
      "context.country", "context.governorate", "context.governorate.boundary_distance", "context.place:neighbourhood.nearest.distance", "context.place:neighbourhood.nearest.name",
      "context.region", "context.region.boundary_distance", "context.within_boundary",
    ]);
    const m = metricsOf(output);
    expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: true, valueKind: "BOOLEAN" });
    expect(m["context.country"]).toMatchObject({ status: "COMPUTED", value: "SA", valueKind: "CATEGORICAL" });
    expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: RIYADH_REGION.label });
    expect(m["context.region.boundary_distance"]).toMatchObject({ status: "COMPUTED", value: 82_849.5, unit: "m", valueKind: "DISTANCE" });
    expect(m["context.governorate"]).toMatchObject({ status: "COMPUTED", value: RIYADH_GOVERNORATE.label });
    expect(m["context.governorate.boundary_distance"]).toMatchObject({ status: "COMPUTED", value: 6059.5, unit: "m" });
    expect(m["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "COMPUTED", value: 1236.2, unit: "m" });
    expect(m["context.place:neighbourhood.nearest.name"]).toMatchObject({ status: "COMPUTED", value: "الورود", valueKind: "TEXT" });
    for (const metric of Object.values(m)) {
      expect(metric.interpretation).toBe("MAPPED_FEATURES_ONLY");
      expect(metric.platformState).toBe("COMPUTED");
      expect(metric.confidence).not.toBeNull();
      expect(metric.inputRefs.length).toBeGreaterThan(0);
    }
    expect(port.calls.map((call) => call.method)).toEqual(["capabilities", "checkGeometries", "describeMap", "locate", "nearest"]);
  });

  it("grades confidence by the documented rules: stale 2017 boundaries are LOW, fresh places MEDIUM, and nothing reaches HIGH while quality is not measured", async () => {
    const m = metricsOf(await resultOf(contextRequest()));
    expect(["context.country", "context.region", "context.governorate", "context.within_boundary"].map((key) => m[key]?.confidence?.band)).toEqual(["LOW", "LOW", "LOW", "LOW"]);
    expect(m["context.place:neighbourhood.nearest.distance"]?.confidence?.band).toBe("MEDIUM");
    expect(m["context.region"]?.confidence).toMatchObject({ policyId: "spatial-confidence-v1", score: 43, kind: "EXPLAINABLE_HEURISTIC" });
    expect(m["context.place:neighbourhood.nearest.name"]?.confidence?.score).toBe(66);
    for (const metric of Object.values(m)) expect(metric.confidence?.caps.map((cap) => cap.code)).toContain("QUALITY_NOT_MEASURED");
  });

  it("reads every dataset from the published release and says what each limits", async () => {
    const output = await resultOf(contextRequest());
    expect(output.inputs.map((input) => input.id.split(":").pop())).toEqual(["boundary", "governorates", "places", "regions"]);
    expect(output.inputs.every((input) => input.governance === "MAP_REGISTERED" && input.licenseClass === null && !input.allowExport)).toBe(true);
    expect(output.dataAvailability.map((entry) => [entry.role, entry.status])).toEqual([
      ["admin:country", "AVAILABLE"], ["admin:governorate", "AVAILABLE"], ["admin:region", "AVAILABLE"], ["place:neighbourhood", "AVAILABLE"],
    ]);
    expect(metricsOf(output)["context.region"]?.limitations).toEqual([
      "Assigned from the polygons stored in the Map; their positional accuracy is not declared.", "Based on unofficial boundaries that no government authority issued.",
    ]);
    expect(metricsOf(output)["context.region.boundary_distance"]?.limitations).toContain("Straight-line distance on the Earth's surface, not a travel distance.");
  });

  it("reports the unofficial boundaries as a warning on every administrative dataset, and denies export until a license class is declared", async () => {
    const output = await resultOf(contextRequest());
    expect(gapsOf(output, "BOUNDARY_UNOFFICIAL").map((gap) => [gap.severity, gap.inputId?.split(":").pop()])).toEqual([["WARNING", "boundary"], ["WARNING", "governorates"], ["WARNING", "regions"]]);
    expect(gapCodes(output)).toEqual(expect.arrayContaining(["DATA_STALE", "LICENSE_CLASS_UNDECLARED", "EXPORT_NOT_PERMITTED", "COMPLETENESS_UNKNOWN", "QUALITY_UNAVAILABLE", "ATTRIBUTION_REQUIRED", "NETWORK_ANALYSIS_NOT_SUPPORTED"]));
    expect(gapsOf(output, "DATA_STALE").map((gap) => gap.inputId?.split(":").pop())).toEqual(["boundary", "governorates", "regions"]);
    expect(output.rights.allowExport).toBe(false);
    expect(output.status).toBe("COMPLETED_WITH_GAPS");
    expect(output.attribution.map((entry) => [entry.required, entry.inputIds.length])).toEqual([[true, 3], [true, 1]]);
  });

  it("states facts only: no verdicts, no probabilities, no percentages, in either language", async () => {
    expectNoVerdictsAndNoPercentages(await resultOf(contextRequest()));
  });

  it("asks the Map only what it needs, in the right order and with the engine's search rings", async () => {
    const { result, port } = run(contextRequest());
    await result;
    expect(port.callsOf("describeMap")[0]?.request).toEqual({ layers: ["regions", "governorates", "places"] });
    expect(port.callsOf("locate")[0]?.request).toMatchObject({ releaseId: PUBLISHED_RELEASE_ID, levels: ["regions", "governorates"] });
    expect(port.callsOf("nearest")[0]?.request).toMatchObject({ releaseId: PUBLISHED_RELEASE_ID, layerId: "places", kind: "neighbourhood", rings: [500, 1000, 3000, 5000], limit: 1 });
    expect(port.callsOf("checkGeometries")).toHaveLength(1);
  });

  it("without a place role produces only the administrative context, and searches for no place", async () => {
    const { result, port } = run(contextRequest({}, []));
    const output = await result;
    expect(Object.keys(metricsOf(output)).some((key) => key.includes("place"))).toBe(false);
    expect(port.callsOf("nearest")).toEqual([]);
    expect(port.callsOf("describeMap")[0]?.request).toEqual({ layers: ["regions", "governorates"] });
    expect(output.limits.costUnits).toBe(3);
  });

  it("reads the nearest place of any kind for the role `place`, and reports the kind it found", async () => {
    const { result, port } = run(contextRequest({}, ["place"]));
    const m = metricsOf(await result);
    expect(port.callsOf("nearest")[0]?.request).toMatchObject({ kind: null });
    expect(m["context.place.nearest.kind"]).toMatchObject({ status: "COMPUTED", value: "neighbourhood", valueKind: "CATEGORICAL" });
    expect(m["context.place.nearest.name"]?.value).toBe("الورود");
  });

  it("ignores roles that are not places: LOCATION_CONTEXT reads places only", async () => {
    const { result, port } = run(contextRequest({}, ["poi:hospital", "road:major", "place:locality"]));
    const m = metricsOf(await result);
    expect(Object.keys(m).filter((key) => key.includes("poi") || key.includes("road"))).toEqual([]);
    expect(Object.keys(m).some((key) => key.startsWith("context.place:locality"))).toBe(true);
    expect(port.callsOf("nearest")).toHaveLength(1);
  });

  it("honours the maximum search distance the request sets", async () => {
    const { result, port } = run(contextRequest({ parameters: { roles: ["place:neighbourhood"], maxSearchMeters: 1000 } }));
    await result;
    expect(port.callsOf("nearest")[0]?.request).toMatchObject({ rings: [500, 1000] });
  });
});

describe("LOCATION_CONTEXT outside the Map's coverage", () => {
  it("says so for Dubai: no country, region, governorate or place is stated, and not a single zero stands in for them", async () => {
    const { result, port } = run(contextRequest({ location: dubai }), { locate: outsideLocate() });
    const output = await result;
    const m = metricsOf(output);
    expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: false });
    for (const key of ["context.country", "context.region", "context.region.boundary_distance", "context.governorate", "context.governorate.boundary_distance", "context.place:neighbourhood.nearest.distance", "context.place:neighbourhood.nearest.name"]) {
      expect(m[key], key).toMatchObject({ status: "NO_COVERAGE", platformState: "UNAVAILABLE", value: null, confidence: null });
    }
    expect(port.callsOf("nearest")).toEqual([]);
    expect(output.status).toBe("COMPLETED_WITH_GAPS");
    expect(output.dataAvailability.map((entry) => [entry.role, entry.status])).toEqual([
      ["admin:country", "AVAILABLE"], ["admin:governorate", "NO_COVERAGE"], ["admin:region", "NO_COVERAGE"], ["place:neighbourhood", "NO_COVERAGE"],
    ]);
  });

  it("names the dataset and the target in the gap that explains each missing figure", async () => {
    const output = await resultOf(contextRequest({ location: dubai }), { locate: outsideLocate() });
    const gaps = gapsOf(output, "NO_COVERAGE");
    expect(gaps.length).toBeGreaterThanOrEqual(4);
    expect(gaps.every((gap) => gap.severity === "BLOCKING" && gap.inputId !== undefined && gap.subject?.startsWith("primary/"))).toBe(true);
    expect(gaps[0]?.message.en).toContain("outside the declared coverage");
    expectNoVerdictsAndNoPercentages(output);
  });
});

describe("LOCATION_CONTEXT near and on administrative boundaries", () => {
  const near = (edge: number | null) => riyadhLocate({
    levels: { regions: riyadhLocate().levels.regions as never, governorates: { units: [unit({ id: RIYADH_GOVERNORATE.id, label: RIYADH_GOVERNORATE.label, edgeDistanceMeters: edge })], truncated: false } },
  });

  it("flags a location 312 m from a governorate's edge, states the distance, and lowers the confidence of that assignment", async () => {
    const output = await resultOf(contextRequest(), { locate: near(312.4) });
    const m = metricsOf(output);
    expect(m["context.governorate"]).toMatchObject({ status: "COMPUTED", value: RIYADH_GOVERNORATE.label });
    expect(m["context.governorate.boundary_distance"]?.value).toBe(312.4);
    expect(gapsOf(output, "ADMIN_NEAR_BOUNDARY")).toHaveLength(1);
    expect(gapsOf(output, "ADMIN_NEAR_BOUNDARY")[0]).toMatchObject({ severity: "WARNING", subject: "primary/context.governorate" });
    expect(gapsOf(output, "ADMIN_NEAR_BOUNDARY")[0]?.message.en).toContain("312.4 m from the edge of “Riyadh”");
    expect(m["context.governorate"]?.confidence?.score).toBeLessThan(m["context.region"]?.confidence?.score as number);
    expect(m["context.governorate"]?.confidence?.factors.find((factor) => factor.key === "geometryFidelity")?.points).toBe(5);
    expect(m["context.region"]?.confidence?.factors.find((factor) => factor.key === "geometryFidelity")?.points).toBe(9);
  });

  it("draws the line at 1000 m: on the line is near, a tenth of a metre beyond is not", async () => {
    expect(gapsOf(await resultOf(contextRequest(), { locate: near(1000) }), "ADMIN_NEAR_BOUNDARY")).toHaveLength(1);
    expect(gapsOf(await resultOf(contextRequest(), { locate: near(1000.1) }), "ADMIN_NEAR_BOUNDARY")).toHaveLength(0);
    expect(gapsOf(await resultOf(contextRequest(), { locate: near(0) }), "ADMIN_NEAR_BOUNDARY")).toHaveLength(1);
  });

  it("does not state the distance, nor invent one, when it could not be measured, and treats the assignment as approximate", async () => {
    const output = await resultOf(contextRequest(), { locate: near(null) });
    const m = metricsOf(output);
    expect(m["context.governorate"]?.status).toBe("COMPUTED");
    expect(m["context.governorate.boundary_distance"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
    expect(gapsOf(output, "ADMIN_NEAR_BOUNDARY")).toHaveLength(0);
  });

  it("states no single unit for a location on a shared edge, lists the candidates, and does not choose between them", async () => {
    const alpha = unit({ id: "11111111-1111-4111-8111-111111111111", label: "Alpha", edgeDistanceMeters: 0 });
    const beta = unit({ id: "22222222-2222-4222-8222-222222222222", label: "Beta", edgeDistanceMeters: 0 });
    const output = await resultOf(contextRequest(), { locate: riyadhLocate({ levels: { regions: riyadhLocate().levels.regions as never, governorates: { units: [beta, alpha], truncated: false } } }) });
    const m = metricsOf(output);
    expect(m["context.governorate"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null, platformState: "UNAVAILABLE" });
    expect(m["context.governorate.boundary_distance"]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    expect(m["context.governorate.intersecting_units"]).toMatchObject({ status: "COMPUTED", value: "Alpha | Beta", valueKind: "TEXT" });
    expect(m["context.governorate.intersecting_units"]?.confidence?.factors.find((factor) => factor.key === "geometryFidelity")?.points).toBe(5);
    expect(gapsOf(output, "ADMIN_AMBIGUOUS_ON_BOUNDARY")[0]?.message.en).toContain("(Alpha | Beta)");
    expect(m["context.region"]?.status).toBe("COMPUTED");
  });

  it("says a polygon is missing, as a gap of the data, when the location is inside the mapped country but no unit covers it", async () => {
    const output = await resultOf(contextRequest(), { locate: riyadhLocate({ levels: { regions: riyadhLocate().levels.regions as never, governorates: { units: [], truncated: false } } }) });
    const m = metricsOf(output);
    expect(m["context.governorate"]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null, platformState: "UNAVAILABLE" });
    expect(m["context.governorate.boundary_distance"]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", value: null });
    expect(gapsOf(output, "ADMIN_UNIT_NOT_FOUND")).toHaveLength(1);
    expect(m["context.region"]?.status).toBe("COMPUTED");
  });

  it("keeps ten units a level and says the list was cut", async () => {
    const units = Array.from({ length: 10 }, (_, index) => unit({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, label: `Unit ${String(index).padStart(2, "0")}`, coversAnchor: index === 0, coversTarget: false, edgeDistanceMeters: index === 0 ? 0 : null }));
    const output = await resultOf(contextRequest({ location: downtown }, []), { locate: riyadhLocate({ levels: { regions: riyadhLocate().levels.regions as never, governorates: { units, truncated: true } } }) });
    expect(metricsOf(output)["context.governorate.intersecting_units"]?.value).toContain("Unit 09");
    expect(gapsOf(output, "RESULT_TRUNCATED")[0]).toMatchObject({ subject: "primary/context.governorate.intersecting_units" });
    expect(gapsOf(output, "RESULT_TRUNCATED")[0]?.message.en).toContain("(10)");
  });
});

describe("LOCATION_CONTEXT for an area", () => {
  it("states the unit for the area's representative point, whether the unit contains the whole area, and which other units it touches", async () => {
    const located = riyadhLocate({
      anchor: { longitude: 46.7, latitude: 24.7 },
      levels: {
        regions: { units: [unit({ edgeDistanceMeters: 69_004.9 })], truncated: false },
        governorates: { units: [unit({ id: RIYADH_GOVERNORATE.id, label: RIYADH_GOVERNORATE.label, coversTarget: false, edgeDistanceMeters: 0 }), unit({ id: "7daabba4-92d3-4a83-bbbe-ce9899d04879", label: "Ad Diriyah", coversAnchor: false, coversTarget: false, edgeDistanceMeters: null })], truncated: false },
      },
    });
    const output = await resultOf(contextRequest({ location: downtown }), { locate: located });
    const m = metricsOf(output);
    expect(m["context.region.contains_target"]).toMatchObject({ status: "COMPUTED", value: true, valueKind: "BOOLEAN" });
    expect(m["context.governorate"]?.value).toBe("Riyadh");
    expect(m["context.governorate.contains_target"]?.value).toBe(false);
    expect(m["context.governorate.boundary_distance"]?.value).toBe(0);
    expect(m["context.governorate.intersecting_units"]?.value).toBe("Ad Diriyah | Riyadh");
    expect(m["context.region.intersecting_units"]).toBeUndefined();
    expect(gapsOf(output, "ADMIN_TARGET_SPANS_UNITS")[0]).toMatchObject({ subject: "primary/context.governorate" });
    expect(gapsOf(output, "ADMIN_TARGET_SPANS_UNITS")[0]?.message.en).toContain("(Ad Diriyah | Riyadh)");
    expect(m["context.region"]?.limitations).toContain("For an area the unit is stated for its representative point (46.700000, 24.700000).");
    expect(gapsOf(output, "ADMIN_NEAR_BOUNDARY").map((gap) => gap.subject)).toEqual(["primary/context.governorate"]);
  });

  it("gives a point no area-only figures", async () => {
    expect(Object.keys(metricsOf(await resultOf(contextRequest()))).some((key) => key.endsWith("contains_target"))).toBe(false);
  });

  it("reports an area that is only partly inside the mapped country as partial, with the covered share driving the coverage points", async () => {
    const located = riyadhLocate({
      anchor: { longitude: 39.15, latitude: 21.55 }, coverage: { status: "PARTIAL", fraction: 0.564136 },
      levels: {
        regions: { units: [unit({ id: "75245a89-5764-431f-93db-c0701691ad38", label: "Makkah Region", coversTarget: false, edgeDistanceMeters: 0 })], truncated: false },
        governorates: { units: [unit({ id: "1f038214-4681-4ab1-943c-397b45dc6cfb", label: "Jiddah", coversTarget: false, edgeDistanceMeters: 0 }), unit({ id: "cb0f9115-e164-486f-ae73-fef8bb6d7e5a", label: "Al Jumum", coversAnchor: false, coversTarget: false, edgeDistanceMeters: null })], truncated: false },
      },
    });
    const output = await resultOf(contextRequest({ location: coast }), { locate: located });
    const m = metricsOf(output);
    expect(m["context.within_boundary"]).toMatchObject({ status: "COMPUTED", value: false });
    for (const key of ["context.country", "context.region", "context.region.boundary_distance", "context.region.contains_target", "context.governorate", "context.place:neighbourhood.nearest.distance"]) {
      expect(m[key]?.status, key).toBe("PARTIAL");
      expect(m[key]?.platformState).toBe("COMPUTED");
    }
    expect(m["context.region"]?.confidence?.factors.find((factor) => factor.key === "coverage")?.points).toBe(14);
    expect(m["context.governorate.intersecting_units"]?.value).toBe("Al Jumum | Jiddah");
    expect(gapsOf(output, "COVERAGE_PARTIAL").length).toBeGreaterThanOrEqual(3);
    expect(output.dataAvailability.every((entry) => entry.status === "AVAILABLE")).toBe(true);
  });
});

describe("LOCATION_CONTEXT places", () => {
  const place = (distance: number) => nearestPlace({ matches: [{ ...nearestPlace().matches[0]!, distanceMeters: distance }] });
  const placeKeys = ["context.place:neighbourhood.nearest.distance", "context.place:neighbourhood.nearest.name"];

  it("reports that nothing was found within the searched distance without turning that into a zero or a verdict", async () => {
    const output = await resultOf(contextRequest(), { nearest: nothingNearby(5000) });
    const m = metricsOf(output);
    for (const key of placeKeys) expect(m[key]).toMatchObject({ status: "NOT_FOUND_WITHIN_RADIUS", platformState: "UNAVAILABLE", value: null, confidence: null });
    expect(m[placeKeys[0] as string]?.limitations).toContain("Nothing mapped of this kind was found within 5000 m.");
    expect(m["context.region"]?.status).toBe("COMPUTED");
    expect(gapCodes(output)).toContain("COMPLETENESS_UNKNOWN");
  });

  it("does not answer when a feature of unknown kind is as near as the best match, or nearer, or when it is all there is", async () => {
    const cases: Array<[string, ReturnType<typeof nearestPlace>]> = [
      ["nearer than the match", nearestPlace({ matches: place(800).matches, unrecognized: { count: 2, nearestMeters: 300 } })],
      ["as near as the match", nearestPlace({ matches: place(800).matches, unrecognized: { count: 1, nearestMeters: 800 } })],
      ["with no match at all", { searchedMeters: 500, ringMeters: null, matches: [], unrecognized: { count: 3, nearestMeters: 120 } }],
    ];
    for (const [label, reply] of cases) {
      const output = await resultOf(contextRequest(), { nearest: reply });
      const m = metricsOf(output);
      for (const key of placeKeys) expect(m[key], `${label}: ${key}`).toMatchObject({ status: "NOT_COMPUTABLE", value: null, confidence: null });
      expect(gapsOf(output, "MAP_SOURCE_ID_UNRECOGNIZED")).toHaveLength(1);
      expect(gapsOf(output, "MAP_SOURCE_ID_UNRECOGNIZED")[0]).toMatchObject({ severity: "WARNING", subject: "primary/context.place:neighbourhood.nearest.distance" });
    }
    const message = gapsOf(await resultOf(contextRequest(), { nearest: nearestPlace({ unrecognized: { count: 2, nearestMeters: 10 } }) }), "MAP_SOURCE_ID_UNRECOGNIZED")[0]?.message.en;
    expect(message).toContain("2 features of");
  });

  it("answers when the feature of unknown kind is farther than the best match, because it cannot be nearer", async () => {
    const output = await resultOf(contextRequest(), { nearest: nearestPlace({ matches: place(800).matches, unrecognized: { count: 4, nearestMeters: 900 } }) });
    expect(metricsOf(output)[placeKeys[0] as string]).toMatchObject({ status: "COMPUTED", value: 800 });
    expect(gapsOf(output, "MAP_SOURCE_ID_UNRECOGNIZED")).toEqual([]);
  });

  it("keeps the rest of the context when the place search fails, and says the backend failed instead of guessing", async () => {
    const output = await resultOf(contextRequest(), { nearest: new MapReadError("TIMEOUT") });
    const m = metricsOf(output);
    for (const key of placeKeys) expect(m[key]).toMatchObject({ status: "NOT_COMPUTABLE", value: null });
    expect(m[placeKeys[0] as string]?.limitations).toContain("The spatial backend failed (TIMEOUT), so this figure was not computed.");
    expect(gapsOf(output, "BACKEND_UNAVAILABLE")).toHaveLength(1);
    expect(m["context.region"]?.status).toBe("COMPUTED");
    expect(m["context.country"]?.status).toBe("COMPUTED");
  });

  it("has no place data when the release lists no place layer, and names the role", async () => {
    const description = realDescription({ layers: realDescription().layers.filter((entry) => entry.id !== "places") });
    const output = await resultOf(contextRequest(), { describeMap: description });
    expect(metricsOf(output)[placeKeys[0] as string]).toMatchObject({ status: "NOT_AVAILABLE", value: null, inputRefs: [] });
    expect(gapsOf(output, "DATASET_NOT_AVAILABLE")[0]?.message.en).toContain("place:neighbourhood");
    expect(output.dataAvailability.find((entry) => entry.role === "place:neighbourhood")).toEqual({ role: "place:neighbourhood", status: "NOT_AVAILABLE", inputIds: [] });
  });
});

describe("LOCATION_CONTEXT when a level has no data", () => {
  it("has no governorate figures when the governorate layer is empty, asks the Map only about the levels it has, and keeps the region", async () => {
    const description = realDescription({ layers: realDescription().layers.map((entry) => (entry.id === "governorates" ? { ...entry, hasFeatures: false } : entry)) });
    const { result, port } = run(contextRequest(), { describeMap: description });
    const output = await result;
    const m = metricsOf(output);
    expect(m["context.governorate"]).toMatchObject({ status: "NOT_AVAILABLE", value: null, inputRefs: [] });
    expect(m["context.governorate.boundary_distance"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    expect(m["context.region"]?.status).toBe("COMPUTED");
    expect(port.callsOf("locate")[0]?.request).toMatchObject({ levels: ["regions"] });
    expect(gapsOf(output, "DATASET_NOT_AVAILABLE")[0]?.message.en).toContain("admin:governorate");
  });

  it("has no national boundary figures when the release holds no boundary, and still places the location in its regions", async () => {
    const output = await resultOf(contextRequest(), { describeMap: realDescription({ boundary: null }), locate: riyadhLocate({ coverage: null }) });
    const m = metricsOf(output);
    expect(m["context.within_boundary"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    expect(m["context.country"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    expect(m["context.region"]).toMatchObject({ status: "COMPUTED", value: RIYADH_REGION.label });
    expect(m["context.region"]?.confidence?.factors.find((factor) => factor.key === "coverage")?.points).toBe(0);
    expect(gapCodes(output)).toEqual(expect.arrayContaining(["COVERAGE_UNDECLARED", "BOUNDARY_UNOFFICIAL"]));
  });
});

describe("LOCATION_CONTEXT for several locations", () => {
  const request = () => contextRequest({ candidates: [{ id: "site-b", location: dubai }, { id: "site-a", location: { type: "Point", coordinates: [46.7, 24.7] } }] });
  const locateByTarget = (asked: { location: { type: string; coordinates: unknown } }) => (JSON.stringify(asked.location.coordinates) === JSON.stringify(dubai.coordinates) ? outsideLocate() : riyadhLocate());

  it("analyses the main location first and each candidate by id, each against the same data", async () => {
    const { result, port } = run(request(), { locate: (asked) => locateByTarget(asked as never) });
    const output = await result;
    expect(output.results.map((entry) => [entry.analysis, entry.target])).toEqual([["LOCATION_CONTEXT", "primary"], ["LOCATION_CONTEXT", "site-a"], ["LOCATION_CONTEXT", "site-b"]]);
    expect(statuses(output, "site-a")["context.region"]).toBe("COMPUTED");
    expect(statuses(output, "site-b")["context.region"]).toBe("NO_COVERAGE");
    expect(statuses(output, "primary")["context.region"]).toBe("COMPUTED");
    expect(port.callsOf("locate")).toHaveLength(3);
    expect(port.callsOf("checkGeometries")[0]?.request).toHaveLength(3);
    expect(output.inputs).toHaveLength(4);
  });

  it("says a role has no coverage only when every location lies outside it", async () => {
    const mixed = await resultOf(request(), { locate: (asked) => locateByTarget(asked as never) });
    expect(mixed.dataAvailability.find((entry) => entry.role === "admin:region")?.status).toBe("AVAILABLE");
    const allOutside = await resultOf(contextRequest({ location: dubai, candidates: [{ id: "site-a", location: dubai }] }), { locate: outsideLocate() });
    expect(allOutside.dataAvailability.find((entry) => entry.role === "admin:region")?.status).toBe("NO_COVERAGE");
  });

  it("names the location in the gaps it raises, so they cannot be confused", async () => {
    const output = await resultOf(request(), { locate: (asked) => locateByTarget(asked as never) });
    const subjects = gapsOf(output, "NO_COVERAGE").map((gap) => gap.subject?.split("/")[0]);
    expect(new Set(subjects)).toEqual(new Set(["site-b"]));
  });

  it("orders every metric by key so the same analysis always serializes the same way", async () => {
    const output = await resultOf(request(), { locate: (asked) => locateByTarget(asked as never) });
    for (const entry of output.results) expect(entry.metrics.map((metric) => metric.key)).toEqual(entry.metrics.map((metric) => metric.key).sort(compareText));
  });
});
