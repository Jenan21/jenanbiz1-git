import { describe, expect, it } from "vitest";
import { catalogProblems, createGap, sharedGapCatalog } from "@/services/analysis-engines/shared";
import { spatialGapCatalog, spatialOwnGapCatalog } from "@/services/analysis-engines/spatial/gaps";
import { verdictArabic, verdictEnglish } from "./support/analysis-engine-fixtures";

describe("spatial gap catalog", () => {
  it("adds the four spatial gaps to the shared catalog without redefining any code", () => {
    expect(Object.keys(spatialOwnGapCatalog).sort()).toEqual(["BOUNDARY_UNOFFICIAL", "DATASET_GEOMETRY_INVALID", "NETWORK_ANALYSIS_NOT_SUPPORTED", "ROAD_LABEL_POINTS_ONLY"]);
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
      for (const value of [definition.message.ar, definition.remedy.ar]) { expect(value, code).not.toMatch(verdictArabic); expect(value, code).toMatch(/[\u0600-\u06FF]/); }
    }
  });

  it("grades each limitation as the design says", () => {
    expect(spatialGapCatalog.DATASET_GEOMETRY_INVALID.severity).toBe("BLOCKING");
    expect(spatialGapCatalog.ROAD_LABEL_POINTS_ONLY.severity).toBe("WARNING");
    expect(spatialGapCatalog.BOUNDARY_UNOFFICIAL.severity).toBe("INFO");
    expect(spatialGapCatalog.NETWORK_ANALYSIS_NOT_SUPPORTED.severity).toBe("INFO");
  });

  it("says plainly what distances and boundaries are, so nobody mistakes them for road distance or an official boundary", () => {
    const road = createGap(spatialGapCatalog, "ROAD_LABEL_POINTS_ONLY", { dataset: "Roads" });
    expect(road.message.en).toContain("label points only, not a road network");
    expect(road.message.en).toContain("not road distances");
    expect(createGap(spatialGapCatalog, "NETWORK_ANALYSIS_NOT_SUPPORTED").message.en).toContain("straight line");
    expect(createGap(spatialGapCatalog, "BOUNDARY_UNOFFICIAL", { dataset: "geoBoundaries" }).message.en).toContain("not an official boundary");
    expect(createGap(spatialGapCatalog, "DATASET_GEOMETRY_INVALID", { dataset: "X" }).message.en).toContain("cannot be used for measurement");
  });

  it("can render every code with the parameters its text names", () => {
    const parameters = { dataset: "D", role: "r", limit: 1, backend: "b", from: "f", to: "t", assumption: "a" };
    for (const code of Object.keys(spatialGapCatalog) as Array<keyof typeof spatialGapCatalog>) {
      const gap = createGap(spatialGapCatalog, code, parameters);
      expect(gap.message.en).not.toMatch(/\{[A-Za-z]+\}/);
      expect(gap.message.ar).not.toMatch(/\{[A-Za-z]+\}/);
    }
  });
});
