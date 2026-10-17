import { expect, it } from "vitest";
import { bindStyle, normalizeFeatures, validPmtilesHeader, validateLayerBindings } from "@/scripts/jenan-map/build.mjs";

const fixture = (classification: Record<string, unknown>) => ({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { label: "Isolated synthetic test geometry", category: "test", ...classification },
    geometry: { type: "Point", coordinates: [46, 24] },
  }],
});

it.each([{ visibility: "internal" }, { internal: true }, { publicSafe: false }])(
  "rejects private classification before property normalization can strip it: %j",
  (classification) => {
    expect(() => normalizeFeatures(fixture(classification))).toThrow("Internal features");
  },
);

it("normalizes the explicit public test fixture without inventing source properties", () => {
  const normalized = normalizeFeatures(fixture({ visibility: "public", publicSafe: true }));
  expect(normalized.features[0].properties).toEqual({
    label: "Isolated synthetic test geometry", category: "test",
  });
});

it("validates PMTiles v3 headers and refuses empty or out-of-bounds archives", () => {
  const header = Buffer.alloc(128);
  header.write("PMTiles", 0, "ascii");
  header[7] = 3;
  header.writeBigUInt64LE(BigInt(127), 8);
  header.writeBigUInt64LE(BigInt(1), 16);
  header.writeBigUInt64LE(BigInt(128), 24);
  header.writeBigUInt64LE(BigInt(128), 40);
  header.writeBigUInt64LE(BigInt(128), 56);
  header.writeBigUInt64LE(BigInt(1), 72);
  header.writeInt32LE(340_000_000, 102);
  header.writeInt32LE(560_000_000, 106);
  header.writeInt32LE(160_000_000, 110);
  header.writeInt32LE(330_000_000, 114);
  expect(validPmtilesHeader(header, header.length)).toBe(true);
  expect(validPmtilesHeader(header.subarray(0, 126), header.length)).toBe(false);
  header[7] = 2;
  expect(validPmtilesHeader(header, header.length)).toBe(false);
});

it("binds only existing style layers to stored catalog keys and owned PMTiles/glyph routes", () => {
  const style = {
    version: 8,
    glyphs: "jenan-map-glyphs://{fontstack}/{range}.pbf",
    sources: { saudi: { type: "vector", url: "pmtiles://saudi.pmtiles" } },
    layers: [
      { id: "background", type: "background" },
      { id: "road-line", type: "line", source: "saudi" },
    ],
  };
  expect(validateLayerBindings(style, { base: ["background"], roads: ["road-line"] })).toEqual([
    { id: "base", styleLayerIds: ["background"] },
    { id: "roads", styleLayerIds: ["road-line"] },
  ]);
  expect(() => validateLayerBindings(style, { fake: ["road-line"] })).toThrow();
  expect(() => validateLayerBindings(style, { roads: ["missing"] })).toThrow();
  const bound = bindStyle(style, "release-id", "saudi.pmtiles", "artifact-id", [{ kind: "glyphs" }]);
  expect(bound).toMatchObject({
    sources: { saudi: { url: "pmtiles:///api/jenan-map/artifacts/artifact-id" } },
    glyphs: "/api/jenan-map/releases/release-id/glyphs/{fontstack}/{range}.pbf",
  });
});
