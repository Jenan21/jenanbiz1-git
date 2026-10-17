import { describe, expect, it } from "vitest";
import { canTransitionRelease, isSafeMapLayerKey, isSafeMapVersion, licenseAllowsPublication } from "@/lib/jenan-pro-map/domain";
import { compareGeoJson, normalizeGeoJson } from "@/lib/jenan-pro-map/geojson";

const feature = (id: string, name: string, longitude = 46) => ({
  type: "Feature",
  id,
  properties: { name },
  geometry: { type: "Point", coordinates: [longitude, 24] },
});

describe("Jenan PRO Map release governance", () => {
  it("permits only explicit lifecycle transitions", () => {
    expect(canTransitionRelease("DRAFT", "PROCESSING")).toBe(true);
    expect(canTransitionRelease("READY_FOR_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionRelease("APPROVED", "PUBLISHED")).toBe(true);
    expect(canTransitionRelease("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionRelease("PUBLISHED", "DRAFT")).toBe(false);
  });

  it("requires an explicit reviewed internal-use license before publication", () => {
    expect(licenseAllowsPublication({ internalUseAllowed: true, licenseReviewedAt: new Date() })).toBe(true);
    expect(licenseAllowsPublication({ internalUseAllowed: null, licenseReviewedAt: null })).toBe(false);
    expect(licenseAllowsPublication({ internalUseAllowed: false, licenseReviewedAt: new Date() })).toBe(false);
  });

  it("rejects unsafe identifiers before using them as records", () => {
    expect(isSafeMapLayerKey("roads_primary")).toBe(true);
    expect(isSafeMapLayerKey("../private")).toBe(false);
    expect(isSafeMapVersion("sa-v1.2")).toBe(true);
    expect(isSafeMapVersion("..")).toBe(false);
  });
});

describe("Jenan PRO Map GeoJSON intake and comparison", () => {
  it("normalizes a valid FeatureCollection deterministically", () => {
    const first = normalizeGeoJson({ type: "FeatureCollection", features: [feature("a", "Riyadh")] });
    const second = normalizeGeoJson({ type: "FeatureCollection", features: [{ ...feature("a", "Riyadh"), properties: { name: "Riyadh" } }] });
    expect(first.collection.features).toHaveLength(1);
    expect(first.json).toBe(second.json);
  });

  it("rejects invalid coordinates and unclosed polygon rings", () => {
    expect(() =>
      normalizeGeoJson({
        type: "FeatureCollection",
        features: [{ ...feature("a", "bad"), geometry: { type: "Point", coordinates: [200, 24] } }],
      }),
    ).toThrow(/unsupported or invalid geometry/i);
    expect(() =>
      normalizeGeoJson({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: "a",
          properties: {},
          geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
        }],
      }),
    ).toThrow(/unsupported or invalid geometry/i);
  });

  it("reports added, changed, and removed features only when stable IDs exist", () => {
    const previous = normalizeGeoJson({
      type: "FeatureCollection",
      features: [feature("same", "Old"), feature("removed", "Old place")],
    }).collection;
    const current = normalizeGeoJson({
      type: "FeatureCollection",
      features: [feature("same", "Updated"), feature("added", "New place")],
    }).collection;
    expect(compareGeoJson(current, previous)).toEqual({ status: "COMPUTED", added: 1, changed: 1, removed: 1 });
    expect(compareGeoJson(current, null)).toMatchObject({ status: "NOT_COMPUTED" });
    expect(compareGeoJson(normalizeGeoJson({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } }],
    }).collection, previous)).toMatchObject({ status: "NOT_COMPUTED" });
  });
});
