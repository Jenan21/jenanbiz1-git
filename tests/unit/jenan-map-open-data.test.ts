import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import source from "../fixtures/jenan-map/saudi-source-excerpts.json";
import { importedFeature, OPEN_BOUNDARY_NOTICE, validateCoverage, validateProvenance } from "../../scripts/jenan-map/open-data.mjs";
import { normalizeFeatures } from "../../scripts/jenan-map/build.mjs";
import { boundaryLicense } from "../../scripts/jenan-map/prepare-open-data.mjs";
import { releaseLayerBindingSchema } from "@/services/jenan-map/layers";

const provenance = {
  source: "geoBoundaries gbOpen SAU ADM1 SAU-ADM1-25081817",
  organization: "geoBoundaries / William & Mary; OpenStreetMap, Wambacher",
  url: source.sourceUrl, sourceDate: "2017-01-01T00:00:00.000Z",
  importedAt: "2026-10-17T00:00:00.000Z", license: "ODbL-1.0", attribution: source.attribution,
};
const coverage = {
  countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0",
  coverageVerified: true, unofficial: true, notice: OPEN_BOUNDARY_NOTICE,
  boundaryAuthority: "geoBoundaries — unofficial", boundarySource: "Pinned geoBoundaries fixture metadata",
  boundarySha256: "a".repeat(64), provenance: {
    ...provenance, source: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762",
    url: source.sourceUrl.replaceAll("ADM1", "ADM0"),
  },
  layers: [{ id: "regions", provenance }],
};
const excerpt = { type: "Feature", properties: source.properties, geometry: { type: "Point", coordinates: source.firstSourceVertex } };

describe("Saudi source normalization and truthful open licensing", () => {
  it("preserves the real source identifier and English name without inventing Arabic translations", () => {
    const feature = importedFeature(excerpt, "geoBoundaries", "regions")!;
    const normalized = normalizeFeatures({ type: "FeatureCollection", features: [feature] }).features[0];
    expect(normalized.properties).toMatchObject({
      label: "Najran Region", aliases: ["Najran Region"], sourceId: source.properties.shapeID,
      source: "geoBoundaries", layerId: "regions", category: "regions",
    });
    expect(normalized.properties.name_ar).toBeUndefined();
    expect(normalized.geometry.coordinates).toEqual(source.firstSourceVertex);
  });
  it("retains both supplied Arabic/English names and alternate tags for the imported search vector", () => {
    // Constructed name tags exercise bilingual mechanics; they are not real OSM records.
    const feature = importedFeature({ ...excerpt, properties: {
      "@id": "fixture-node-1", name: "اسم اختباري", "name:ar": "اسم اختباري", "name:en": "Synthetic name", alt_name: "Alternate;Synthetic name",
    } }, "OpenStreetMap", "places")!;
    const normalized = normalizeFeatures({ type: "FeatureCollection", features: [feature] }).features[0];
    expect(normalized.properties).toMatchObject({
      label: "اسم اختباري", name_ar: "اسم اختباري", name_en: "Synthetic name",
      aliases: ["اسم اختباري", "Synthetic name", "Alternate"], sourceId: "fixture-node-1", category: "places",
    });
  });
  it("does not mislabel Saudi upstream ODbL and CC BY-SA as CC BY 4.0", () => {
    expect(boundaryLicense(source.adm1Metadata)).toBe("ODbL-1.0");
    expect(boundaryLicense(source.adm2Metadata)).toBe("CC-BY-SA-2.0");
    expect(boundaryLicense({ boundaryLicense: "Creative Commons Attribution 4.0" })).toBe("CC-BY-4.0");
    expect(() => boundaryLicense({ boundaryLicense: "Unknown" })).toThrow("Unreviewed");
  });
  it("requires dated per-layer license, attribution, organization and source URL", () => {
    expect(validateProvenance(provenance)).toEqual(provenance);
    for (const key of ["source", "organization", "url", "sourceDate", "importedAt", "license", "attribution"]) {
      expect(() => validateProvenance({ ...provenance, [key]: "" })).toThrow();
    }
    expect(() => validateProvenance({ ...provenance, sourceDate: "2999-01-01T00:00:00Z" })).toThrow();
    expect(() => validateProvenance({ ...provenance, url: "http://example.org" })).toThrow();
    expect(releaseLayerBindingSchema.parse({ id: "regions", styleLayerIds: ["regions"], provenance }).provenance).toEqual(provenance);
  });
  it("admits reviewed open-country coverage without asserting government authority", () => {
    expect(validateCoverage(coverage)).toMatchObject({ authoritative: false, unofficial: true });
    expect(() => validateCoverage({ ...coverage, coverageVerified: false })).toThrow();
    expect(() => validateCoverage({ ...coverage, unofficial: false })).toThrow();
    expect(() => validateCoverage({ ...coverage, boundarySha256: "" })).toThrow();
    expect(() => validateCoverage({ ...coverage, provenance })).toThrow(); // ADM1 cannot attest country coverage.
    expect(() => validateCoverage({ ...coverage, provenance: { ...provenance, attribution: "" } })).toThrow();
    expect(validateCoverage({ countryCode: "SA", authoritative: true, boundaryAuthority: "Legacy reviewed authority", boundarySource: "Legacy reviewed source" })).toMatchObject({ authoritative: true });
  });
  it("fails closed on internal records and missing original source identifiers", () => {
    expect(() => importedFeature({ ...excerpt, properties: { ...excerpt.properties, internal: true } }, "geoBoundaries", "regions")).toThrow();
    expect(() => importedFeature({ ...excerpt, properties: { name: "Unnamed source ID fixture" } }, "OpenStreetMap", "places")).toThrow();
    expect(() => normalizeFeatures({ type: "FeatureCollection", features: [{ ...excerpt, properties: { label: "Test", aliases: [""] } }] })).toThrow();
  });
});
