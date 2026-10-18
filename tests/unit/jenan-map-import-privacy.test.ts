import { expect, it } from "vitest";
import { normalizeFeatures } from "@/scripts/jenan-map/build.mjs";

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
