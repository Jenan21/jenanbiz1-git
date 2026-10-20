import { describe, expect, it } from "vitest";
import { QUERIES } from "@/services/analysis-engines/spatial/adapters/queries";
import { PostgisMapReader } from "@/services/analysis-engines/spatial/adapters/postgis-map-reader";
import { buildOpeningBatch, readOnlySessionConfigSchema } from "@/services/analysis-engines/spatial/adapters/read-only-session";
import type { SpatialLocation } from "@/services/analysis-engines/spatial/contracts";
import { MAP_CONTRACT_TABLES, MAP_READ_CONTRACT } from "@/services/analysis-engines/spatial/map-contract";
import { MapReadError } from "@/services/analysis-engines/spatial/map-read-error";
import { FakePool, pgError, readerConfig, type Script } from "./support/spatial-fake-pool";
import { AUTHORITY_TEXT, BOUNDARY_ID, publishedRelease, RELEASE_ID, realBoundaryRow, realDescription } from "./support/spatial-map-fixtures";

const point: SpatialLocation = { type: "Point", coordinates: [46.6753, 24.7136] };
const box: SpatialLocation = { type: "Polygon", coordinates: [[[46.6, 24.6], [46.8, 24.6], [46.8, 24.8], [46.6, 24.8], [46.6, 24.6]]] };
const OTHER_RELEASE = "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b";

const make = (script: Script = {}, config: Partial<typeof readerConfig> & Record<string, unknown> = {}) => {
  const pool = new FakePool(script);
  return { pool, reader: new PostgisMapReader({ ...readerConfig, ...config }, pool) };
};
const kindOf = async (work: Promise<unknown>) => ((await work.catch((error: unknown) => error)) as MapReadError).kind;

const runtimeRows = [{ status: "enabled", publishedReleaseId: RELEASE_ID }];
const releaseRows = [{ ...publishedRelease }];
const boundaryRows = [{ ...realBoundaryRow() }];
const layerRows = [
  { layerId: "governorates", bindingEnabled: null, bindingStatus: null, bindingVisibility: null, hasFeatures: true },
  { layerId: "places", bindingEnabled: true, bindingStatus: "ready", bindingVisibility: "public", hasFeatures: true },
  { layerId: "regions", bindingEnabled: true, bindingStatus: "ready", bindingVisibility: "public", hasFeatures: true },
];
const describeScript: Script = { runtime: runtimeRows, release: releaseRows, boundary: boundaryRows, layers: layerRows };

describe("PostGIS Map reader: capabilities", () => {
  const catalogRows = Object.entries(MAP_READ_CONTRACT.tables).flatMap(([table, columns]) => Object.entries(columns).map(([column, type]) => ({ table, column, type })));
  const role = (over: Record<string, unknown> = {}) => ({ superuser: false, writeAll: false, schemaUsage: true, canSelectAll: true, canWriteSome: false, tables: 5, ...over });
  const healthy: Script = {
    postgisPresent: [{ present: true }],
    postgisVersions: [{ postgis: "3.5.2", geos: "3.9.0-CAPI-1.16.2", proj: "7.2.1 NETWORK_ENABLED=OFF URL_ENDPOINT=https://cdn.proj.org USER_WRITABLE_DIRECTORY=/var/lib/postgresql/.local/share/proj" }],
    catalog: catalogRows, role: [role()],
  };

  it("reports what the backend says about itself, a clean contract and a role that cannot write", async () => {
    const { reader, pool } = make(healthy);
    const capabilities = await reader.capabilities();
    expect(capabilities).toEqual({
      backend: "POSTGIS", placement: "DEDICATED_CONNECTION", readOnly: true, postgis: "3.5.2", geos: "3.9.0-CAPI-1.16.2", proj: "7.2.1",
      mapSchemaReachable: true, roleCanWrite: false, contractProblems: [],
    });
    expect(pool.callsOf("catalog")[0]?.values).toEqual(["jenan_map", MAP_CONTRACT_TABLES]);
    expect(pool.callsOf("role")[0]?.values).toEqual(["jenan_map", MAP_CONTRACT_TABLES]);
  });

  it("keeps only the version number: a build path or option in a version string never leaves the adapter", async () => {
    const { reader } = make(healthy);
    expect(JSON.stringify(await reader.capabilities())).not.toMatch(/var\/lib|NETWORK_ENABLED|cdn\.proj/);
    const odd = make({ ...healthy, postgisVersions: [{ postgis: null, geos: "<script>", proj: "" }] });
    expect(await odd.reader.capabilities()).toMatchObject({ postgis: null, geos: null, proj: null });
  });

  it("reports the placement it was configured with", async () => {
    const { reader } = make(healthy, { placement: "APP_DATABASE" });
    expect((await reader.capabilities()).placement).toBe("APP_DATABASE");
  });

  it.each([
    ["a superuser", { superuser: true }], ["a member of pg_write_all_data", { writeAll: true }], ["a role with write privileges on a Map table", { canWriteSome: true }],
  ])("says %s can write", async (_label, over) => {
    const { reader } = make({ ...healthy, role: [role(over)] });
    expect((await reader.capabilities()).roleCanWrite).toBe(true);
  });

  it("treats a role it cannot describe as able to write", async () => {
    const { reader } = make({ ...healthy, role: [] });
    expect(await reader.capabilities()).toMatchObject({ roleCanWrite: true, mapSchemaReachable: false });
  });

  it.each([
    ["no USAGE on the schema", { schemaUsage: false }], ["no SELECT on some table", { canSelectAll: false }], ["fewer tables than the contract lists", { tables: 4 }],
  ])("says the Map is not reachable with %s", async (_label, over) => {
    const { reader } = make({ ...healthy, role: [role(over)] });
    expect((await reader.capabilities()).mapSchemaReachable).toBe(false);
  });

  it("lists every difference between the contract and the database", async () => {
    const drifted = catalogRows.filter((row) => !(row.table === "feature" && row.column === "sourceId")).map((row) => (row.table === "feature" && row.column === "geometry" ? { ...row, type: "geometry" } : row))
      .filter((row) => row.table !== "release_layer");
    const { reader } = make({ ...healthy, catalog: drifted });
    const capabilities = await reader.capabilities();
    expect(capabilities.contractProblems).toEqual([
      "jenan_map.release_layer is missing", "jenan_map.feature.sourceId is missing", "jenan_map.feature.geometry is geometry, expected geometry(Geometry,4326)",
    ]);
    expect(capabilities.mapSchemaReachable).toBe(false);
  });

  it("fails with POSTGIS_MISSING, before anything else is asked, when PostGIS is not installed", async () => {
    const { reader, pool } = make({ postgisPresent: [{ present: false }] });
    expect(await kindOf(reader.capabilities())).toBe("POSTGIS_MISSING");
    expect(pool.queriesSent()).toEqual(["postgisPresent"]);
  });

  it("fails closed when the backend answers in a shape it does not know", async () => {
    expect(await kindOf(make({ ...healthy, role: [{ superuser: "yes" }] }).reader.capabilities())).toBe("SCHEMA_MISMATCH");
    expect(await kindOf(make({ ...healthy, catalog: [{ table: "feature" }] }).reader.capabilities())).toBe("SCHEMA_MISMATCH");
  });
});

describe("PostGIS Map reader: describeMap", () => {
  it("describes the published release exactly as the contract's own fixtures do, and nothing more", async () => {
    const { reader, pool } = make(describeScript);
    const description = await reader.describeMap({ layers: ["regions", "governorates", "places"] });
    expect(description).toEqual(realDescription());
    expect(pool.queriesSent()).toEqual(["runtime", "release", "boundary", "layers"]);
    expect(pool.callsOf("release")[0]?.values).toEqual([RELEASE_ID]);
    expect(pool.callsOf("boundary")[0]?.values).toEqual([RELEASE_ID]);
    expect(pool.callsOf("layers")[0]?.values).toEqual([RELEASE_ID, ["regions", "governorates", "places"]]);
  });

  it("reads everything in one snapshot: the opening batch first and a rollback last", async () => {
    const { reader, pool } = make(describeScript);
    await reader.describeMap({ layers: ["places"] });
    expect(pool.calls[0]?.text).toBe(buildOpeningBatch(readOnlySessionConfigSchema.parse(readerConfig)));
    expect(pool.calls.at(-1)?.text).toBe("ROLLBACK");
    expect(pool.connects).toBe(1);
  });

  it("marks the governorates as a data-only layer (reviewed provenance, features, no binding) and the places as bound", async () => {
    const { reader } = make(describeScript);
    const layers = (await reader.describeMap({ layers: ["governorates", "places"] })).layers;
    expect(layers[0]).toMatchObject({ id: "governorates", binding: null, hasFeatures: true });
    expect(layers[0]?.provenance?.source).toContain("SAU-ADM2");
    expect(layers[1]).toMatchObject({ id: "places", binding: { enabled: true, status: "ready", visibility: "public" }, hasFeatures: true });
  });

  it("says there is nothing published when the Map has no runtime row or publishes no release", async () => {
    const none = make({ runtime: [] });
    expect(await none.reader.describeMap({ layers: ["places"] })).toEqual({ runtime: null, release: null, boundary: null, layers: [] });
    expect(none.pool.queriesSent()).toEqual(["runtime"]);
    const disabled = make({ runtime: [{ status: "disabled", publishedReleaseId: null }] });
    expect(await disabled.reader.describeMap({ layers: ["places"] })).toEqual({ runtime: { status: "disabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] });
    expect(disabled.pool.queriesSent()).toEqual(["runtime"]);
  });

  it("describes a pinned release instead of the published one, and keeps the runtime so the caller can compare them", async () => {
    const pinned = [{ ...publishedRelease, id: OTHER_RELEASE, status: "Ready", publishedAt: null }];
    const { reader, pool } = make({ ...describeScript, release: pinned, boundary: [], layers: [] });
    const description = await reader.describeMap({ releaseId: OTHER_RELEASE, layers: ["places"] });
    expect(pool.callsOf("release")[0]?.values).toEqual([OTHER_RELEASE]);
    expect(description.runtime?.publishedReleaseId).toBe(RELEASE_ID);
    expect(description.release).toMatchObject({ id: OTHER_RELEASE, status: "Ready", publishedAt: null });
    expect(description.boundary).toBeNull();
    expect(description.layers).toEqual([{ id: "places", provenance: null, binding: null, hasFeatures: false }]);
  });

  it("says there is no release when a pinned one does not exist", async () => {
    const { reader, pool } = make({ runtime: runtimeRows, release: [] });
    expect(await reader.describeMap({ releaseId: OTHER_RELEASE, layers: ["places"] })).toEqual({ runtime: { status: "enabled", publishedReleaseId: RELEASE_ID }, release: null, boundary: null, layers: [] });
    expect(pool.queriesSent()).toEqual(["runtime", "release"]);
  });

  it("asks about each layer once, in the order given, and skips the layer query when none is wanted", async () => {
    const { reader, pool } = make(describeScript);
    const description = await reader.describeMap({ layers: ["places", "regions", "places", "competitors"] });
    expect(pool.callsOf("layers")[0]?.values).toEqual([RELEASE_ID, ["places", "regions", "competitors"]]);
    expect(description.layers.map((layer) => layer.id)).toEqual(["places", "regions", "competitors"]);
    expect(description.layers[2]).toEqual({ id: "competitors", provenance: null, binding: null, hasFeatures: false });
    const bare = make(describeScript);
    expect((await bare.reader.describeMap({ layers: [] })).layers).toEqual([]);
    expect(bare.pool.queriesSent()).toEqual(["runtime", "release", "boundary"]);
  });

  it("trusts provenance only from a complete record, and never from a prototype property", async () => {
    const incomplete = { ...realBoundaryRow().coverage as Record<string, unknown>, layers: [{ id: "places", provenance: { source: "x" } }, { id: "constructor", provenance: { source: "x" } }] };
    const { reader } = make({ ...describeScript, boundary: [{ ...realBoundaryRow({ coverage: incomplete }) }] });
    const layers = (await reader.describeMap({ layers: ["places", "constructor", "__proto__"] })).layers;
    expect(layers.map((layer) => layer.provenance)).toEqual([null, null, null]);
  });

  it("reads a coverage record it cannot interpret as a boundary that is not official", async () => {
    const { reader } = make({ ...describeScript, boundary: [{ ...realBoundaryRow({ coverage: "not json" }) }] });
    const description = await reader.describeMap({ layers: ["places"] });
    expect(description.boundary).toMatchObject({ id: BOUNDARY_ID, official: false, authorityText: AUTHORITY_TEXT, layerProvenance: {} });
  });

  it.each([
    ["an unknown runtime status", { runtime: [{ status: "paused", publishedReleaseId: RELEASE_ID }] }],
    ["a runtime that points at something that is not a uuid", { runtime: [{ status: "enabled", publishedReleaseId: "latest" }] }],
    ["an unknown release status", { release: [{ ...publishedRelease, status: "Superseded" }] }],
    ["a release without its version", { release: [{ ...publishedRelease, version: undefined }] }],
    ["an unknown binding status", { layers: [{ layerId: "places", bindingEnabled: true, bindingStatus: "degraded", bindingVisibility: "public", hasFeatures: true }] }],
    ["a boundary whose extent is text", { boundary: [{ ...realBoundaryRow(), west: "34.5" }] }],
  ] as Array<[string, Script]>)("fails closed with SCHEMA_MISMATCH on %s instead of coercing it", async (_label, override) => {
    const { reader, pool } = make({ ...describeScript, ...override });
    expect(await kindOf(reader.describeMap({ layers: ["places"] }))).toBe("SCHEMA_MISMATCH");
    expect(pool.calls.at(-1)?.text).toBe("ROLLBACK");
  });
});

describe("PostGIS Map reader: checkGeometries", () => {
  it("answers for each location in order, with PostGIS's own reason for an invalid one", async () => {
    const { reader, pool } = make({ geometryChecks: [{ ordinal: 1, valid: true, reason: "Valid Geometry" }, { ordinal: 2, valid: false, reason: "Self-intersection[0.5 0.5]" }] });
    expect(await reader.checkGeometries([point, box])).toEqual([{ valid: true }, { valid: false, reason: "Self-intersection[0.5 0.5]" }]);
    expect(pool.callsOf("geometryChecks")[0]?.values).toEqual([[JSON.stringify(point), JSON.stringify(box)]]);
  });

  it("asks nothing when there is nothing to check, and shortens a long reason", async () => {
    const empty = make();
    expect(await empty.reader.checkGeometries([])).toEqual([]);
    expect(empty.pool.calls).toEqual([]);
    const long = make({ geometryChecks: [{ ordinal: 1, valid: false, reason: "x".repeat(500) }, { ordinal: 2, valid: false, reason: null }] });
    const [first, second] = await long.reader.checkGeometries([box, box]);
    expect(first).toEqual({ valid: false, reason: `${"x".repeat(199)}…` });
    expect(second).toEqual({ valid: false, reason: "Invalid geometry" });
  });

  it("does not answer a different number of locations than it was given", async () => {
    const { reader } = make({ geometryChecks: [{ ordinal: 1, valid: true, reason: null }] });
    expect(await kindOf(reader.checkGeometries([point, box]))).toBe("UNKNOWN");
  });

  it("reports GeoJSON that PostGIS refuses as an invalid geometry", async () => {
    const { reader } = make({ geometryChecks: pgError("XX000", "invalid GeoJSON representation") });
    expect(await kindOf(reader.checkGeometries([point]))).toBe("INVALID_GEOMETRY");
  });
});

describe("PostGIS Map reader: locate", () => {
  const coverage = (over: Record<string, unknown> = {}) => ({ anchorLongitude: 46.6753, anchorLatitude: 24.7136, hasBoundary: true, covers: true, intersects: true, fraction: null, ...over });
  const unit = (level: string, label: string, over: Record<string, unknown> = {}) => ({
    level, id: `00000000-0000-4000-8000-${String(label.length).padStart(12, "0")}`, label, coversAnchor: true, coversTarget: true, edgeDistanceMeters: 100, rank: 1, ...over,
  });
  const locate = (script: Script, location: SpatialLocation = point, levels: Array<"regions" | "governorates"> = ["regions", "governorates"]) => {
    const made = make(script);
    return { ...made, run: () => made.reader.locate({ releaseId: RELEASE_ID, location, levels }) };
  };

  it("finds Riyadh and its region, with the geodesic distance from each edge to one decimal", async () => {
    const { run, pool } = locate({
      locateCoverage: [coverage()],
      locateUnits: [unit("governorates", "Riyadh", { edgeDistanceMeters: 6059.50351414 }), unit("regions", "Riyadh Region", { edgeDistanceMeters: 82849.48249123 })],
    });
    const result = await run();
    expect(result.anchor).toEqual({ longitude: 46.6753, latitude: 24.7136 });
    expect(result.coverage).toEqual({ status: "FULL", fraction: 1 });
    expect(result.levels.governorates?.units).toEqual([{ id: expect.any(String), label: "Riyadh", coversAnchor: true, coversTarget: true, edgeDistanceMeters: 6059.5 }]);
    expect(result.levels.regions?.units[0]).toMatchObject({ label: "Riyadh Region", edgeDistanceMeters: 82849.5 });
    expect(pool.queriesSent()).toEqual(["locateCoverage", "locateUnits"]);
    expect(pool.callsOf("locateCoverage")[0]?.values).toEqual([RELEASE_ID, JSON.stringify(point)]);
    expect(pool.callsOf("locateUnits")[0]?.values).toEqual([RELEASE_ID, JSON.stringify(point), ["regions", "governorates"], 11]);
  });

  it("rounds the representative point of an area to a centimetre", async () => {
    const { run } = locate({ locateCoverage: [coverage({ anchorLongitude: 46.7, anchorLatitude: 24.700000000000003 })], locateUnits: [] }, box);
    expect((await run()).anchor).toEqual({ longitude: 46.7, latitude: 24.7 });
  });

  it.each([
    ["inside", { covers: true, intersects: true }, { status: "FULL", fraction: 1 }],
    ["outside", { covers: false, intersects: false }, { status: "NONE", fraction: 0 }],
    ["partly inside", { covers: false, intersects: true, fraction: 0.5641364733170741 }, { status: "PARTIAL", fraction: 0.564136 }],
    ["partly inside by an amount it cannot give", { covers: false, intersects: true, fraction: null }, { status: "PARTIAL", fraction: null }],
    ["touching only", { covers: false, intersects: true, fraction: 0 }, { status: "NONE", fraction: 0 }],
    ["covered but for rounding", { covers: false, intersects: true, fraction: 1.0000000002 }, { status: "FULL", fraction: 1 }],
  ])("reports a target that is %s the boundary", async (_label, row, expected) => {
    const { run } = locate({ locateCoverage: [coverage(row)], locateUnits: [] });
    expect((await run()).coverage).toEqual(expected);
  });

  it("reports no coverage at all when the release has no boundary, not a coverage of zero", async () => {
    const { run } = locate({ locateCoverage: [coverage({ hasBoundary: false, covers: false, intersects: false })], locateUnits: [] });
    expect((await run()).coverage).toBeNull();
  });

  it("keeps ten units a level, flags the truncation, and keeps the stable order the database gave", async () => {
    const rows = Array.from({ length: 11 }, (_unused, index) => unit("governorates", `Unit ${String(index + 1).padStart(2, "0")}`, { rank: index + 1, coversAnchor: index === 0, edgeDistanceMeters: index === 0 ? 0 : null }));
    const result = await locate({ locateCoverage: [coverage()], locateUnits: rows }, box).run();
    expect(result.levels.governorates?.units).toHaveLength(10);
    expect(result.levels.governorates?.truncated).toBe(true);
    expect(result.levels.governorates?.units[0]).toMatchObject({ label: "Unit 01", coversAnchor: true, edgeDistanceMeters: 0 });
    expect(result.levels.governorates?.units.map((entry) => entry.label).at(-1)).toBe("Unit 10");
    expect(result.levels.regions).toEqual({ units: [], truncated: false });
  });

  it("gives every requested level an entry, even one without a unit, and ignores a level nobody asked for", async () => {
    const result = await locate({ locateCoverage: [coverage()], locateUnits: [unit("governorates", "Riyadh"), unit("places", "Stray")] }, point, ["governorates"]).run();
    expect(Object.keys(result.levels)).toEqual(["governorates"]);
    const empty = await locate({ locateCoverage: [coverage({ covers: false, intersects: false })], locateUnits: [] }).run();
    expect(empty.levels).toEqual({ regions: { units: [], truncated: false }, governorates: { units: [], truncated: false } });
  });

  it("does not look for units when no level is wanted", async () => {
    const { run, pool } = locate({ locateCoverage: [coverage()] }, point, []);
    expect((await run()).levels).toEqual({});
    expect(pool.queriesSent()).toEqual(["locateCoverage"]);
  });

  it("keeps a unit's missing edge distance missing instead of inventing zero", async () => {
    const result = await locate({ locateCoverage: [coverage()], locateUnits: [unit("regions", "East", { coversAnchor: false, coversTarget: false, edgeDistanceMeters: null })] }).run();
    expect(result.levels.regions?.units[0]?.edgeDistanceMeters).toBeNull();
  });

  it("fails closed on a row it does not recognize, and reports a timeout as one", async () => {
    expect(await kindOf(locate({ locateCoverage: [{ anchorLongitude: "46.7" }], locateUnits: [] }).run())).toBe("SCHEMA_MISMATCH");
    expect(await kindOf(locate({ locateCoverage: [coverage()], locateUnits: [{ level: "regions", label: "No id" }] }).run())).toBe("SCHEMA_MISMATCH");
    expect(await kindOf(locate({ locateCoverage: [] }).run())).toBe("UNKNOWN");
    const timeout = locate({ locateCoverage: [coverage()], locateUnits: pgError("57014", "canceling statement due to statement timeout") });
    expect(await kindOf(timeout.run())).toBe("TIMEOUT");
    expect(timeout.pool.calls.at(-1)?.text).toBe("ROLLBACK");
  });
});

describe("PostGIS Map reader: nearest", () => {
  const TILE = "12/2578/1757";
  const match = (kind: string, ordinal: number, distance: number, over: Record<string, unknown> = {}) => ({
    part: "match", id: `10000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`, label: `Place ${ordinal}`, sourceId: `places:${kind}:${TILE}/${ordinal}`, distance, count: null, ...over,
  });
  const stray = (count: number, distance: number | null) => ({ part: "unrecognized", id: null, label: null, sourceId: null, distance, count });
  const request = (over: Record<string, unknown> = {}) => ({ releaseId: RELEASE_ID, layerId: "places", location: point, kind: "neighbourhood" as string | null, rings: [500, 1000, 3000], limit: 1, ...over });
  const ringsAnswering = (...answers: unknown[][]): Script => {
    let call = 0;
    return { nearest: () => answers[call++] ?? [stray(0, null)] };
  };

  it("searches ring by ring and stops at the first one that holds the nearest neighbourhood, as in Riyadh", async () => {
    const { reader, pool } = make(ringsAnswering([stray(0, null)], [stray(0, null)], [match("neighbourhood", 7, 1236.21300889), stray(0, null)]));
    const result = await reader.nearest(request());
    expect(result).toEqual({
      searchedMeters: 3000, ringMeters: 3000, unrecognized: { count: 0, nearestMeters: null },
      matches: [{ id: expect.any(String), label: "Place 7", kind: "neighbourhood", sourceId: `places:neighbourhood:${TILE}/7`, distanceMeters: 1236.2 }],
    });
    expect(pool.callsOf("nearest").map((call) => call.values?.[3])).toEqual([500, 1000, 3000]);
  });

  it("stops at the first ring that has a match, and never searches the larger rings", async () => {
    const { reader, pool } = make(ringsAnswering([match("locality", 1, 420.04), stray(0, null)]));
    const result = await reader.nearest(request({ kind: "locality" }));
    expect(result.searchedMeters).toBe(500);
    expect(result.matches.map((entry) => entry.distanceMeters)).toEqual([420]);
    expect(pool.callsOf("nearest")).toHaveLength(1);
  });

  it("sends the strict patterns: the recognized form of the layer and the wanted kind, with the limit as the last parameter", async () => {
    const { reader, pool } = make(ringsAnswering([match("neighbourhood", 1, 10)]));
    await reader.nearest(request({ limit: 3 }));
    expect(pool.callsOf("nearest")[0]?.values).toEqual([
      RELEASE_ID, "places", JSON.stringify(point), 500,
      "^places:[a-z][a-z0-9_]{0,39}:[0-9]{1,2}/[0-9]{1,7}/[0-9]{1,7}/[0-9]{1,9}$",
      "^places:neighbourhood:[0-9]{1,2}/[0-9]{1,7}/[0-9]{1,7}/[0-9]{1,9}$", 3,
    ]);
  });

  it("accepts any recognized kind when none is wanted, and reports the kind it read from the source id", async () => {
    const { reader, pool } = make(ringsAnswering([match("locality", 1, 90), match("neighbourhood", 2, 400)]));
    const result = await reader.nearest(request({ kind: null, limit: 2 }));
    const values = pool.callsOf("nearest")[0]?.values ?? [];
    expect(values[4]).toBe(values[5]);
    expect(result.matches.map((entry) => entry.kind)).toEqual(["locality", "neighbourhood"]);
  });

  it("keeps searching for as many features as were asked for, then stops", async () => {
    const { reader, pool } = make(ringsAnswering([match("locality", 1, 100)], [match("locality", 1, 100), match("locality", 2, 800)], [match("locality", 1, 100), match("locality", 2, 800), match("locality", 3, 2500)]));
    const result = await reader.nearest(request({ kind: "locality", limit: 3, rings: [500, 1000, 3000, 5000] }));
    expect(result.matches).toHaveLength(3);
    expect(result.searchedMeters).toBe(3000);
    expect(pool.callsOf("nearest")).toHaveLength(3);
  });

  it("reports what it found when the rings run out before it has enough", async () => {
    const { reader } = make(ringsAnswering([match("locality", 1, 100)], [match("locality", 1, 100)]));
    const result = await reader.nearest(request({ kind: "locality", limit: 3, rings: [500, 1000] }));
    expect(result).toMatchObject({ searchedMeters: 1000, ringMeters: 1000 });
    expect(result.matches).toHaveLength(1);
  });

  it("finds nothing within the largest ring without inventing a distance", async () => {
    const { reader, pool } = make({});
    const result = await reader.nearest(request());
    expect(result).toEqual({ searchedMeters: 3000, ringMeters: null, matches: [], unrecognized: { count: 0, nearestMeters: null } });
    expect(pool.callsOf("nearest")).toHaveLength(3);
  });

  it("stops at the first unrecognized feature, because nothing beyond its distance can be trusted, and says how many and how near", async () => {
    const { reader, pool } = make(ringsAnswering([stray(2, 312.456)], [match("neighbourhood", 9, 800)]));
    const result = await reader.nearest(request());
    expect(result).toEqual({ searchedMeters: 500, ringMeters: null, matches: [], unrecognized: { count: 2, nearestMeters: 312.5 } });
    expect(pool.callsOf("nearest")).toHaveLength(1);
  });

  it("returns a match together with an unrecognized feature that is farther, so the caller can compare the distances", async () => {
    const { reader } = make(ringsAnswering([match("neighbourhood", 4, 200), stray(1, 450)]));
    const result = await reader.nearest(request());
    expect(result.matches[0]?.distanceMeters).toBe(200);
    expect(result.unrecognized).toEqual({ count: 1, nearestMeters: 450 });
  });

  it.each([
    ["the layer prefix is another layer's", { sourceId: `pois:neighbourhood:${TILE}/1` }],
    ["the kind is not the one wanted although the database matched", { sourceId: `places:locality:${TILE}/1` }],
    ["the tile is malformed", { sourceId: "places:neighbourhood:12/2578/1757" }],
    ["the id carries a suffix", { sourceId: `places:neighbourhood:${TILE}/1/extra` }],
    ["the id is in upper case", { sourceId: `Places:Neighbourhood:${TILE}/1` }],
  ])("counts a feature as unrecognized, and never as a match, when %s", async (_label, over) => {
    const { reader } = make(ringsAnswering([{ ...match("neighbourhood", 1, 150), ...over }]));
    const result = await reader.nearest(request());
    expect(result.matches).toEqual([]);
    expect(result.unrecognized).toEqual({ count: 1, nearestMeters: 150 });
  });

  it("refuses a layer that does not carry its kind in the source id, and does not touch the database for it", async () => {
    const { reader, pool } = make();
    await expect(reader.nearest(request({ layerId: "regions" }))).rejects.toThrow(RangeError);
    await expect(reader.nearest(request({ kind: "Locality; DROP" }))).rejects.toThrow(RangeError);
    expect(pool.connects).toBe(0);
  });

  it("fails closed on a row of an unknown shape and reports a lost connection as one", async () => {
    expect(await kindOf(make({ nearest: [{ part: "match", id: "x" }] }).reader.nearest(request()))).toBe("SCHEMA_MISMATCH");
    expect(await kindOf(make({ nearest: [{ part: "other" }] }).reader.nearest(request()))).toBe("SCHEMA_MISMATCH");
    expect(await kindOf(make({ nearest: new Error("Connection terminated unexpectedly") }).reader.nearest(request()))).toBe("UNREACHABLE");
  });

  it("searches no ring at all when given none", async () => {
    const { reader, pool } = make();
    expect(await reader.nearest(request({ rings: [] }))).toEqual({ searchedMeters: 0, ringMeters: null, matches: [], unrecognized: { count: 0, nearestMeters: null } });
    expect(pool.callsOf("nearest")).toEqual([]);
  });
});

describe("PostGIS Map reader: lifecycle", () => {
  it("closes its pool", async () => {
    const { reader, pool } = make();
    await reader.close();
    expect(pool.ended).toBe(1);
  });

  it("uses only the queries it ships, whatever it is asked", async () => {
    const { reader, pool } = make({ ...describeScript, locateCoverage: [{ anchorLongitude: 1, anchorLatitude: 1, hasBoundary: true, covers: true, intersects: true, fraction: null }], locateUnits: [] });
    await reader.describeMap({ layers: ["places"] });
    await reader.locate({ releaseId: RELEASE_ID, location: point, levels: ["regions"] });
    await reader.nearest({ releaseId: RELEASE_ID, layerId: "places", location: point, kind: null, rings: [500], limit: 1 });
    const shipped = new Set<string>(Object.values(QUERIES));
    const opening = buildOpeningBatch(readOnlySessionConfigSchema.parse(readerConfig));
    for (const call of pool.calls) expect(shipped.has(call.text) || call.text === opening || call.text === "ROLLBACK").toBe(true);
  });
});
