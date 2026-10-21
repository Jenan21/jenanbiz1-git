import { describe, expect, it, vi } from "vitest";
import { buildRunRecord, runRecordSchema, type EngineError } from "@/services/analysis-engines/shared";
import { runSpatialAnalysis, SPATIAL_ENGINE_VERSION, spatialExclusions } from "@/services/analysis-engines/spatial";
import { MapReadError, mapReadErrorKinds } from "@/services/analysis-engines/spatial/map-read-error";
import type { MapDescription } from "@/services/analysis-engines/spatial/map-contract";
import { osmProvenance, publishedRelease, realBoundary, realDescription, RELEASE_ID } from "./support/spatial-map-fixtures";
import { FakeMapPort, healthyCapabilities, nearestPlace, riyadhLocate, outsideLocate, unit, RIYADH_GOVERNORATE, type FakeBehaviour } from "./support/spatial-fake-map-port";
import { CLOCK, contextRequest, expectNoVerdictsAndNoPercentages, failureOf, gapCodes, gapsOf, metricsOf, resultOf, run, statuses } from "./support/spatial-run";
import { baseRequest, riyadh, square } from "./support/spatial-request-fixtures";

const OTHER_RELEASE = "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b";
const withPlacesBinding = (binding: { enabled: boolean; status: "ready" | "unavailable" | "warning"; visibility: string } | null): MapDescription =>
  realDescription({ layers: realDescription().layers.map((entry) => (entry.id === "places" ? { ...entry, binding } : entry)) });

describe("the engine's run: what it refuses before it reads anything", () => {
  it("rejects analyses outside the six implemented contracts before any read", async () => {
    const { port, result } = run({ ...baseRequest(), analyses: ["ROUTING"] });
    expect(await failureOf(result)).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(port.calls).toEqual([]);
  });

  it("refuses an invalid request with the contract's own error, before any query", async () => {
    const { port, result } = run({ contract: "wrong", analyses: [] });
    expect(await failureOf(result)).toMatchObject({ code: "INVALID_INPUT" });
    expect(port.calls).toEqual([]);
  });

  it("refuses a request whose cost is above the server's budget, and a caller cannot raise that budget", async () => {
    const { port, result } = run(contextRequest(), {}, { budgetUnits: 4 });
    expect(await failureOf(result)).toMatchObject({ code: "REQUEST_TOO_LARGE", status: 422 });
    expect(port.calls).toEqual([]);
    expect((await resultOf(contextRequest(), {}, { budgetUnits: 5 })).limits).toEqual({ costUnits: 5, budgetUnits: 5 });
  });

  it("refuses a Data Center selection for a place role, which this analysis reads from the Map, instead of silently using Map data in its place", async () => {
    for (const selection of [{ source: "DATA_CENTER", versionId: "dc-version-1" }, { source: "DATA_CENTER", typeKey: "geojson" }, { source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000Z" }]) {
      const { port, result } = run(contextRequest({ data: { roles: { "place:neighbourhood": selection } } }));
      expect(await failureOf(result)).toMatchObject({ code: "INVALID_INPUT", details: { reason: "data_center_pin_for_map_role", role: "place:neighbourhood" } });
      expect(port.calls).toEqual([]);
    }
  });

  it.each([
    ["a pin to a layer the role is not read from", { source: "MAP", layerKey: "pois" }, "map_pin_layer_mismatch"],
    ["a pin to something that is not a release id", { source: "MAP", layerKey: "places", releaseId: "latest" }, "map_pin_release_invalid"],
  ])("refuses %s", async (_label, selection, reason) => {
    const { port, result } = run(contextRequest({ data: { roles: { "place:neighbourhood": selection } } }));
    expect(await failureOf(result)).toMatchObject({ code: "INVALID_INPUT", details: { reason } });
    expect(port.calls).toEqual([]);
  });

  it("does not let a request pin the evaluation instant unless the caller is allowed to, and then uses it exactly", async () => {
    const pinned = contextRequest({ options: { evaluatedAt: "2026-06-01T00:00:00.000Z" } });
    expect(await failureOf(run(pinned).result)).toMatchObject({ code: "INVALID_INPUT" });
    const output = await resultOf(pinned, {}, { allowEvaluatedAtOverride: true });
    expect(output.evaluatedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(output.inputs.find((input) => input.id.endsWith(":places"))?.freshness).toMatchObject({ status: "FRESH" });
  });
});

describe("the engine's run: the spatial backend", () => {
  it.each(mapReadErrorKinds)("refuses to run, naming the reason %s and nothing else, when the backend cannot be probed", async (kind) => {
    const { port, result } = run(contextRequest(), { capabilities: new MapReadError(kind, "28P01") });
    const error = await failureOf(result);
    expect(error).toMatchObject({ code: "BACKEND_UNAVAILABLE", status: 503, details: { backend: "POSTGIS", reason: kind } });
    expect(JSON.stringify(error.details)).not.toMatch(/28P01|password|host/);
    expect(port.calls.map((call) => call.method)).toEqual(["capabilities"]);
  });

  it("reads an error that is not the adapter's as an unknown failure, and still says only that", async () => {
    const error = await failureOf(run(contextRequest(), { capabilities: new Error("connect ECONNREFUSED 10.0.0.5:5432 as jenan_reader") }).result);
    expect(error.details).toEqual({ backend: "POSTGIS", reason: "UNKNOWN" });
  });

  it("refuses to run against a Map whose tables are not what the engine's contract says, and says it is the contract", async () => {
    const problems = healthyCapabilities({ mapSchemaReachable: false, contractProblems: ["jenan_map.feature.sourceId is missing"] });
    const error = await failureOf(run(contextRequest(), { capabilities: problems }).result);
    expect(error.details).toEqual({ backend: "POSTGIS", reason: "MAP_CONTRACT_MISMATCH" });
    expect(JSON.stringify(error.details)).not.toContain("sourceId");
    const unreachable = await failureOf(run(contextRequest(), { capabilities: healthyCapabilities({ mapSchemaReachable: false }) }).result);
    expect(unreachable.details).toEqual({ backend: "POSTGIS", reason: "MAP_NOT_REACHABLE" });
  });

  it("refuses, in production, a role that could write to the Map, and in other environments only when asked", async () => {
    const writable = { capabilities: healthyCapabilities({ roleCanWrite: true }) };
    const refused = await failureOf(run(contextRequest(), writable, { environment: "production" }).result);
    expect(refused.details).toEqual({ backend: "POSTGIS", reason: "ROLE_CAN_WRITE" });
    expect((await resultOf(contextRequest(), writable)).status).toBe("COMPLETED_WITH_GAPS");
    expect(await failureOf(run(contextRequest(), writable, { requireReadOnlyRole: true }).result)).toMatchObject({ details: { reason: "ROLE_CAN_WRITE" } });
    expect((await resultOf(contextRequest(), writable, { environment: "production", requireReadOnlyRole: false })).engine.environment).toBe("production");
  });

  it("refuses to describe the Map when it cannot be read, as a backend failure", async () => {
    const error = await failureOf(run(contextRequest(), { describeMap: new MapReadError("SCHEMA_MISMATCH") }).result);
    expect(error).toMatchObject({ code: "BACKEND_UNAVAILABLE", details: { reason: "SCHEMA_MISMATCH" } });
  });

  it("refuses an invalid location, naming the one that failed and why, before it reads the Map", async () => {
    const looksFine = { type: "Polygon" as const, coordinates: [square(46.6, 24.6, 0.1)] }; // passes the request's own pre-check; the database then judges its validity
    const { port, result } = run(contextRequest({ candidates: [{ id: "site-a", location: riyadh }, { id: "site-b", location: looksFine }] }), {
      checkGeometries: (locations) => locations.map((_location, index) => (index === 2 ? { valid: false as const, reason: "Self-intersection[46.7 24.7]" } : { valid: true as const })),
    });
    const error = await failureOf(result);
    expect(error).toMatchObject({ code: "INVALID_INPUT", details: { reason: "invalid_geometry", target: "site-b", detail: "Self-intersection[46.7 24.7]" } });
    expect(port.calls.map((call) => call.method)).toEqual(["capabilities", "checkGeometries"]);
  });

  it("tells a geometry the database refused apart from a database that could not answer", async () => {
    expect(await failureOf(run(contextRequest(), { checkGeometries: new MapReadError("INVALID_GEOMETRY", "XX000") }).result)).toMatchObject({ code: "INVALID_INPUT", details: { reason: "invalid_geometry" } });
    expect(await failureOf(run(contextRequest(), { checkGeometries: new MapReadError("TIMEOUT") }).result)).toMatchObject({ code: "BACKEND_UNAVAILABLE", details: { reason: "TIMEOUT" } });
    expect(await failureOf(run(contextRequest(), { checkGeometries: [] }).result)).toMatchObject({ code: "CONTRACT_VIOLATION" });
  });

  it("keeps going when the Map fails while locating a place, and reports the failure instead of a guess", async () => {
    const output = await resultOf(contextRequest(), { locate: new MapReadError("TIMEOUT") });
    for (const [key, status] of Object.entries(statuses(output))) expect(status, key).toBe("NOT_COMPUTABLE");
    expect(Object.values(metricsOf(output)).every((metric) => metric.value === null && metric.confidence === null)).toBe(true);
    expect(gapsOf(output, "BACKEND_UNAVAILABLE").length).toBeGreaterThanOrEqual(4);
    expect(gapsOf(output, "BACKEND_UNAVAILABLE").every((gap) => gap.severity === "BLOCKING")).toBe(true);
    expect(metricsOf(output)["context.region"]?.limitations).toEqual(["The spatial backend failed (TIMEOUT), so this figure was not computed."]);
    expect(output.status).toBe("COMPLETED_WITH_GAPS");
    expect(output.dataAvailability.every((entry) => entry.status === "AVAILABLE")).toBe(true);
    const plain = await resultOf(contextRequest(), { locate: new Error("boom: password=hunter2") });
    expect(JSON.stringify(plain)).not.toMatch(/hunter2|boom/);
    expect(metricsOf(plain)["context.region"]?.limitations[0]).toContain("(UNKNOWN)");
  });

  it("isolates a failure to the location it happened for", async () => {
    let call = 0;
    const output = await resultOf(contextRequest({ candidates: [{ id: "site-a", location: riyadh }] }), { locate: () => (call++ === 0 ? riyadhLocate() : new MapReadError("TIMEOUT")) });
    expect(statuses(output, "primary")["context.region"]).toBe("COMPUTED");
    expect(statuses(output, "site-a")["context.region"]).toBe("NOT_COMPUTABLE");
  });

  it("uses only the read-only questions the port offers", async () => {
    const { port, result } = run(contextRequest({ candidates: [{ id: "site-a", location: riyadh }] }));
    await result;
    expect(new Set(port.calls.map((call) => call.method))).toEqual(new Set(["capabilities", "checkGeometries", "describeMap", "locate", "nearest"]));
    expect(Object.getOwnPropertyNames(FakeMapPort.prototype).filter((name) => !["constructor", "answer", "callsOf"].includes(name)).sort()).toEqual(["capabilities", "checkGeometries", "countFeatures", "describeMap", "locate", "measureDataset", "measureSpatial", "nearest"]);
  });
});

describe("the engine's run: the Map-layer policy", () => {
  const production = { environment: "production" as const };

  it("reads registered layers only in production, and says so in the result", async () => {
    const output = await resultOf(contextRequest(), {}, production);
    expect(output.engine.environment).toBe("production");
    expect(output.request.mapLayerPolicy).toBe("REGISTERED_ONLY");
    expect(output.inputs.every((input) => input.governance === "MAP_REGISTERED")).toBe(true);
    expect(gapCodes(output)).not.toContain("MAP_LAYER_UNREGISTERED");
  });

  it("refuses a production request for unregistered layers, with the policy's own error", async () => {
    const { port, result } = run(contextRequest({ mapLayerPolicy: "ALLOW_UNREGISTERED" }), {}, production);
    expect(await failureOf(result)).toMatchObject({ code: "MAP_LAYER_POLICY_VIOLATION", status: 403 });
    expect(port.calls).toEqual([]);
  });

  it("leaves an unregistered layer out of a production run, with no data for its role and no pretence", async () => {
    const output = await resultOf(contextRequest(), { describeMap: withPlacesBinding({ enabled: false, status: "ready", visibility: "public" }) }, production);
    expect(output.inputs.some((input) => input.governance === "MAP_UNREGISTERED" || input.id.endsWith(":places"))).toBe(false);
    expect(metricsOf(output)["context.place:neighbourhood.nearest.distance"]).toMatchObject({ status: "NOT_AVAILABLE", value: null });
    expect(gapCodes(output)).toEqual(expect.arrayContaining(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]));
    expect(statuses(output)["context.region"]).toBe("COMPUTED");
  });

  it("uses an unregistered layer outside production, labelled and with its confidence capped", async () => {
    const description = withPlacesBinding({ enabled: true, status: "unavailable", visibility: "public" });
    const output = await resultOf(contextRequest(), { describeMap: description });
    expect(output.request.mapLayerPolicy).toBe("ALLOW_UNREGISTERED");
    expect(output.inputs.find((input) => input.id.endsWith(":places"))?.governance).toBe("MAP_UNREGISTERED");
    expect(gapCodes(output)).toContain("MAP_LAYER_UNREGISTERED");
    const distance = metricsOf(output)["context.place:neighbourhood.nearest.distance"];
    expect(distance?.status).toBe("COMPUTED");
    expect(distance?.confidence?.caps.map((cap) => cap.code)).toContain("MAP_LAYER_UNREGISTERED");
    expect(["MEDIUM", "LOW"]).toContain(distance?.confidence?.band);
  });

  it("lets a development caller ask for the stricter policy", async () => {
    const output = await resultOf(contextRequest({ mapLayerPolicy: "REGISTERED_ONLY" }), { describeMap: withPlacesBinding({ enabled: false, status: "ready", visibility: "public" }) });
    expect(output.request.mapLayerPolicy).toBe("REGISTERED_ONLY");
    expect(metricsOf(output)["context.place:neighbourhood.nearest.distance"]?.status).toBe("NOT_AVAILABLE");
  });

  it("says the Map has nothing published, produces no figure, and makes no query for one", async () => {
    const off: MapDescription = { runtime: { status: "disabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] };
    const { port, result } = run(contextRequest(), { describeMap: off });
    const output = await result;
    expect(Object.values(statuses(output)).every((status) => status === "NOT_AVAILABLE")).toBe(true);
    expect(gapsOf(output, "MAP_NOT_PUBLISHED")[0]).toMatchObject({ severity: "BLOCKING" });
    expect(gapsOf(output, "MAP_NOT_PUBLISHED")[0]?.message.en).toContain("(state: disabled)");
    expect(output.inputs).toEqual([]);
    expect(output.dataAvailability.every((entry) => entry.status === "NOT_AVAILABLE" && entry.inputIds.length === 0)).toBe(true);
    expect(port.callsOf("locate")).toEqual([]);
    expect(port.callsOf("nearest")).toEqual([]);
    expect(output.status).toBe("COMPLETED_WITH_GAPS");
  });
});

describe("the engine's run: export is never allowed by the absence of inputs", () => {
  const noInputs = { allowExport: false, denials: [{ reason: "NO_INPUTS" }] };
  const unreviewed = (): MapDescription => {
    const description = realDescription();
    return { ...description, boundary: { ...realBoundary(), provenance: null }, layers: description.layers.map((layer) => ({ ...layer, provenance: null })) };
  };
  const notPublished = (state: "disabled" | "maintenance" | "none"): MapDescription => (state === "none"
    ? { runtime: { status: "enabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] }
    : { runtime: { status: state, publishedReleaseId: null }, release: null, boundary: null, layers: [] });

  it.each(["disabled", "maintenance", "none"] as const)("denies export when the Map has nothing published (%s)", async (state) => {
    const output = await resultOf(contextRequest(), { describeMap: notPublished(state) });
    expect(output.inputs).toEqual([]);
    expect(output.rights).toEqual(noInputs);
    expect(gapsOf(output, "MAP_NOT_PUBLISHED")).toHaveLength(1);
    expect(output.attribution).toEqual([]);
  });

  it("denies export when no input is usable: in production, a Map whose layers are all unregistered gives the run nothing to stand on", async () => {
    const output = await resultOf(contextRequest(), { describeMap: unreviewed() }, { environment: "production" });
    expect(output.inputs).toEqual([]);
    expect(output.rights).toEqual(noInputs);
    expect(gapCodes(output)).toEqual(expect.arrayContaining(["UNREGISTERED_LAYERS_EXCLUDED", "DATASET_NOT_AVAILABLE"]));
    expect(Object.values(statuses(output)).every((status) => status === "NOT_AVAILABLE")).toBe(true);
  });

  it("denies export when the target is outside the Map's coverage, because of the inputs it did use and not because there are none", async () => {
    const output = await resultOf(contextRequest(), { locate: outsideLocate() });
    expect(output.inputs.length).toBeGreaterThan(0);
    expect(statuses(output)["context.within_boundary"]).toBe("COMPUTED");
    expect(output.dataAvailability.filter((entry) => entry.status === "NO_COVERAGE").length).toBeGreaterThan(0);
    expect(output.rights.allowExport).toBe(false);
    expect(output.rights.denials.length).toBeGreaterThan(0);
    expect(output.rights.denials.every((denial) => "inputId" in denial)).toBe(true);
  });

  it("denies export when the target is outside the coverage and the Map is not published either", async () => {
    const output = await resultOf(contextRequest(), { describeMap: notPublished("disabled"), locate: outsideLocate() });
    expect(output.rights).toEqual(noInputs);
  });

  it("gives every result a right to export that follows from its inputs, so a run is never exportable on an empty list", async () => {
    const situations: Array<[string, FakeBehaviour, { environment: "test" | "production" }?]> = [
      ["interior", {}], ["outside", { locate: outsideLocate() }], ["not published", { describeMap: notPublished("disabled") }],
      ["nothing registered", { describeMap: unreviewed() }, { environment: "production" }], ["no place found", { nearest: nearestPlace({ matches: [], ringMeters: null }) }],
    ];
    for (const [label, behaviour, options] of situations) {
      const output = await resultOf(contextRequest(), behaviour, options);
      expect(output.rights.allowExport, label).toBe(false);
      expect(output.rights.denials.length, label).toBeGreaterThan(0);
      expect(output.rights.denials.some((denial) => denial.reason === "NO_INPUTS"), label).toBe(output.inputs.length === 0);
    }
  });

  it("is accepted by the shared run record when it has no input, so the run can still be stored and replayed", async () => {
    const output = await resultOf(contextRequest(), { describeMap: notPublished("disabled") });
    const record = buildRunRecord(output, { actor: { kind: "SYSTEM", id: null }, createdAt: CLOCK });
    expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record.inputs).toEqual([]);
  });
});

describe("the engine's run: pinned Map releases", () => {
  const pinnedDescription = (): MapDescription => ({
    runtime: realDescription().runtime, release: { ...publishedRelease, id: OTHER_RELEASE, version: "candidate-1", status: "Ready", publishedAt: null }, boundary: realBoundary(),
    layers: [{ id: "places", provenance: osmProvenance, binding: null, hasFeatures: true }],
  });
  const behaviour = (): FakeBehaviour => ({
    describeMap: (request) => (request.releaseId === OTHER_RELEASE ? pinnedDescription() : { ...realDescription(), layers: request.layers.map((id) => realDescription().layers.find((entry) => entry.id === id) ?? { id, provenance: null, binding: null, hasFeatures: false }) }),
  });
  const pinTo = (releaseId?: string) => contextRequest({ data: { roles: { "place:neighbourhood": { source: "MAP", layerKey: "places", ...(releaseId ? { releaseId } : {}) } } } });

  it("reads a pinned release for the role's places, labels it unregistered, and keeps it apart from the published release", async () => {
    const { port, result } = run(pinTo(OTHER_RELEASE), behaviour());
    const output = await result;
    expect(port.callsOf("describeMap").map((call) => call.request)).toEqual([{ layers: ["governorates", "places", "regions"] }, { releaseId: OTHER_RELEASE, layers: ["places"] }]);
    expect(port.callsOf("nearest")[0]?.request).toMatchObject({ releaseId: OTHER_RELEASE });
    expect(output.inputs.map((input) => input.id.split(":").slice(1).join(":"))).toEqual(
      [`${RELEASE_ID}:boundary`, `${RELEASE_ID}:governorates`, `${OTHER_RELEASE}:places`, `${RELEASE_ID}:regions`].sort(),
    );
    expect(output.inputs.find((input) => input.id.includes(OTHER_RELEASE))?.governance).toBe("MAP_UNREGISTERED");
    expect(gapCodes(output)).toContain("MAP_LAYER_UNREGISTERED");
    expect(metricsOf(output)["context.region"]?.inputRefs.every((id) => !id.includes(OTHER_RELEASE))).toBe(true);
    // The place the figures name belongs to the release they were read from, not to the published one.
    const reference = metricsOf(output)["context.place:neighbourhood.nearest.feature_ref"];
    expect(reference?.value).toBe(`map:${OTHER_RELEASE}:feature:579dc30f-2d09-4994-a33e-bdf671781853`);
    expect(reference?.inputRefs).toContain(`map:${OTHER_RELEASE}:places`);
  });

  it("excludes a pinned unpublished release in production", async () => {
    const output = await resultOf(pinTo(OTHER_RELEASE), behaviour(), { environment: "production" });
    expect(metricsOf(output)["context.place:neighbourhood.nearest.distance"]?.status).toBe("NOT_AVAILABLE");
    expect(output.inputs.every((input) => !input.id.includes(OTHER_RELEASE))).toBe(true);
    expect(gapCodes(output)).toContain("UNREGISTERED_LAYERS_EXCLUDED");
  });

  it("treats a pin to the published release, or to the layer without a release, as no pin at all", async () => {
    for (const request of [pinTo(RELEASE_ID), pinTo()]) {
      const { port, result } = run(request, behaviour());
      const output = await result;
      expect(port.callsOf("nearest")[0]?.request).toMatchObject({ releaseId: RELEASE_ID });
      expect(output.inputs.filter((input) => input.id.endsWith(":places"))).toHaveLength(1);
      expect(output.inputs.every((input) => input.governance === "MAP_REGISTERED")).toBe(true);
    }
  });

  it("has no place data for a release that does not exist, and says which role lacks it", async () => {
    const output = await resultOf(pinTo(OTHER_RELEASE), { describeMap: (request) => (request.releaseId === OTHER_RELEASE ? { runtime: null, release: null, boundary: null, layers: [] } : realDescription()) });
    expect(metricsOf(output)["context.place:neighbourhood.nearest.distance"]?.status).toBe("NOT_AVAILABLE");
    expect(gapsOf(output, "DATASET_NOT_AVAILABLE")[0]?.message.en).toContain("place:neighbourhood");
  });

  it("ignores a pin for a role LOCATION_CONTEXT does not read", async () => {
    const request = contextRequest({ data: { roles: { "poi:hospital": { source: "MAP", layerKey: "pois" } } } }, ["place:neighbourhood", "poi:hospital"]);
    const { port, result } = run(request, behaviour());
    await result;
    expect(port.callsOf("describeMap")).toHaveLength(1);
  });

  it("neither reads nor lists a Data Center selection for a role it does not read: the figures and the inputs are those of the same request without it", async () => {
    const roles = ["place:neighbourhood", "poi:hospital"];
    const plain = await resultOf(contextRequest({}, roles), behaviour());
    for (const selection of [{ source: "DATA_CENTER", versionId: "dc-version-1" }, { source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" }]) {
      const { port, result } = run(contextRequest({ data: { roles: { "poi:hospital": selection } } }, roles), behaviour());
      const output = await result;
      expect(output.results).toEqual(plain.results);
      expect(output.inputs).toEqual(plain.inputs);
      expect(output.gaps).toEqual(plain.gaps);
      expect(output.inputs.some((input) => input.ref.system === "DATA_CENTER")).toBe(false);
      expect(port.callsOf("describeMap")).toHaveLength(1);
      // The selection is part of the request the run answered, so it is part of what was hashed.
      expect(output.request.normalized.data.roles["poi:hospital"]).toMatchObject({ source: "DATA_CENTER" });
      expect(output.determinism.requestHash).not.toBe(plain.determinism.requestHash);
    }
  });
});

describe("the engine's run: the result it returns", () => {
  it("identifies itself, names the backend it used, and lists what it leaves out", async () => {
    const output = await resultOf(contextRequest());
    expect(output).toMatchObject({
      contract: "jenan.spatial-analysis.result/v1", runId: "run-1", evaluatedAt: CLOCK,
      engine: {
        key: "spatial", version: SPATIAL_ENGINE_VERSION, environment: "test",
        runtime: { backend: "POSTGIS", placement: "DEDICATED_CONNECTION", postgis: "3.5.2", geos: "3.9.0-CAPI-1.16.2", proj: "7.2.1" },
        capabilities: { analyses: ["LOCATION_CONTEXT", "PROXIMITY", "CATCHMENT", "DENSITY", "CONSTRAINT_SCREENING", "SITE_COMPARISON"], excluded: [...spatialExclusions] },
      },
      request: { mapLayerPolicy: "ALLOW_UNREGISTERED", normalized: { analyses: ["LOCATION_CONTEXT"], parameters: { roles: ["place:neighbourhood"], maxSearchMeters: 5000 } } },
      limits: { costUnits: 5, budgetUnits: 1000 },
    });
    expect(output.engine.policies.map((policy) => policy.id)).toEqual(["spatial-confidence-v1"]);
    expect(output.request.defaultsApplied).toContain("parameters.radiiMeters");
  });

  it("takes its time and its run id from what it is given, and from nowhere else", async () => {
    let ticks = 0;
    const clock = vi.fn(() => new Date(Date.parse(CLOCK) + 250 * ticks++));
    const output = await runSpatialAnalysis(new FakeMapPort(), contextRequest(), { environment: "test", clock, newRunId: () => "run-injected" });
    expect(clock).toHaveBeenCalledTimes(3);
    expect(output.runId).toBe("run-injected");
    expect(output.timing).toEqual({ startedAt: "2026-10-20T12:00:00.000Z", finishedAt: "2026-10-20T12:00:00.500Z", durationMs: 500 });
    expect(output.evaluatedAt).toBe("2026-10-20T12:00:00.250Z");
  });

  it("is reproducible: the same request against the same data gives the same hashes and the same result, whatever the run id", async () => {
    const first = await resultOf(contextRequest());
    const second = await runSpatialAnalysis(new FakeMapPort(), contextRequest(), { environment: "test", clock: () => new Date(CLOCK), newRunId: () => "run-2" });
    expect(second.determinism).toEqual(first.determinism);
    expect({ ...second, runId: "" }).toEqual({ ...first, runId: "" });
  });

  it("does not change its hashes for a request written differently but meaning the same, nor for a request id", async () => {
    const reference = (await resultOf(contextRequest({}, ["place:neighbourhood", "place:locality"]))).determinism;
    expect((await resultOf(contextRequest({}, ["place:locality", "place:neighbourhood"]))).determinism).toEqual(reference);
    expect((await resultOf(contextRequest({ options: { requestId: "abc-123" } }, ["place:locality", "place:neighbourhood"]))).determinism).toEqual(reference);
  });

  it("changes its hashes when the question or the data changes", async () => {
    const base = (await resultOf(contextRequest())).determinism;
    const elsewhere = (await resultOf(contextRequest({ location: { type: "Point", coordinates: [46.7, 24.7] } }))).determinism;
    expect(elsewhere.requestHash).not.toBe(base.requestHash);
    expect(elsewhere.outputHash).not.toBe(base.outputHash);
    expect(elsewhere.inputsHash).toBe(base.inputsHash);
    const otherNumbers = (await resultOf(contextRequest(), { nearest: nearestPlace({ matches: [{ ...nearestPlace().matches[0]!, distanceMeters: 1300 }] }) })).determinism;
    expect(otherNumbers.requestHash).toBe(base.requestHash);
    expect(otherNumbers.outputHash).not.toBe(base.outputHash);
    const later = await runSpatialAnalysis(new FakeMapPort(), contextRequest(), { environment: "test", clock: () => new Date("2028-01-01T00:00:00.000Z"), newRunId: () => "run-3" });
    expect(later.determinism.inputsHash).not.toBe(base.inputsHash);
  });

  it("is accepted by the shared run record, so every run can be stored append-only and replayed", async () => {
    const output = await resultOf(contextRequest());
    const record = buildRunRecord(output, { actor: { kind: "SYSTEM", id: null }, createdAt: CLOCK });
    expect(runRecordSchema.parse(record)).toEqual(record);
    expect(record).toMatchObject({ engineKey: "spatial", engineVersion: SPATIAL_ENGINE_VERSION, status: "COMPLETED_WITH_GAPS", outputHash: output.determinism.outputHash });
    expect(record.inputs).toHaveLength(4);
    expect(record.inputs.every((row) => row.refSystem === "JENAN_MAP" && row.snapshot.licenseClass === null)).toBe(true);
    expect(record.confidence?.metricCount).toBe(9);
  });

  it("fails closed, as a defect, instead of returning a result that breaks its own contract", async () => {
    const empty = { locate: riyadhLocate({ levels: { regions: { units: [unit({ label: "" })], truncated: false }, governorates: riyadhLocate().levels.governorates as never } }) };
    const error: EngineError = await failureOf(run(contextRequest(), empty).result);
    expect(error).toMatchObject({ code: "CONTRACT_VIOLATION", status: 500, details: { reason: "result_invalid" } });
    expect(String(error.details.first).length).toBeLessThanOrEqual(300);
  });

  it("never states a figure without saying what it rests on, whatever the situation", async () => {
    const situations: Array<[string, FakeBehaviour]> = [
      ["interior", {}], ["outside", { locate: outsideLocate() }], ["no place found", { nearest: nearestPlace({ matches: [], ringMeters: null }) }],
      ["near an edge", { locate: riyadhLocate({ levels: { regions: riyadhLocate().levels.regions as never, governorates: { units: [unit({ id: RIYADH_GOVERNORATE.id, label: "Riyadh", edgeDistanceMeters: 50 })], truncated: false } } }) }],
    ];
    for (const [label, behaviour] of situations) {
      const output = await resultOf(contextRequest(), behaviour);
      for (const metric of Object.values(metricsOf(output))) {
        const valued = metric.value !== null;
        expect(["COMPUTED", "PARTIAL", "ESTIMATED"].includes(metric.status), `${label} ${metric.key}`).toBe(valued);
        expect(metric.confidence !== null, `${label} ${metric.key}`).toBe(valued);
        expect(metric.interpretation).toBe("MAPPED_FEATURES_ONLY");
        if (!valued) expect(metric.platformState).toBe("UNAVAILABLE");
      }
      expectNoVerdictsAndNoPercentages(output);
    }
  });
});
