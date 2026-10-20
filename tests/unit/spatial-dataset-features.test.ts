import { describe, expect, it } from "vitest";
import type { DataCenterGeoFeature } from "@/services/data-center/contracts";
import { checkDatasetFeatures, MAX_DATASET_FEATURES, targetGeography } from "@/services/analysis-engines/spatial/dataset-features";
import { geoFeature, geoFeatures } from "./support/spatial-fake-dc-port";
import { riyadh, square } from "./support/spatial-request-fixtures";

describe("the features of a Data Center dataset, as the engine requires them", () => {
  it("keeps every feature with its position in the content, its id when it has a usable one, its properties and its geometry", () => {
    const features: DataCenterGeoFeature[] = [
      geoFeature(0), { ...geoFeature(1), id: "hospital-7" } as DataCenterGeoFeature, { ...geoFeature(2), id: 42 } as DataCenterGeoFeature, { ...geoFeature(3), id: { nested: true } } as DataCenterGeoFeature,
      { ...geoFeature(4), id: "" } as DataCenterGeoFeature, { ...geoFeature(5), id: "x".repeat(129) } as DataCenterGeoFeature, { ...geoFeature(6), id: Number.NaN } as DataCenterGeoFeature, geoFeature(7, { properties: null }),
    ];
    const checked = checkDatasetFeatures(features);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.features.map((feature) => [feature.index, feature.id])).toEqual([[0, null], [1, "hospital-7"], [2, "42"], [3, null], [4, null], [5, null], [6, null], [7, null]]);
    expect(checked.features[0]).toEqual({ index: 0, id: null, properties: { name: "Hospital 0" }, geometry: { type: "Point", coordinates: [46.6, 24.7] } });
    expect(checked.features[7]?.properties).toBeNull();
  });

  it("accepts points, lines and polygons alike: which geometry a role needs is decided by the analysis that uses it", () => {
    const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
    const checked = checkDatasetFeatures([
      geoFeature(0, { geometry: { type: "MultiPoint", coordinates: [[1, 1]] } }), geoFeature(1, { geometry: { type: "LineString", coordinates: [[1, 1], [2, 2]] } }),
      geoFeature(2, { geometry: { type: "Polygon", coordinates: [ring] } }), geoFeature(3, { geometry: { type: "MultiPolygon", coordinates: [[ring]] } }),
    ]);
    expect(checked.ok).toBe(true);
  });

  it.each<[string, DataCenterGeoFeature[], string, number | null]>([
    ["no features at all", [], "NO_FEATURES", null],
    ["a feature without a geometry", [geoFeature(0), geoFeature(1, { geometry: null }), geoFeature(2)], "FEATURE_WITHOUT_GEOMETRY", 1],
    ["a geometry collection", [geoFeature(0), geoFeature(1), geoFeature(2, { geometry: { type: "GeometryCollection", geometries: [] } })], "GEOMETRY_COLLECTION_NOT_SUPPORTED", 2],
  ])("refuses the whole dataset for %s, and says which feature, instead of skipping it", (_name, features, code, index) => {
    expect(checkDatasetFeatures(features)).toEqual({ ok: false, code, index });
  });

  it("refuses a dataset with more features than the Data Center allows, and accepts one at the limit", () => {
    expect(checkDatasetFeatures(geoFeatures(MAX_DATASET_FEATURES)).ok).toBe(true);
    expect(checkDatasetFeatures(geoFeatures(MAX_DATASET_FEATURES + 1))).toEqual({ ok: false, code: "TOO_MANY_FEATURES", index: null });
  });

  it("does not change the features it is given", () => {
    const features = geoFeatures(2);
    const before = JSON.stringify(features);
    checkDatasetFeatures(features);
    expect(JSON.stringify(features)).toBe(before);
  });
});

describe("the geography of the targets, for discovering the datasets that cover them", () => {
  const box = (location: Parameters<typeof targetGeography>[0][number], margin: number) => targetGeography([location], margin).boundingBox!;

  it("is the box of the target widened by the distance the analysis looks around it", () => {
    const point = box({ type: "Point", coordinates: [46.7, 24.7] }, 5000);
    expect(point.south).toBeCloseTo(24.7 - 5000 / 111_320, 6);
    expect(point.north).toBeCloseTo(24.7 + 5000 / 111_320, 6);
    // A degree of longitude is shorter than a degree of latitude, so the box is wider than it is tall, in degrees.
    expect(point.east - 46.7).toBeGreaterThan(point.north - 24.7);
    expect(point.east - 46.7).toBeCloseTo(46.7 - point.west, 9);
    const area = box({ type: "Polygon", coordinates: [square(46.6, 24.6, 0.2)] }, 0);
    expect([area.west, area.south, area.east, area.north].map((value) => Number(value.toFixed(9)))).toEqual([46.6, 24.6, 46.8, 24.8]);
  });

  it("covers every target of the request, and only widens, never narrows", () => {
    const geography = targetGeography([{ type: "Point", coordinates: [46.7, 24.7] }, { type: "Point", coordinates: [39.2, 21.5] }, riyadh], 1000).boundingBox!;
    expect(geography.west).toBeLessThan(39.2);
    expect(geography.east).toBeGreaterThan(46.7);
    expect(geography.south).toBeLessThan(21.5);
    expect(geography.north).toBeGreaterThan(24.7);
    expect(Object.keys(targetGeography([riyadh], 1000))).toEqual(["boundingBox"]);
  });

  it("stays on the globe", () => {
    const edge = box({ type: "Point", coordinates: [179.99, 89.9] }, 50_000);
    expect(edge.east).toBe(180);
    expect(edge.north).toBe(90);
    const other = box({ type: "Point", coordinates: [-179.99, -89.9] }, 50_000);
    expect(other.west).toBe(-180);
    expect(other.south).toBe(-90);
  });

  it("is a valid filter for the Data Center: west is not east of east and south is not north of north", () => {
    for (const margin of [0, 500, 50_000]) {
      const geography = box({ type: "Point", coordinates: [46.7, 24.7] }, margin);
      expect(geography.west).toBeLessThanOrEqual(geography.east);
      expect(geography.south).toBeLessThanOrEqual(geography.north);
    }
  });
});
