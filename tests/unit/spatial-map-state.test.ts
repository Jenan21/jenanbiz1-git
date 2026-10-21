import { describe, expect, it } from "vitest";
import { compareText, deriveInputGaps, engineInputSchema } from "@/services/analysis-engines/shared";
import { buildMapBoundaryInput, buildMapLayerInput, mapInputId } from "@/services/analysis-engines/spatial/map-inputs";
import { resolveMapState } from "@/services/analysis-engines/spatial/map-state";
import type { MapDescription, MapLayerFacts } from "@/services/analysis-engines/spatial/map-contract";
import { evaluatedAt, verdictArabic, verdictEnglish } from "./support/analysis-engine-fixtures";
import { BOUNDARY_SHA256, publishedRelease, realBoundary, realBoundaryRow, realDescription, RELEASE_ID, osmProvenance } from "./support/spatial-map-fixtures";
import { interpretMapBoundary } from "@/services/analysis-engines/spatial/map-contract";

const boundary = realBoundary();
const layer = (layerKey: string, over: Record<string, unknown> = {}) => buildMapLayerInput({
  layerKey, roles: [layerKey === "places" ? "place:locality" : `admin:${layerKey === "regions" ? "region" : "governorate"}`], release: publishedRelease, boundary,
  provenance: boundary.layerProvenance[layerKey] ?? null, registered: true, evaluatedAt, ...over,
});

describe("Map input descriptors", () => {
  it("describes the regions layer exactly as the Map recorded it, and the result is a valid engine input", () => {
    const input = layer("regions");
    expect(engineInputSchema.parse(input)).toEqual(input);
    expect(input).toMatchObject({
      id: mapInputId(RELEASE_ID, "regions"), kind: "MAP_LAYER", governance: "MAP_REGISTERED", roles: ["admin:region"], checksum: null,
      ref: { system: "JENAN_MAP", id: `${RELEASE_ID}/regions`, version: null, label: "Regions (Map release provisionA-75d7a657)" },
      source: { name: "geoBoundaries gbOpen SAU ADM1 SAU-ADM1-25081817", organization: "geoBoundaries / William & Mary; upstream: OpenStreetMap, Wambacher", url: expect.stringContaining("geoBoundaries-SAU-ADM1") },
      ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: null, usagePolicy: null, allowExport: false, completeness: "UNKNOWN", evidenceStatus: null, quality: { status: "UNAVAILABLE" },
      coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: { west: 34.49440549999996, south: 16.379562200000038, east: 55.66669850000001, north: 32.154337700000035 } },
    });
    expect(input.attribution).toEqual({ text: expect.stringContaining("geoBoundaries / William & Mary"), required: true });
  });

  it("never infers a license class or an export right from a license text, and never invents a quality or completeness", () => {
    for (const key of ["regions", "governorates", "places"]) {
      const input = layer(key);
      expect(input.licenseClass).toBeNull();
      expect(input.allowExport).toBe(false);
      expect(input.completeness).toBe("UNKNOWN");
      expect(input.quality).toEqual({ status: "UNAVAILABLE" });
      expect(input.evidenceStatus).toBeNull();
      expect(input.usagePolicy).toBeNull();
    }
    const open = layer("places", { provenance: { ...osmProvenance, license: "CC0-1.0" } });
    expect(open.licenseClass).toBeNull();
    expect(open.allowExport).toBe(false);
  });

  it("grades freshness from the layer's own source date with the engine's documented period, and says the period is the engine's", () => {
    const regions = layer("regions");
    expect(regions.freshness).toEqual({ status: "STALE", sourcePublishedAt: "2017-01-01T00:00:00.000Z", freshnessDays: 1825, expiresAt: null });
    expect(regions.limitations).toContain("The freshness period of 1825 days is an engine default; the Map declares none.");
    const places = layer("places");
    expect(places.freshness).toEqual({ status: "FRESH", sourcePublishedAt: "2026-10-17T04:00:00.000Z", freshnessDays: 365, expiresAt: null });
    expect(places.limitations).toContain("The freshness period of 365 days is an engine default; the Map declares none.");
  });

  it("says plainly that an unofficial boundary is unofficial, with the Map's own words, and not that a place layer is", () => {
    const regions = layer("regions");
    expect(regions.limitations).toContain("Unofficial boundary: geoBoundaries open data — not a Saudi government authority.");
    expect(regions.limitations).toContain("Unofficial boundaries — حدود غير رسمية");
    expect(regions.limitations).toContain("The positional accuracy of the boundary data is not declared.");
    const places = layer("places");
    expect(places.limitations.some((line) => /unofficial|positional accuracy/i.test(line))).toBe(false);
    expect(places.limitations).toContain("No content checksum is recorded for this layer; a published Map release is not modified.");
  });

  it("keeps limitations unique and sorted, and clips what the Map recorded to what the contract allows", () => {
    const input = layer("regions");
    expect(input.limitations).toEqual([...new Set(input.limitations)].sort(compareText));
    const huge = layer("places", { provenance: { ...osmProvenance, source: "s".repeat(900), attribution: "a".repeat(9000), organization: "o".repeat(700), url: `https://example.test/${"u".repeat(2100)}` } });
    expect(engineInputSchema.safeParse(huge).success).toBe(true);
    expect(huge.source.name).toHaveLength(500);
    expect(huge.source.url).toBeNull();
    expect(huge.attribution.text).toHaveLength(4000);
  });

  it("falls back to the release's own source and license, and says so, when the release lists no reviewed provenance for a layer", () => {
    const input = layer("governorates", { provenance: null });
    expect(input.source).toEqual({ name: publishedRelease.source, organization: null, url: null });
    expect(input.license).toBe("ODbL-1.0");
    expect(input.attribution).toEqual({ text: null, required: false });
    expect(input.freshness).toMatchObject({ status: "FRESH", sourcePublishedAt: "2026-10-17T04:00:00.000Z" });
    expect(input.limitations).toContain("The release lists no reviewed provenance for this layer; the source and license of the release are shown instead.");
    expect(engineInputSchema.parse(input)).toEqual(input);
  });

  it("does not claim a freshness it cannot support", () => {
    const input = layer("places", { provenance: null, release: { ...publishedRelease, sourceDate: null } });
    expect(input.freshness).toEqual({ status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null });
    expect(deriveInputGaps(input).map((gap) => gap.code)).toContain("FRESHNESS_UNKNOWN");
  });

  it("marks a layer outside the published release as unregistered, and gives it its own id", () => {
    const input = layer("places", { registered: false });
    expect(input.governance).toBe("MAP_UNREGISTERED");
    expect(input.limitations.some((line) => line.startsWith("No content checksum"))).toBe(false);
    expect(layer("places", { release: { ...publishedRelease, id: "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b" } }).id).toBe("map:0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b:places");
  });

  it("describes the national boundary with its recorded checksum and its own provenance", () => {
    const input = buildMapBoundaryInput({ roles: ["admin:country"], release: publishedRelease, boundary, registered: true, evaluatedAt });
    expect(engineInputSchema.parse(input)).toEqual(input);
    expect(input).toMatchObject({
      id: mapInputId(RELEASE_ID, "boundary"), roles: ["admin:country"], checksum: { algorithm: "SHA-256", value: BOUNDARY_SHA256 }, ref: { label: "National boundary (Map release provisionA-75d7a657)" },
      source: { name: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762" },
    });
    expect(input.limitations).toContain("Unofficial boundary: geoBoundaries open data — not a Saudi government authority.");
    const noChecksum = buildMapBoundaryInput({ roles: ["admin:country"], release: publishedRelease, boundary: { ...boundary, sha256: "not-a-digest" }, registered: true, evaluatedAt });
    expect(noChecksum.checksum).toBeNull();
  });

  it("states no coverage rather than a made-up one when the boundary declares none", () => {
    const bare = interpretMapBoundary(realBoundaryRow({ coverage: "garbage", west: null, south: null, east: null, north: null }));
    const input = layer("places", { boundary: bare });
    expect(input.coverage).toBeNull();
    expect(deriveInputGaps(input).map((gap) => gap.code)).toContain("COVERAGE_UNDECLARED");
    expect(layer("places", { boundary: null }).coverage).toBeNull();
  });

  it("sorts and de-duplicates the roles it is given", () => {
    expect(layer("places", { roles: ["place:locality", "place", "place:locality"] }).roles).toEqual(["place", "place:locality"]);
  });

  it("follows the engine's wording rule: facts about the data, no verdicts", () => {
    for (const key of ["regions", "governorates", "places"]) for (const line of layer(key).limitations) { expect(line).not.toMatch(verdictEnglish); expect(line).not.toContain("%"); }
    expect(layer("regions").limitations.join(" ")).not.toMatch(verdictArabic);
  });
});

describe("Map state for LOCATION_CONTEXT", () => {
  const withLayer = (id: string, patch: Partial<MapLayerFacts> | null, base: MapDescription = realDescription()): MapDescription => ({
    ...base, layers: patch === null ? base.layers.filter((entry) => entry.id !== id) : base.layers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  });
  const resolve = (published: MapDescription, over: Partial<Parameters<typeof resolveMapState>[0]> = {}) => resolveMapState({
    published, pinned: new Map(), placeRoles: [{ role: "place:locality", releaseId: null }], policy: "REGISTERED_ONLY", evaluatedAt, ...over,
  });
  const codes = (resolved: ReturnType<typeof resolve>) => resolved.gaps.map((gap) => gap.code);

  it("resolves the real published release into a boundary, two administrative levels and one place input, with no gap of its own", () => {
    const resolved = resolve(realDescription(), { placeRoles: [{ role: "place:locality", releaseId: null }, { role: "place", releaseId: null }] });
    expect(resolved.gaps).toEqual([]);
    expect(resolved.state.publishedReleaseId).toBe(RELEASE_ID);
    expect(resolved.inputs.map((input) => input.id)).toEqual([`map:${RELEASE_ID}:boundary`, `map:${RELEASE_ID}:governorates`, `map:${RELEASE_ID}:places`, `map:${RELEASE_ID}:regions`]);
    expect(resolved.inputs.every((input) => input.governance === "MAP_REGISTERED")).toBe(true);
    expect(resolved.inputs.find((input) => input.id.endsWith(":places"))?.roles).toEqual(["place", "place:locality"]);
    expect(resolved.state.places.map((entry) => entry.role)).toEqual(["place", "place:locality"]);
    expect(resolved.state.levels.governorates.available).toBe(true);
  });

  it("treats a data-only layer (reviewed provenance, features, no display binding) as registered", () => {
    const resolved = resolve(realDescription());
    const governorates = resolved.state.levels.governorates;
    expect(governorates.available && governorates.input.governance).toBe("MAP_REGISTERED");
  });

  it("excludes an unregistered layer in production, says which role has no data and that unregistered layers were excluded", () => {
    const withdrawn = withLayer("places", { binding: { enabled: false, status: "ready", visibility: "public" } });
    const resolved = resolve(withdrawn);
    expect(resolved.state.places[0]?.layer.available).toBe(false);
    expect(codes(resolved)).toEqual(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]);
    expect(resolved.gaps[0]?.message.en).toContain("place:locality");
    expect(resolved.inputs.some((input) => input.id.endsWith(":places"))).toBe(false);
  });

  it("uses an unregistered layer outside production, labelled as unregistered", () => {
    const withdrawn = withLayer("places", { binding: { enabled: true, status: "unavailable", visibility: "public" } });
    const resolved = resolve(withdrawn, { policy: "ALLOW_UNREGISTERED" });
    const places = resolved.state.places[0]?.layer;
    expect(places?.available && places.input.governance).toBe("MAP_UNREGISTERED");
    expect(codes(resolved)).toEqual([]);
  });

  it.each([
    ["has no reviewed provenance", { provenance: null }],
  ])("treats a layer that %s as unregistered", (_label, patch) => {
    const production = resolve(withLayer("regions", patch));
    expect(production.state.levels.regions.available).toBe(false);
    expect(codes(production)).toEqual(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]);
    const development = resolve(withLayer("regions", patch), { policy: "ALLOW_UNREGISTERED" });
    const regions = development.state.levels.regions;
    expect(regions.available && regions.input).toMatchObject({ governance: "MAP_UNREGISTERED", source: { name: publishedRelease.source } });
  });

  it("has no data for a layer without features or one the release does not list, whatever the policy, and does not call that an exclusion", () => {
    for (const policy of ["REGISTERED_ONLY", "ALLOW_UNREGISTERED"] as const) {
      const empty = resolve(withLayer("regions", { hasFeatures: false }), { policy });
      expect(empty.state.levels.regions.available).toBe(false);
      expect(codes(empty)).toEqual(["DATASET_NOT_AVAILABLE"]);
      expect(resolve(withLayer("places", null), { policy }).state.places[0]?.layer.available).toBe(false);
    }
  });

  it("says the Map is not published, with its state, and has no Map data when the Map is off", () => {
    const off = resolve({ runtime: { status: "disabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] });
    expect(codes(off)).toEqual(["DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "MAP_NOT_PUBLISHED"]);
    const message = (resolved: ReturnType<typeof resolve>) => resolved.gaps.find((gap) => gap.code === "MAP_NOT_PUBLISHED")?.message.en;
    expect(message(off)).toContain("(state: disabled)");
    expect(off.state.publishedReleaseId).toBeNull();
    expect(off.inputs).toEqual([]);
    expect(message(resolve({ runtime: null, release: null, boundary: null, layers: [] }))).toContain("(state: not configured)");
    expect(message(resolve({ runtime: { status: "enabled", publishedReleaseId: null }, release: null, boundary: null, layers: [] }))).toContain("(state: no published release)");
  });

  it("excludes everything in production while the Map is in maintenance, and still describes the published release elsewhere", () => {
    const maintenance = realDescription({ runtime: { status: "maintenance", publishedReleaseId: RELEASE_ID } });
    const production = resolve(maintenance);
    expect(codes(production)).toEqual(["DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE", "MAP_NOT_PUBLISHED", "UNREGISTERED_LAYERS_EXCLUDED"]);
    expect(production.inputs).toEqual([]);
    const development = resolve(maintenance, { policy: "ALLOW_UNREGISTERED" });
    expect(codes(development)).toEqual(["MAP_NOT_PUBLISHED"]);
    expect(development.inputs).toHaveLength(4);
    expect(development.inputs.every((input) => input.governance === "MAP_UNREGISTERED")).toBe(true);
  });

  it("has no national boundary when the release holds none, and keeps the levels", () => {
    const resolved = resolve(realDescription({ boundary: null }));
    expect(resolved.state.boundary.available).toBe(false);
    expect(resolved.state.boundaryFacts).toBeNull();
    expect(resolved.state.levels.regions.available).toBe(true);
    expect(codes(resolved)).toContain("DATASET_NOT_AVAILABLE");
    expect(resolved.gaps.find((gap) => gap.code === "DATASET_NOT_AVAILABLE")?.message.en).toContain("admin:country");
  });

  it("does not register a boundary without reviewed provenance", () => {
    const noProvenance = realDescription({ boundary: interpretMapBoundary(realBoundaryRow({ coverage: { ...(realBoundaryRow().coverage as Record<string, unknown>), provenance: undefined } })) });
    expect(resolve(noProvenance).state.boundary.available).toBe(false);
    const development = resolve(noProvenance, { policy: "ALLOW_UNREGISTERED" }).state.boundary;
    expect(development.available && development.input.governance).toBe("MAP_UNREGISTERED");
  });

  it("reads a pinned release for its place roles and keeps it apart from the published one", () => {
    const otherId = "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b";
    const pinnedDescription: MapDescription = { runtime: realDescription().runtime, release: { ...publishedRelease, id: otherId, status: "Ready", publishedAt: null }, boundary: boundary, layers: [{ id: "places", provenance: osmProvenance, binding: null, hasFeatures: true }] };
    const roles = [{ role: "place:locality", releaseId: otherId }, { role: "place:neighbourhood", releaseId: null }];
    const production = resolve(realDescription(), { placeRoles: roles, pinned: new Map([[otherId, pinnedDescription]]) });
    expect(production.state.places.map((entry) => [entry.role, entry.layer.available])).toEqual([["place:locality", false], ["place:neighbourhood", true]]);
    expect(codes(production)).toEqual(["DATASET_NOT_AVAILABLE", "UNREGISTERED_LAYERS_EXCLUDED"]);
    const development = resolve(realDescription(), { placeRoles: roles, pinned: new Map([[otherId, pinnedDescription]]), policy: "ALLOW_UNREGISTERED" });
    const pinnedInput = development.state.places[0]?.layer;
    expect(pinnedInput?.available && pinnedInput.input).toMatchObject({ id: `map:${otherId}:places`, governance: "MAP_UNREGISTERED", roles: ["place:locality"] });
    expect(development.inputs.map((input) => input.id)).toContain(`map:${RELEASE_ID}:places`);
  });

  it("treats a pin to the published release itself as no pin, so its roles share one input", () => {
    const resolved = resolve(realDescription(), { placeRoles: [{ role: "place:locality", releaseId: RELEASE_ID }, { role: "place:neighbourhood", releaseId: null }], pinned: new Map([[RELEASE_ID, realDescription()]]) });
    const places = resolved.inputs.filter((input) => input.id.endsWith(":places"));
    expect(places).toHaveLength(1);
    expect(places[0]?.roles).toEqual(["place:locality", "place:neighbourhood"]);
    expect(resolved.state.places.every((entry) => entry.layer.available)).toBe(true);
  });

  it("has no data for a pinned release that cannot be described or does not exist", () => {
    const otherId = "0f3b2c1a-5d4e-4f60-8a9b-1c2d3e4f5a6b";
    const missing = resolve(realDescription(), { placeRoles: [{ role: "place:locality", releaseId: otherId }, { role: "place", releaseId: otherId }] });
    expect(missing.state.places.map((entry) => entry.layer.available)).toEqual([false, false]);
    expect(codes(missing)).toEqual(["DATASET_NOT_AVAILABLE", "DATASET_NOT_AVAILABLE"]);
    const absent = resolve(realDescription(), { placeRoles: [{ role: "place:locality", releaseId: otherId }], pinned: new Map([[otherId, { runtime: null, release: null, boundary: null, layers: [] }]]) });
    expect(absent.state.places[0]?.layer.available).toBe(false);
  });

  it("asks for no place input when no place role is requested", () => {
    const resolved = resolve(realDescription(), { placeRoles: [] });
    expect(resolved.state.places).toEqual([]);
    expect(resolved.inputs.map((input) => input.id)).toEqual([`map:${RELEASE_ID}:boundary`, `map:${RELEASE_ID}:governorates`, `map:${RELEASE_ID}:regions`]);
  });

  it("is deterministic: the same description always resolves to the same state", () => {
    expect(resolve(realDescription())).toEqual(resolve(realDescription()));
  });
});
