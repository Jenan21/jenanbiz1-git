import { describe, expect, it } from "vitest";
import { deriveInputGaps, engineInputSchema, gapSchema } from "@/services/analysis-engines/shared";
import { DataCenterProviderError } from "@/services/analysis-engines/spatial/data-center-port";
import { MAX_DATASET_FEATURES } from "@/services/analysis-engines/spatial/dataset-features";
import { dataSourceRequestsOf, resolveSpatialDataSources, type DataSourceRequest } from "@/services/analysis-engines/spatial/data-sources";
import { normalizeSpatialRequest } from "@/services/analysis-engines/spatial/normalize";
import { buildDataCenterUsageIntents } from "@/services/analysis-engines/spatial/usage-intents";
import {
  DC_OTHER_SHA, DC_OTHER_VERSION_ID, DC_SHA, DC_VERSION_ID, emptyDiscovery, FakeDataCenterPort, foundDiscovery, geoFeature, geoFeatures, makeReference, okContent, type FakeDataCenterBehaviour,
} from "./support/spatial-fake-dc-port";
import { baseRequest } from "./support/spatial-request-fixtures";

const EVALUATED_AT = "2026-10-20T12:00:00.000Z";
const exact = (role = "poi:hospital", versionId = DC_VERSION_ID): DataSourceRequest => ({ role, selection: { kind: "EXACT", versionId } });
const byType = (role = "poi:hospital", over: { asOf?: string } = {}): DataSourceRequest => ({ role, selection: { kind: "BY_TYPE", typeKey: "geojson", ...over } });
const resolve = (requests: DataSourceRequest[], behaviour: FakeDataCenterBehaviour = {}) => {
  const port = new FakeDataCenterPort(behaviour);
  return { port, result: resolveSpatialDataSources({ requests, port, evaluatedAt: EVALUATED_AT }) };
};
const gapCodes = (gaps: Array<{ code: string }>) => gaps.map((gap) => gap.code);

describe("an exact Data Center pin", () => {
  it("is resolved to an input with the Data Center's own statements, the validated features, and how it was selected", async () => {
    const { port, result } = resolve([exact()]);
    const { sources, inputs, gaps } = await result;
    expect(sources).toHaveLength(1);
    const source = sources[0]!;
    expect(source.status).toBe("RESOLVED");
    if (source.status !== "RESOLVED") return;
    expect(source.input).toMatchObject({ id: `dc:${DC_VERSION_ID}`, kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED", roles: ["poi:hospital"], checksum: { algorithm: "SHA-256", value: DC_SHA }, completeness: "UNKNOWN" });
    expect(engineInputSchema.safeParse(source.input).success).toBe(true);
    expect(source.features).toHaveLength(3);
    expect(source.features.map((feature) => feature.index)).toEqual([0, 1, 2]);
    expect(source.trace).toEqual({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, discoveryStatus: "FOUND", selectedVersionId: DC_VERSION_ID, candidateVersionIds: [DC_VERSION_ID], candidatesTruncated: false, notInForce: [] });
    expect(inputs).toEqual([source.input]);
    expect(gaps).toEqual([]);
    // Asked once for the version, then once for its content, pinned to the checksum discovery reported.
    expect(port.calls).toEqual([
      { method: "discover", request: { kind: "EXACT", versionId: DC_VERSION_ID } },
      { method: "readContent", request: { versionId: DC_VERSION_ID, expectedChecksum: DC_SHA } },
    ]);
  });

  it("is used as given or not at all: a version that cannot be used is reported and nothing is chosen in its place", async () => {
    const { port, result } = resolve([exact()], { discover: emptyDiscovery("NOT_AVAILABLE", { mode: "EXACT", policy: "exact-version", asOf: null }) });
    const { sources, inputs, gaps } = await result;
    expect(sources[0]).toMatchObject({ status: "NOT_AVAILABLE", role: "poi:hospital" });
    expect(inputs).toEqual([]);
    expect(gaps.map((gap) => [gap.code, gap.severity, gap.subject])).toEqual([["DATASET_NOT_AVAILABLE", "BLOCKING", "poi:hospital"]]);
    expect(port.callsOf("readContent")).toEqual([]);
  });

  it("does not accept another version in place of the one pinned, whatever the port answers", async () => {
    // Discovery names a different version than the pin.
    const { port, result } = resolve([exact()], { discover: foundDiscovery(makeReference({ version: { versionId: DC_OTHER_VERSION_ID } })) });
    expect((await result).sources[0]).toMatchObject({ status: "NOT_AVAILABLE" });
    expect(port.callsOf("readContent")).toEqual([]);
    // The read answers with another version.
    const swapped = await resolve([exact()], { readContent: okContent(makeReference({ version: { versionId: DC_OTHER_VERSION_ID } })) }).result;
    expect(swapped.sources[0]).toMatchObject({ status: "PIN_CONTENT_CHANGED" });
    expect(gapCodes(swapped.gaps)).toEqual(["DATA_CENTER_PIN_CHANGED"]);
    expect(swapped.inputs).toEqual([]);
  });

  it("does not accept content whose checksum is not the one discovery reported", async () => {
    const changed = await resolve([exact()], { readContent: okContent(makeReference(), geoFeatures(), { checksum: DC_OTHER_SHA }) }).result;
    expect(changed.sources[0]).toMatchObject({ status: "PIN_CONTENT_CHANGED" });
    const inconsistent = await resolve([exact()], { readContent: okContent(makeReference({ version: { checksum: DC_OTHER_SHA } }), geoFeatures(), { checksum: DC_SHA }) }).result;
    expect(inconsistent.sources[0]).toMatchObject({ status: "PIN_CONTENT_CHANGED" });
  });
});

describe("a selection by type", () => {
  const selected = makeReference();
  const competing = makeReference({ version: { versionId: DC_OTHER_VERSION_ID, checksum: DC_OTHER_SHA }, dataset: { title: "Riyadh clinics" } });

  it("takes the version the Data Center's policy selected, says how, and reports the datasets it chose among", async () => {
    const discovery = foundDiscovery(selected, { mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: "2026-06-01T00:00:00.000Z", asOfExplicit: true, candidates: [selected, competing], notInForce: [{ versionId: "late-version", reason: "NOT_PUBLISHED_AT_AS_OF" }] });
    const { port, result } = resolve([byType("poi:hospital", { asOf: "2026-06-01T00:00:00.000Z" })], { discover: discovery });
    const { sources, inputs, gaps } = await result;
    const source = sources[0]!;
    expect(source.status).toBe("RESOLVED");
    if (source.status !== "RESOLVED") return;
    expect(port.callsOf("discover")[0]?.request).toEqual({ kind: "BY_TYPE", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000Z" });
    expect(source.trace).toEqual({
      mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: "2026-06-01T00:00:00.000Z", asOfExplicit: true, discoveryStatus: "FOUND", selectedVersionId: DC_VERSION_ID,
      candidateVersionIds: [DC_VERSION_ID, DC_OTHER_VERSION_ID], candidatesTruncated: false, notInForce: [{ versionId: "late-version", reason: "NOT_PUBLISHED_AT_AS_OF" }],
    });
    expect(inputs[0]?.limitations).toContain("Selected by the policy dc-version-selection-v1 among the published datasets of type geojson, as of 2026-06-01T00:00:00.000Z.");
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ code: "DATA_CENTER_COMPETING_DATASETS", severity: "INFO", inputId: `dc:${DC_VERSION_ID}`, subject: "poi:hospital" });
    expect(gaps[0]?.message.en).toContain("1 other Data Center dataset(s) of type “geojson” were in force");
    expect(gapSchema.safeParse(gaps[0]).success).toBe(true);
  });

  it("says nothing about competitors when there are none", async () => {
    const { gaps } = await resolve([byType()], { discover: foundDiscovery(selected, { mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: EVALUATED_AT, candidates: [selected] }) }).result;
    expect(gaps).toEqual([]);
  });

  it("counts the datasets it chose among as a lower bound when the listing was cut, and says so in the trace", async () => {
    const discovery = foundDiscovery(selected, { mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: EVALUATED_AT, candidates: [selected, competing, competing], truncated: true });
    const { sources, gaps } = await resolve([byType()], { discover: discovery }).result;
    expect(sources[0]).toMatchObject({ status: "RESOLVED", trace: { candidatesTruncated: true } });
    expect(gaps[0]?.message.en).toContain("2+ other Data Center dataset(s) of type “geojson” were in force");
    expect(gapSchema.safeParse(gaps[0]).success).toBe(true);
  });

  it.each<[string, "NOT_AVAILABLE" | "NO_COVERAGE" | "NOT_IN_FORCE" | "TOO_MANY_CANDIDATES", string, string]>([
    ["no readable dataset of that type", "NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "BLOCKING"],
    ["datasets of that type that do not cover the place", "NO_COVERAGE", "NO_COVERAGE", "BLOCKING"],
    ["datasets of that type, none in force at the date", "NOT_IN_FORCE", "DATA_CENTER_NOT_IN_FORCE", "BLOCKING"],
    ["more datasets of that type than a choice can rest on", "TOO_MANY_CANDIDATES", "DATA_CENTER_TOO_MANY_CANDIDATES", "BLOCKING"],
  ])("reports %s as its own gap, selects nothing and reads nothing", async (_name, status, code, severity) => {
    const { port, result } = resolve([byType("poi:hospital", { asOf: "2026-01-01T00:00:00.000Z" })], { discover: emptyDiscovery(status, { asOf: "2026-01-01T00:00:00.000Z", asOfExplicit: true }) });
    const { sources, inputs, gaps } = await result;
    expect(sources[0]).toMatchObject({ status, trace: { discoveryStatus: status, selectedVersionId: null } });
    expect(inputs).toEqual([]);
    expect(gaps.map((gap) => [gap.code, gap.severity, gap.subject])).toEqual([[code, severity, "poi:hospital"]]);
    expect(port.callsOf("readContent")).toEqual([]);
    if (status === "NOT_IN_FORCE") expect(gaps[0]?.message.en).toContain("none was in force as of 2026-01-01T00:00:00.000Z");
    if (status === "NO_COVERAGE") expect(gaps[0]?.message.en).toContain("Data Center datasets of type geojson");
  });
});

describe("a Data Center version whose content cannot be used", () => {
  it.each<[string, FakeDataCenterBehaviour, string, string]>([
    ["is gone between discovery and the read", { readContent: { status: "NOT_AVAILABLE" } }, "NOT_AVAILABLE", "DATASET_NOT_AVAILABLE"],
    ["fails its integrity check", { readContent: { status: "INTEGRITY_FAILED" } }, "INTEGRITY_FAILED", "DATA_CENTER_INTEGRITY_FAILED"],
    ["has content other than the pinned checksum", { readContent: { status: "PIN_CONTENT_CHANGED" } }, "PIN_CONTENT_CHANGED", "DATA_CENTER_PIN_CHANGED"],
    ["is not spatial data", { readContent: { status: "NOT_SPATIAL" } }, "NOT_SPATIAL", "DATA_CENTER_VERSION_NOT_SPATIAL"],
    ["is not valid GeoJSON", { readContent: { status: "CONTENT_INVALID", code: "INVALID_GEOJSON_COORDINATES" } }, "CONTENT_INVALID", "DATA_CENTER_CONTENT_INVALID"],
  ])("is reported, not used and not repaired, when it %s", async (_name, behaviour, status, code) => {
    const { sources, inputs, gaps } = await resolve([exact()], behaviour).result;
    expect(sources[0]).toMatchObject({ status, trace: { selectedVersionId: DC_VERSION_ID } });
    expect(inputs).toEqual([]);
    expect(gaps.map((gap) => [gap.code, gap.severity])).toEqual([[code, "BLOCKING"]]);
    if (status === "CONTENT_INVALID") {
      expect(gaps[0]?.message.en).toContain("INVALID_GEOJSON_COORDINATES");
      expect(gaps[0]?.message.en).toContain("Riyadh hospitals");
    }
  });

  it.each<[string, ReturnType<typeof geoFeatures>, string]>([
    ["has no feature", [], "NO_FEATURES"],
    ["has a feature without a geometry", [geoFeature(0), geoFeature(1, { geometry: null })], "FEATURE_WITHOUT_GEOMETRY"],
    ["has a geometry collection", [geoFeature(0, { geometry: { type: "GeometryCollection", geometries: [] } })], "GEOMETRY_COLLECTION_NOT_SUPPORTED"],
    ["has too many features", geoFeatures(MAX_DATASET_FEATURES + 1), "TOO_MANY_FEATURES"],
  ])("is refused as a whole when the dataset %s, and never used in part", async (_name, features, code) => {
    const { sources, inputs, gaps } = await resolve([exact()], { readContent: okContent(makeReference(), features) }).result;
    expect(sources[0]).toMatchObject({ status: "CONTENT_INVALID" });
    expect(inputs).toEqual([]);
    expect(gaps[0]).toMatchObject({ code: "DATA_CENTER_CONTENT_INVALID", severity: "BLOCKING" });
    expect(gaps[0]?.message.en).toContain(code);
  });

  it("is reported as a backend failure when the Data Center cannot be asked, at either step, and a defect still surfaces as a defect", async () => {
    for (const behaviour of [{ discover: new DataCenterProviderError("UNAVAILABLE") }, { readContent: new DataCenterProviderError("UNAVAILABLE") }] as FakeDataCenterBehaviour[]) {
      const { sources, inputs, gaps } = await resolve([exact()], behaviour).result;
      expect(sources[0]).toMatchObject({ status: "BACKEND_UNAVAILABLE" });
      expect(inputs).toEqual([]);
      expect(gaps[0]).toMatchObject({ code: "BACKEND_UNAVAILABLE", severity: "BLOCKING", subject: "poi:hospital" });
      expect(gaps[0]?.message.en).toContain("“DATA_CENTER”");
    }
    await expect(resolve([exact()], { discover: new TypeError("a defect") }).result).rejects.toThrow("a defect");
  });
});

describe("resolving several roles", () => {
  it("answers each role on its own: one that cannot be used does not stop the others, and the order of the answers is the order of the roles", async () => {
    const other = makeReference({ version: { versionId: DC_OTHER_VERSION_ID, checksum: DC_OTHER_SHA } });
    const behaviour: FakeDataCenterBehaviour = {
      discover: (selection) => (selection.kind === "EXACT" && selection.versionId === DC_OTHER_VERSION_ID ? foundDiscovery(other) : selection.kind === "EXACT" && selection.versionId === "missing" ? emptyDiscovery("NOT_AVAILABLE") : foundDiscovery(makeReference())),
      readContent: (request) => okContent(request.versionId === DC_OTHER_VERSION_ID ? other : makeReference()),
    };
    const { sources, inputs, gaps } = await resolve([exact("poi:school", DC_OTHER_VERSION_ID), exact("poi:market", "missing"), exact("poi:hospital")], behaviour).result;
    expect(sources.map((source) => [source.role, source.status])).toEqual([["poi:hospital", "RESOLVED"], ["poi:market", "NOT_AVAILABLE"], ["poi:school", "RESOLVED"]]);
    expect(inputs.map((input) => input.id)).toEqual([`dc:${DC_VERSION_ID}`, `dc:${DC_OTHER_VERSION_ID}`].sort());
    expect(gapCodes(gaps)).toEqual(["DATASET_NOT_AVAILABLE"]);
  });

  it("gives roles that resolve to the same version one input that lists every one of them", async () => {
    const { sources, inputs } = await resolve([exact("road:major"), exact("poi:school"), exact("poi:hospital")]).result;
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.roles).toEqual(["poi:hospital", "poi:school", "road:major"]);
    for (const source of sources) if (source.status === "RESOLVED") expect(source.input.roles).toEqual(["poi:hospital", "poi:school", "road:major"]);
  });

  it("gives the same answer however the requests are ordered, and however often it is asked", async () => {
    const requests = [exact("poi:school", DC_VERSION_ID), exact("poi:hospital"), byType("road:major")];
    const first = await resolve(requests).result;
    expect(await resolve([...requests].reverse()).result).toEqual(first);
    expect(await resolve(requests).result).toEqual(first);
  });

  it("resolves nothing, and asks nothing, when nothing is selected", async () => {
    const { port, result } = resolve([]);
    expect(await result).toEqual({ sources: [], inputs: [], gaps: [] });
    expect(port.calls).toEqual([]);
  });

  it("does not change the requests it is given", async () => {
    const requests = [exact("poi:school"), exact("poi:hospital")];
    const before = JSON.stringify(requests);
    await resolve(requests).result;
    expect(JSON.stringify(requests)).toBe(before);
  });
});

describe("what a resolved version still says about itself", () => {
  it("keeps every limitation the data has: undeclared rights, unrecorded quality and unknown completeness each become a gap of the input, as for any input", async () => {
    const bare = makeReference({ rights: { licenseClass: null, allowExport: false, attribution: { text: null, required: false, level: null } }, quality: { status: "UNAVAILABLE" } });
    const { inputs } = await resolve([exact()], { readContent: okContent(bare) }).result;
    expect(deriveInputGaps(inputs[0]!).map((gap) => gap.code).sort()).toEqual(["COMPLETENESS_UNKNOWN", "EXPORT_NOT_PERMITTED", "LICENSE_CLASS_UNDECLARED", "QUALITY_UNAVAILABLE"]);
  });

  it("is judged at the run's instant: data that has expired by then is said to be expired", async () => {
    const reference = makeReference({ freshness: { expiresAt: "2026-10-01T00:00:00.000Z" } });
    const { inputs } = await resolve([exact()], { readContent: okContent(reference) }).result;
    expect(inputs[0]?.freshness).toMatchObject({ status: "EXPIRED", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(deriveInputGaps(inputs[0]!).map((gap) => gap.code)).toContain("DATA_EXPIRED");
  });

  it("prepares what the Data Center must be told after a successful run, and writes nothing now", async () => {
    const { port, result } = resolve([exact("poi:school"), exact("poi:hospital")]);
    const { inputs } = await result;
    expect(buildDataCenterUsageIntents(inputs, ["LOCATION_CONTEXT"])).toEqual([
      { versionId: DC_VERSION_ID, checksum: DC_SHA, consumer: "analysis-engine:spatial", purpose: "Spatial analysis: LOCATION_CONTEXT", roles: ["poi:hospital", "poi:school"] },
    ]);
    // The port has three questions only, all reads: there is no way to record a usage through it.
    expect(Object.getOwnPropertyNames(FakeDataCenterPort.prototype).filter((name) => !["constructor", "answer", "callsOf"].includes(name)).sort()).toEqual(["discover", "readContent", "resolveMapReference"]);
    expect(new Set(port.calls.map((call) => call.method))).toEqual(new Set(["discover", "readContent"]));
  });
});

describe("the Data Center selections of a request, as requests for the resolver", () => {
  const roles = (selections: Record<string, unknown>) => normalizeSpatialRequest(baseRequest({ parameters: { roles: Object.keys(selections) }, data: { roles: selections } } as never), { environment: "test", now: () => new Date(EVALUATED_AT) }).normalized.data.roles;
  const geography = { countryCodes: ["SA"], boundingBox: { west: 46, south: 24, east: 47, north: 25 } };

  it("turns an exact version and a type as of an instant into the selections the resolver reads, in role order", () => {
    const requests = dataSourceRequestsOf(roles({
      "poi:school": { source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" }, "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID }, "poi:clinic": { source: "DATA_CENTER", typeKey: "geojson" },
    }));
    expect(requests).toEqual([
      { role: "poi:clinic", selection: { kind: "BY_TYPE", typeKey: "geojson" } },
      { role: "poi:hospital", selection: { kind: "EXACT", versionId: DC_VERSION_ID } },
      { role: "poi:school", selection: { kind: "BY_TYPE", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000Z" } },
    ]);
  });

  it("narrows a type to the place when given one, and never narrows an exact version, which is used as given", () => {
    const requests = dataSourceRequestsOf(roles({ "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID }, "poi:school": { source: "DATA_CENTER", typeKey: "geojson" } }), { geography });
    expect(requests).toEqual([
      { role: "poi:hospital", selection: { kind: "EXACT", versionId: DC_VERSION_ID } },
      { role: "poi:school", selection: { kind: "BY_TYPE", typeKey: "geojson", geography } },
    ]);
  });

  it("leaves out the roles pinned to the Map and the roles with no pin, which are not the Data Center's to resolve", () => {
    expect(dataSourceRequestsOf(roles({ "poi:hospital": { source: "MAP", layerKey: "pois" } }))).toEqual([]);
    expect(dataSourceRequestsOf({})).toEqual([]);
  });

  it("refuses a selection that names neither a version nor a type, whatever produced it", () => {
    expect(() => dataSourceRequestsOf({ "poi:hospital": { source: "DATA_CENTER" } } as never)).toThrow(expect.objectContaining({ code: "CONTRACT_VIOLATION" }));
  });

  it("resolves what the request selected, end to end through the port, and only that", async () => {
    const requests = dataSourceRequestsOf(roles({ "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID }, "poi:school": { source: "DATA_CENTER", typeKey: "geojson", asOf: "2026-06-01T00:00:00Z" } }), { geography });
    const { port, result } = resolve(requests);
    const { sources } = await result;
    expect(sources.map((source) => [source.role, source.status])).toEqual([["poi:hospital", "RESOLVED"], ["poi:school", "RESOLVED"]]);
    expect(port.callsOf("discover").map((call) => call.request)).toEqual([
      { kind: "EXACT", versionId: DC_VERSION_ID },
      { kind: "BY_TYPE", typeKey: "geojson", asOf: "2026-06-01T00:00:00.000Z", geography },
    ]);
  });
});
