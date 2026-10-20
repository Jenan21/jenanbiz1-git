import { describe, expect, it } from "vitest";
import { catalogProblems, createGap, sharedGapCatalog } from "@/services/analysis-engines/shared";
import { spatialGapCatalog, spatialOwnGapCatalog } from "@/services/analysis-engines/spatial/gaps";
import { verdictArabic, verdictEnglish } from "./support/analysis-engine-fixtures";

describe("spatial gap catalog", () => {
  it("adds the spatial gaps to the shared catalog without redefining any code", () => {
    expect(Object.keys(spatialOwnGapCatalog).sort()).toEqual([
      "ADMIN_AMBIGUOUS_ON_BOUNDARY", "ADMIN_NEAR_BOUNDARY", "ADMIN_TARGET_SPANS_UNITS", "ADMIN_UNIT_NOT_FOUND", "BOUNDARY_UNOFFICIAL", "DATASET_GEOMETRY_INVALID",
      "DATA_CENTER_COMPETING_DATASETS", "DATA_CENTER_CONTENT_INVALID", "DATA_CENTER_INTEGRITY_FAILED", "DATA_CENTER_NOT_IN_FORCE", "DATA_CENTER_PIN_CHANGED", "DATA_CENTER_TOO_MANY_CANDIDATES",
      "DATA_CENTER_VERSION_NOT_SPATIAL", "MAP_NOT_PUBLISHED", "MAP_SOURCE_ID_UNRECOGNIZED", "NETWORK_ANALYSIS_NOT_SUPPORTED", "ROAD_LABEL_POINTS_ONLY",
    ]);
    expect(Object.keys(spatialGapCatalog).sort()).toEqual([...Object.keys(sharedGapCatalog), ...Object.keys(spatialOwnGapCatalog)].sort());
    expect(Object.isFrozen(spatialGapCatalog)).toBe(true);
    for (const code of Object.keys(sharedGapCatalog)) expect(spatialGapCatalog[code as keyof typeof spatialGapCatalog]).toBe(sharedGapCatalog[code as keyof typeof sharedGapCatalog]);
  });

  it("is structurally sound", () => {
    expect(catalogProblems(spatialGapCatalog)).toEqual([]);
  });

  it("states facts about the data and never judges a location, recommends an action or prints a percentage", () => {
    for (const [code, definition] of Object.entries(spatialOwnGapCatalog)) {
      for (const value of [definition.message.en, definition.remedy.en]) { expect(value, code).not.toMatch(verdictEnglish); expect(value, code).not.toContain("%"); }
      for (const value of [definition.message.ar, definition.remedy.ar]) { expect(value, code).not.toMatch(verdictArabic); expect(value, code).toMatch(/[\u0600-\u06FF]/); expect(value, code).not.toContain("٪"); }
    }
  });

  it("grades each limitation as the design says", () => {
    expect(spatialGapCatalog.DATASET_GEOMETRY_INVALID.severity).toBe("BLOCKING");
    expect(spatialGapCatalog.MAP_NOT_PUBLISHED.severity).toBe("BLOCKING");
    expect(spatialGapCatalog.ROAD_LABEL_POINTS_ONLY.severity).toBe("WARNING");
    expect(spatialGapCatalog.NETWORK_ANALYSIS_NOT_SUPPORTED.severity).toBe("INFO");
    for (const code of ["ADMIN_AMBIGUOUS_ON_BOUNDARY", "ADMIN_NEAR_BOUNDARY", "ADMIN_TARGET_SPANS_UNITS", "ADMIN_UNIT_NOT_FOUND", "MAP_SOURCE_ID_UNRECOGNIZED"] as const) expect(spatialGapCatalog[code].severity).toBe("WARNING");
    // A Data Center dataset that cannot be used blocks the role; a choice made among equals is only reported.
    for (const code of ["DATA_CENTER_NOT_IN_FORCE", "DATA_CENTER_CONTENT_INVALID", "DATA_CENTER_INTEGRITY_FAILED", "DATA_CENTER_PIN_CHANGED", "DATA_CENTER_VERSION_NOT_SPATIAL", "DATA_CENTER_TOO_MANY_CANDIDATES"] as const) expect(spatialGapCatalog[code].severity, code).toBe("BLOCKING");
    expect(spatialGapCatalog.DATA_CENTER_COMPETING_DATASETS.severity).toBe("INFO");
  });

  it("explains each Data Center finding with its own names, in both languages, and promises nothing it did not do", () => {
    const invalid = createGap(spatialGapCatalog, "DATA_CENTER_CONTENT_INVALID", { dataset: "Hospitals", code: "INVALID_GEOJSON_COORDINATES" });
    expect(invalid.message.en).toBe("The content of Data Center version “Hospitals” is not valid WGS84 GeoJSON (code: INVALID_GEOJSON_COORDINATES); it was not used and nothing was repaired.");
    expect(invalid.message.ar).toContain("INVALID_GEOJSON_COORDINATES");
    expect(createGap(spatialGapCatalog, "DATA_CENTER_INTEGRITY_FAILED", { role: "poi:hospital" }).message.en).toContain("checksum does not match the stored content");
    expect(createGap(spatialGapCatalog, "DATA_CENTER_PIN_CHANGED", { role: "poi:hospital" }).message.en).toContain("was not replaced by another version");
    expect(createGap(spatialGapCatalog, "DATA_CENTER_NOT_IN_FORCE", { typeKey: "geojson", asOf: "2026-01-01T00:00:00.000Z", role: "poi:hospital" }).message.en).toContain("none was in force as of 2026-01-01T00:00:00.000Z");
    const competing = createGap(spatialGapCatalog, "DATA_CENTER_COMPETING_DATASETS", { count: 2, typeKey: "geojson", dataset: "Hospitals 2026", policy: "dc-version-selection-v1" });
    expect(competing.message.en).toContain("2 other Data Center dataset(s)");
    expect(competing.message.en).toContain("selected by the selection policy dc-version-selection-v1");
  });

  it("makes an unofficial boundary a limitation that must be shown with the value, not a footnote", () => {
    expect(spatialGapCatalog.BOUNDARY_UNOFFICIAL.severity).toBe("WARNING");
    const gap = createGap(spatialGapCatalog, "BOUNDARY_UNOFFICIAL", { dataset: "Regions (Map release provisionA-75d7a657)" });
    expect(gap.message.en).toContain("not an official boundary issued by a government authority");
    expect(gap.message.en).toContain("must be presented as based on unofficial boundaries");
    expect(gap.message.ar).toContain("غير رسمية");
  });

  it("says plainly what distances and boundaries are, so nobody mistakes them for road distance or an official boundary", () => {
    const road = createGap(spatialGapCatalog, "ROAD_LABEL_POINTS_ONLY", { dataset: "Roads" });
    expect(road.message.en).toContain("label points only, not a road network");
    expect(road.message.en).toContain("not road distances");
    expect(createGap(spatialGapCatalog, "NETWORK_ANALYSIS_NOT_SUPPORTED").message.en).toContain("straight line");
    expect(createGap(spatialGapCatalog, "DATASET_GEOMETRY_INVALID", { dataset: "X" }).message.en).toContain("cannot be used for measurement");
  });

  it("explains each administrative finding with its own numbers and names, in both languages", () => {
    const near = createGap(spatialGapCatalog, "ADMIN_NEAR_BOUNDARY", { unit: "Riyadh", distance: 312.4 });
    expect(near.message.en).toBe("The location is 312.4 m from the edge of “Riyadh”. The positional accuracy of the boundary data is not declared, so the assignment to this unit may differ from the one an official boundary would give.");
    expect(near.message.ar).toContain("312.4");
    expect(near.message.ar).toContain("«Riyadh»");
    expect(createGap(spatialGapCatalog, "ADMIN_AMBIGUOUS_ON_BOUNDARY", { units: "Alpha | Beta" }).message.en).toContain("(Alpha | Beta)");
    expect(createGap(spatialGapCatalog, "ADMIN_AMBIGUOUS_ON_BOUNDARY", { units: "Alpha | Beta" }).message.en).toContain("no single unit is stated");
    expect(createGap(spatialGapCatalog, "ADMIN_TARGET_SPANS_UNITS", { units: "Alpha | Beta" }).message.en).toContain("representative point");
    expect(createGap(spatialGapCatalog, "ADMIN_UNIT_NOT_FOUND", { dataset: "Governorates" }).message.en).toContain("no polygon of “Governorates” covers it");
    expect(createGap(spatialGapCatalog, "MAP_SOURCE_ID_UNRECOGNIZED", { count: 3, dataset: "Places" }).message.en).toContain("3 features of “Places”");
    expect(createGap(spatialGapCatalog, "MAP_NOT_PUBLISHED", { state: "disabled" }).message.en).toContain("(state: disabled)");
  });

  it("can render every code with the parameters its text names", () => {
    const parameters = { dataset: "D", role: "r", limit: 1, backend: "b", from: "f", to: "t", assumption: "a", unit: "U", units: "A | B", distance: 1.5, count: 2, state: "enabled", typeKey: "geojson", asOf: "2026-01-01T00:00:00.000Z", code: "INVALID_GEOJSON", policy: "dc-version-selection-v1" };
    for (const code of Object.keys(spatialGapCatalog) as Array<keyof typeof spatialGapCatalog>) {
      const gap = createGap(spatialGapCatalog, code, parameters);
      expect(gap.message.en).not.toMatch(/\{[A-Za-z]+\}/);
      expect(gap.message.ar).not.toMatch(/\{[A-Za-z]+\}/);
    }
  });
});
