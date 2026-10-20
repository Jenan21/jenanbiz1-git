import { describe, expect, it } from "vitest";
import {
  assessMapRegistration, findMapContractProblems, findMapIndexProblems, interpretMapBoundary, isMapTileLayer, isOfficialBoundary, mapFreshness, mapFreshnessDays, mapLayerForRole, mapLayerLabel,
  MAP_CONTRACT_TABLES, MAP_FRESHNESS_DAYS, MAP_READ_CONTRACT, mapCoverageSchema, mapProvenanceSchema, MAX_SOURCE_ID_LENGTH, parseMapSourceId, sourceIdPattern, type CatalogColumn,
  type MapLayerFacts, type UnregisteredReason,
} from "@/services/analysis-engines/spatial/map-contract";
import {
  AUTHORITY_TEXT, BOUNDARY_SHA256, NOTICE_TEXT, osmProvenance, publishedRelease, publishedRuntime, realBoundary, realBoundaryRow, realCoverage, realDescription, regionsProvenance, RELEASE_ID,
} from "./support/spatial-map-fixtures";

describe("source id of a feature (the Map's encoding of its kind)", () => {
  it("reads the kind, the tile and the ordinal of a well-formed id", () => {
    expect(parseMapSourceId("places", "places:locality:12/2513/1735/2")).toEqual({ ok: true, layer: "places", kind: "locality", tile: { z: 12, x: 2513, y: 1735 }, ordinal: 2 });
    expect(parseMapSourceId("roads", "roads:minor_road:14/10312/7024/129")).toMatchObject({ ok: true, kind: "minor_road" });
    expect(parseMapSourceId("pois", "pois:place_of_worship:14/1/2/3")).toMatchObject({ ok: true, kind: "place_of_worship", ordinal: 3 });
    expect(parseMapSourceId("places", "places:neighbourhood:0/0/0/0")).toMatchObject({ ok: true, kind: "neighbourhood", tile: { z: 0, x: 0, y: 0 } });
  });

  it.each([
    ["nothing", null, "MISSING"], ["undefined", undefined, "MISSING"], ["an empty string", "", "MISSING"],
    ["three tile parts", "places:locality:12/1/1", "FORMAT"], ["five tile parts", "places:locality:12/1/1/1/1", "FORMAT"],
    ["an upper-case kind", "places:Locality:12/1/1/1", "FORMAT"], ["an empty kind", "places::12/1/1/1", "FORMAT"], ["a kind starting with a digit", "places:1locality:12/1/1/1", "FORMAT"],
    ["a kind with a dash", "places:local-ity:12/1/1/1", "FORMAT"], ["a kind with a dot", "places:local.ity:12/1/1/1", "FORMAT"], ["a kind longer than 40 characters", `places:a${"b".repeat(40)}:12/1/1/1`, "FORMAT"],
    ["an inserted version segment", "places:locality:v2:12/1/1/1", "FORMAT"], ["a changed separator", "places|locality|12/1/1/1", "FORMAT"], ["an upper-case layer", "PLACES:locality:12/1/1/1", "FORMAT"],
    ["a trailing newline", "places:locality:12/1/1/1\n", "FORMAT"], ["a trailing space", "places:locality:12/1/1/1 ", "FORMAT"], ["a leading space", " places:locality:12/1/1/1", "FORMAT"],
    ["a trailing colon", "places:locality:12/1/1/1:", "FORMAT"], ["a three-digit zoom", "places:locality:123/1/1/1", "FORMAT"], ["an eight-digit column", "places:locality:12/12345678/1/1", "FORMAT"],
    ["a negative number", "places:locality:-1/1/1/1", "FORMAT"], ["non-ASCII digits", "places:locality:١٢/1/1/1", "FORMAT"], ["an injected statement", "places:locality:12/1/1/1;DROP TABLE x", "FORMAT"],
    ["a geoBoundaries shape id", "25081817B13159281784364", "FORMAT"], ["an id that is too long", `places:locality:12/1/1/${"1".repeat(MAX_SOURCE_ID_LENGTH)}`, "FORMAT"],
  ] as const)("does not recognize %s", (_name, value, reason) => {
    expect(parseMapSourceId("places", value as string | null | undefined)).toEqual({ ok: false, reason });
  });

  it("refuses an id whose layer is not the feature's layer, instead of reading its kind", () => {
    expect(parseMapSourceId("places", "pois:hospital:12/1/1/1")).toEqual({ ok: false, reason: "LAYER_MISMATCH" });
    expect(parseMapSourceId("pois", "places:locality:12/1/1/1")).toEqual({ ok: false, reason: "LAYER_MISMATCH" });
  });

  it("never reads a kind from layers that do not encode one, however the id looks", () => {
    for (const layer of ["regions", "governorates", "base", "buildings", "unknown"]) expect(parseMapSourceId(layer, "places:locality:12/1/1/1")).toEqual({ ok: false, reason: "NOT_KIND_ADDRESSED" });
    expect(isMapTileLayer("places") && isMapTileLayer("pois") && isMapTileLayer("roads")).toBe(true);
    expect(isMapTileLayer("regions")).toBe(false);
  });

  it("builds patterns that PostgreSQL and JavaScript both read, and that agree with the parser on every case above", () => {
    const corpus = [
      "places:locality:12/2513/1735/2", "places:neighbourhood:12/1/1/1", "places:Locality:12/1/1/1", "places:locality:12/1/1", "places:locality:12/1/1/1\n", " places:locality:12/1/1/1",
      "places:locality:v2:12/1/1/1", "places::12/1/1/1", "pois:hospital:12/1/1/1", "25081817B13159281784364", "", "places:locality:123/1/1/1", "places:locality:12/1/1/1/1",
    ];
    const any = new RegExp(sourceIdPattern("places"));
    for (const value of corpus) expect(any.test(value), value).toBe(parseMapSourceId("places", value).ok);
    const locality = new RegExp(sourceIdPattern("places", "locality"));
    expect(corpus.filter((value) => locality.test(value))).toEqual(["places:locality:12/2513/1735/2"]);
    expect(sourceIdPattern("places", "locality")).toBe("^places:locality:[0-9]{1,2}/[0-9]{1,7}/[0-9]{1,7}/[0-9]{1,9}$");
    expect(sourceIdPattern("roads")).toMatch(/^\^roads:/);
  });

  it("refuses to build a pattern from a kind or a layer that could change its meaning", () => {
    for (const kind of ["Locality", "a;b", "a.b", "", "1a", "a|b", "a b", "a".repeat(41), ".*"]) expect(() => sourceIdPattern("places", kind), kind).toThrow(RangeError);
    expect(() => sourceIdPattern("regions" as never)).toThrow(RangeError);
  });
});

describe("roles and layers", () => {
  it("maps each role namespace to its Map layer and leaves the others without one", () => {
    expect(["place:locality", "place", "poi:hospital", "road:major", "competitor:cafe", "population", "constraint:flood"].map(mapLayerForRole))
      .toEqual(["places", "places", "pois", "roads", "competitors", "population", null]);
    expect(mapLayerForRole("constructor")).toBeNull();
    expect(mapLayerForRole("__proto__:x")).toBeNull();
    expect(mapLayerForRole("")).toBeNull();
  });

  it("labels layers in English and falls back to the id for layers it does not know", () => {
    expect([mapLayerLabel("regions"), mapLayerLabel("boundary"), mapLayerLabel("places"), mapLayerLabel("heatmaps"), mapLayerLabel("constructor")]).toEqual(["Regions", "National boundary", "Places", "heatmaps", "constructor"]);
  });
});

describe("reviewed provenance", () => {
  it("accepts the Map's own records, key for key", () => {
    expect(mapProvenanceSchema.parse(osmProvenance)).toEqual(osmProvenance);
    expect(mapProvenanceSchema.parse(regionsProvenance)).toEqual(regionsProvenance);
  });

  it.each(["source", "organization", "url", "license", "attribution", "sourceDate", "importedAt"] as const)("is not reviewed without %s", (key) => {
    const rest = Object.fromEntries(Object.entries(osmProvenance).filter(([name]) => name !== key));
    expect(Object.keys(rest)).toHaveLength(Object.keys(osmProvenance).length - 1);
    expect(mapProvenanceSchema.safeParse(rest).success).toBe(false);
    expect(mapProvenanceSchema.safeParse({ ...osmProvenance, [key]: "" }).success).toBe(false);
    expect(mapProvenanceSchema.safeParse({ ...osmProvenance, [key]: "   " }).success).toBe(false);
  });

  it("rejects dates that are not instants and ignores members it does not know", () => {
    expect(mapProvenanceSchema.safeParse({ ...osmProvenance, sourceDate: "2026-10-17" }).success).toBe(false);
    expect(mapProvenanceSchema.safeParse({ ...osmProvenance, sourceDate: "yesterday" }).success).toBe(false);
    expect(mapProvenanceSchema.safeParse({ ...osmProvenance, importedAt: 5 }).success).toBe(false);
    expect(mapProvenanceSchema.parse({ ...osmProvenance, extra: "ignored" })).toEqual(osmProvenance);
  });
});

describe("boundary of a release", () => {
  it("reads the real record: unofficial, Saudi, checksummed, with the provenance of every dataset the release lists", () => {
    const boundary = realBoundary();
    expect(boundary).toMatchObject({
      id: "4b0ae84a-69b8-4c3c-8ebb-9f46ef2a88d8", countryCode: "SA", official: false, notice: NOTICE_TEXT, authorityText: AUTHORITY_TEXT, sha256: BOUNDARY_SHA256,
      authority: AUTHORITY_TEXT, source: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762",
    });
    expect(Object.keys(boundary.layerProvenance).sort()).toEqual(["base", "buildings", "governorates", "places", "pois", "regions", "roads"]);
    expect(boundary.layerProvenance.regions).toEqual(regionsProvenance);
    expect(boundary.provenance?.source).toBe("geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762");
    expect(boundary.boundingBox).toEqual({ west: 34.49440549999996, south: 16.379562200000038, east: 55.66669850000001, north: 32.154337700000035 });
  });

  it.each([
    ["authoritative and nothing else", { authoritative: true }, true],
    ["authoritative and not unofficial", { authoritative: true, unofficial: false }, true],
    ["authoritative and unofficial at once", { authoritative: true, unofficial: true }, false],
    ["not authoritative", { authoritative: false }, false],
    ["unofficial", { unofficial: true }, false],
    ["silent about both", {}, false],
    ["explicitly not unofficial but never authoritative", { unofficial: false }, false],
  ])("treats a boundary that is %s as official: %s", (_name, coverage, official) => {
    expect(isOfficialBoundary(coverage)).toBe(official);
  });

  it("is not official without coverage, or with coverage it cannot read, and then lists no reviewed layers", () => {
    expect(isOfficialBoundary(null)).toBe(false);
    for (const coverage of [null, "authoritative", 7, [], { authoritative: "true" }, { authoritative: 1 }, { countryCode: "saudi", authoritative: true }, { boundarySha256: "ABC" }]) {
      const boundary = interpretMapBoundary(realBoundaryRow({ coverage }));
      expect(boundary.official, JSON.stringify(coverage)).toBe(false);
      expect(boundary.layerProvenance).toEqual({});
      expect(boundary.countryCode).toBeNull();
      expect(boundary.authorityText).toBe(AUTHORITY_TEXT);
    }
  });

  it("reads an authoritative record as official, and only then", () => {
    expect(interpretMapBoundary(realBoundaryRow({ coverage: { countryCode: "SA", authoritative: true, boundaryAuthority: "Survey authority", layers: [] } }))).toMatchObject({ official: true, authorityText: "Survey authority" });
    expect(interpretMapBoundary(realBoundaryRow({ coverage: { ...realCoverage, authoritative: true } })).official).toBe(false);
  });

  it("lists only layers whose provenance is complete, and the first entry for a repeated layer", () => {
    const incomplete = Object.fromEntries(Object.entries(osmProvenance).filter(([name]) => name !== "source"));
    const boundary = interpretMapBoundary(realBoundaryRow({
      coverage: { ...realCoverage, layers: [{ id: "places", provenance: osmProvenance }, { id: "places", provenance: regionsProvenance }, { id: "pois", provenance: incomplete }, { id: "roads", provenance: null }] },
    }));
    expect(Object.keys(boundary.layerProvenance)).toEqual(["places"]);
    expect(boundary.layerProvenance.places).toEqual(osmProvenance);
  });

  it("keeps the bounding box only when it is a real, ordered box", () => {
    const box = (corners: Partial<{ west: number | null; south: number | null; east: number | null; north: number | null }>) => interpretMapBoundary(realBoundaryRow(corners)).boundingBox;
    expect(box({})).not.toBeNull();
    expect(box({ west: 60 })).toBeNull();
    expect(box({ south: 40 })).toBeNull();
    expect(box({ west: null })).toBeNull();
    expect(box({ east: Number.NaN })).toBeNull();
    expect(box({ north: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("validates the coverage record's own members", () => {
    expect(mapCoverageSchema.safeParse(realCoverage).success).toBe(true);
    expect(mapCoverageSchema.safeParse({ ...realCoverage, countryCode: "sa" }).success).toBe(false);
    expect(mapCoverageSchema.safeParse({ ...realCoverage, boundarySha256: "f".repeat(63) }).success).toBe(false);
    expect(mapCoverageSchema.safeParse({ ...realCoverage, layers: [{ provenance: osmProvenance }] }).success).toBe(false);
  });
});

describe("registration of a layer", () => {
  const registered = (description = realDescription(), layerId = "places") => {
    const layer = description.layers.find((entry) => entry.id === layerId) as MapLayerFacts;
    return assessMapRegistration(description, layer);
  };
  const reasons = (description = realDescription(), layerId = "places") => registered(description, layerId).reasons;

  it("registers the layers of the published, enabled release as the real Map describes them, with or without a display binding", () => {
    expect(registered(realDescription(), "places")).toEqual({ registered: true, reasons: [] });
    expect(registered(realDescription(), "regions")).toEqual({ registered: true, reasons: [] });
    expect(registered(realDescription(), "governorates")).toEqual({ registered: true, reasons: [] });
  });

  it("registers a layer whose binding carries a warning but is still enabled", () => {
    const description = realDescription();
    description.layers[2] = { ...description.layers[2] as MapLayerFacts, binding: { enabled: true, status: "warning", visibility: "public" } };
    expect(registered(description).registered).toBe(true);
  });

  it.each<[string, Parameters<typeof realDescription>[0], UnregisteredReason[]]>([
    ["the Map is disabled", { runtime: { ...publishedRuntime, status: "disabled" } }, ["MAP_NOT_ENABLED"]],
    ["the Map is in maintenance", { runtime: { ...publishedRuntime, status: "maintenance" } }, ["MAP_NOT_ENABLED"]],
    ["the Map has no runtime record", { runtime: null }, ["MAP_NOT_ENABLED", "RELEASE_NOT_ACTIVE"]],
    ["another release is the published one", { runtime: { ...publishedRuntime, publishedReleaseId: "00000000-0000-4000-8000-000000000000" } }, ["RELEASE_NOT_ACTIVE"]],
    ["nothing is published", { runtime: { ...publishedRuntime, publishedReleaseId: null } }, ["RELEASE_NOT_ACTIVE"]],
    ["the release is a draft", { release: { ...publishedRelease, status: "Draft" } }, ["RELEASE_NOT_PUBLISHED"]],
    ["the release has been archived", { release: { ...publishedRelease, status: "Archived" } }, ["RELEASE_NOT_PUBLISHED"]],
    ["there is no release", { release: null }, ["RELEASE_NOT_ACTIVE", "RELEASE_NOT_PUBLISHED"]],
  ])("does not register a layer when %s", (_name, over, expected) => {
    expect(reasons(realDescription(over))).toEqual(expected);
  });

  it("does not register a layer without reviewed provenance, or one whose binding the Map withdrew", () => {
    const description = realDescription();
    description.layers[2] = { ...description.layers[2] as MapLayerFacts, provenance: null };
    expect(reasons(description)).toEqual(["PROVENANCE_NOT_REVIEWED"]);
    for (const binding of [{ enabled: false, status: "ready" as const, visibility: "public" }, { enabled: true, status: "unavailable" as const, visibility: "public" }]) {
      const withdrawn = realDescription();
      withdrawn.layers[2] = { ...withdrawn.layers[2] as MapLayerFacts, binding };
      expect(reasons(withdrawn)).toEqual(["BINDING_WITHDRAWN"]);
    }
  });

  it("reports every reason at once, in a fixed order", () => {
    const description = realDescription({ runtime: { status: "disabled", publishedReleaseId: null }, release: { ...publishedRelease, status: "Archived" } });
    description.layers[2] = { ...description.layers[2] as MapLayerFacts, provenance: null, binding: { enabled: false, status: "unavailable", visibility: "public" } };
    expect(reasons(description)).toEqual(["MAP_NOT_ENABLED", "RELEASE_NOT_ACTIVE", "RELEASE_NOT_PUBLISHED", "PROVENANCE_NOT_REVIEWED", "BINDING_WITHDRAWN"]);
  });
});

describe("freshness defaults", () => {
  const evaluatedAt = "2026-10-20T12:00:00.000Z";
  const day = 86_400_000;

  it("applies the documented periods: a year for mapped places, five years for boundaries", () => {
    expect(MAP_FRESHNESS_DAYS).toEqual({ default: 365, boundary: 1825, regions: 1825, governorates: 1825 });
    expect(["places", "pois", "roads", "unknown"].map(mapFreshnessDays)).toEqual([365, 365, 365, 365]);
    expect(["boundary", "regions", "governorates"].map(mapFreshnessDays)).toEqual([1825, 1825, 1825]);
    for (const key of ["default", "constructor", "__proto__", "toString"]) expect(mapFreshnessDays(key)).toBe(365);
  });

  it("calls the real records fresh and stale as expected, and says how it decided", () => {
    expect(mapFreshness("2026-10-17T04:00:00.000Z", 365, evaluatedAt)).toEqual({ status: "FRESH", sourcePublishedAt: "2026-10-17T04:00:00.000Z", freshnessDays: 365, expiresAt: null });
    expect(mapFreshness("2017-01-01T00:00:00.000Z", 1825, evaluatedAt)).toEqual({ status: "STALE", sourcePublishedAt: "2017-01-01T00:00:00.000Z", freshnessDays: 1825, expiresAt: null });
  });

  it("is fresh up to and including the last day of the period, and stale after it", () => {
    const published = new Date(Date.parse(evaluatedAt) - 365 * day).toISOString();
    expect(mapFreshness(published, 365, evaluatedAt).status).toBe("FRESH");
    expect(mapFreshness(new Date(Date.parse(published) - 1).toISOString(), 365, evaluatedAt).status).toBe("STALE");
  });

  it("treats a source published after the evaluation instant as fresh", () => {
    expect(mapFreshness("2027-01-01T00:00:00.000Z", 365, evaluatedAt).status).toBe("FRESH");
  });

  it("is unknown, and says nothing about a date, when there is no usable date", () => {
    const unknown = { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null };
    expect(mapFreshness(null, 365, evaluatedAt)).toEqual(unknown);
    expect(mapFreshness("not a date", 365, evaluatedAt)).toEqual(unknown);
    expect(mapFreshness("2026-10-17T04:00:00.000Z", 365, "not a date")).toEqual(unknown);
  });
});

describe("the Map read contract", () => {
  const columnsOf = (): CatalogColumn[] => Object.entries(MAP_READ_CONTRACT.tables).flatMap(([table, columns]) => Object.entries(columns).map(([column, type]) => ({ table, column, type })));

  it("names the five tables and the exact types the adapter reads", () => {
    expect(MAP_CONTRACT_TABLES).toEqual(["runtime", "release", "boundary", "release_layer", "feature"]);
    expect(MAP_READ_CONTRACT.schema).toBe("jenan_map");
    expect(MAP_READ_CONTRACT.tables.feature).toMatchObject({ layerId: "text", sourceId: "text", geometry: "geometry(Geometry,4326)" });
    expect(MAP_READ_CONTRACT.tables.boundary).toMatchObject({ coverage: "jsonb", geometry: "geometry(MultiPolygon,4326)" });
  });

  it("is satisfied by a catalog that has exactly those columns, and by one that has more", () => {
    expect(findMapContractProblems(columnsOf())).toEqual([]);
    expect(findMapContractProblems([...columnsOf(), { table: "feature", column: "search", type: "tsvector" }, { table: "audit", column: "id", type: "uuid" }])).toEqual([]);
  });

  it("reports a missing table, a missing column and a changed type", () => {
    expect(findMapContractProblems(columnsOf().filter((entry) => entry.table !== "boundary"))).toEqual(["jenan_map.boundary is missing"]);
    expect(findMapContractProblems(columnsOf().filter((entry) => !(entry.table === "feature" && entry.column === "sourceId")))).toEqual(["jenan_map.feature.sourceId is missing"]);
    expect(findMapContractProblems(columnsOf().map((entry) => (entry.table === "feature" && entry.column === "geometry" ? { ...entry, type: "geometry(Geometry,3857)" } : entry))))
      .toEqual(["jenan_map.feature.geometry is geometry(Geometry,3857), expected geometry(Geometry,4326)"]);
    expect(findMapContractProblems([])).toHaveLength(5);
  });

  const realIndexes = [
    { table: "feature", name: "feature_release_idx", definition: 'CREATE INDEX feature_release_idx ON jenan_map.feature USING btree ("releaseId")' },
    { table: "feature", name: "feature_geometry_idx", definition: "CREATE INDEX feature_geometry_idx ON jenan_map.feature USING gist (geometry)" },
    { table: "feature", name: "feature_geography_idx", definition: "CREATE INDEX feature_geography_idx ON jenan_map.feature USING gist (((geometry)::geography))" },
    { table: "boundary", name: "boundary_geometry_idx", definition: "CREATE INDEX boundary_geometry_idx ON jenan_map.boundary USING gist (geometry)" },
  ];

  it("recognizes the Map's real indexes and reports a missing or different one", () => {
    expect(findMapIndexProblems(realIndexes)).toEqual([]);
    expect(findMapIndexProblems(realIndexes.filter((index) => index.name !== "feature_geography_idx"))).toEqual(["jenan_map.feature has no index feature_geography_idx"]);
    expect(findMapIndexProblems(realIndexes.map((index) => (index.name === "feature_geometry_idx" ? { ...index, definition: index.definition.replace("gist", "btree") } : index))))
      .toEqual(["feature_geometry_idx is not a gist index"]);
    expect(findMapIndexProblems(realIndexes.map((index) => (index.name === "feature_geography_idx" ? { ...index, definition: index.definition.replace("::geography", "") } : index))))
      .toEqual(["feature_geography_idx does not index (geometry)::geography"]);
  });
});

describe("the release id used by these fixtures", () => {
  it("is the real published release, and its description is the one the real database gives", () => {
    expect(RELEASE_ID).toBe("b3c4b6ff-7cee-4b42-95d3-c3683cf88a34");
    expect(realDescription().layers.map((layer) => [layer.id, layer.binding?.status ?? null])).toEqual([["regions", "ready"], ["governorates", null], ["places", "ready"]]);
  });
});
