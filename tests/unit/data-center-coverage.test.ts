import { describe, expect, it } from "vitest";
import { commandSchema, coverageFromColumns, coverageSchema, coverageToColumns, itemSchema, versionSchema } from "@/services/data-center/contracts";

const box = { west: 34.5, south: 16, east: 55.7, north: 32.2 };

describe("Data Center structured geographic coverage", () => {
  it("accepts ISO country and region codes with a WGS84 box and keeps nothing declared as nothing", () => {
    expect(coverageSchema.parse({ countryCodes: ["SA", "AE"], regionCodes: ["SA-01", "AE-AZ"], boundingBox: box })).toMatchObject({ countryCodes: ["SA", "AE"], boundingBox: box });
    expect(coverageSchema.parse({})).toEqual({ countryCodes: [], regionCodes: [] });
    expect(coverageFromColumns(coverageToColumns(undefined))).toBeNull();
    expect(coverageFromColumns(coverageToColumns(coverageSchema.parse({})))).toBeNull();
  });
  it("rejects malformed codes, duplicates and regions without their country", () => {
    for (const bad of [{ countryCodes: ["sa"] }, { countryCodes: ["SAU"] }, { countryCodes: ["S1"] }, { countryCodes: ["SA", "SA"] },
      { countryCodes: ["SA"], regionCodes: ["sa-01"] }, { countryCodes: ["SA"], regionCodes: ["SA01"] }, { countryCodes: ["SA"], regionCodes: ["SA-01", "SA-01"] },
      { countryCodes: ["AE"], regionCodes: ["SA-01"] }, { regionCodes: ["SA-01"] }, { countryCodes: Array.from({ length: 251 }, (_, i) => `${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`) }])
      expect(() => coverageSchema.parse(bad), JSON.stringify(bad).slice(0, 60)).toThrow();
  });
  it("validates the WGS84 box: ranges, ordering, completeness and finite numbers", () => {
    for (const boundingBox of [{ ...box, west: -181 }, { ...box, east: 181 }, { ...box, south: -91 }, { ...box, north: 91 }, { ...box, west: 60, east: 50 },
      { ...box, south: 40, north: 30 }, { west: 1, south: 1, east: 2 }, { ...box, west: Number.NaN }, { ...box, east: Number.POSITIVE_INFINITY }, { ...box, extra: 1 }])
      expect(() => coverageSchema.parse({ boundingBox }), JSON.stringify(boundingBox)).toThrow();
    expect(coverageSchema.parse({ boundingBox: { west: -180, south: -90, east: 180, north: 90 } }).boundingBox).toBeDefined();
    expect(coverageSchema.parse({ boundingBox: { west: 10, south: 20, east: 10, north: 20 } }).boundingBox).toBeDefined();
  });
  it("round-trips through canonical, order-independent database columns", () => {
    const columns = coverageToColumns(coverageSchema.parse({ countryCodes: ["SA", "AE"], regionCodes: ["SA-02", "SA-01"], boundingBox: box }));
    expect(columns).toEqual({ coverageCountries: ["AE", "SA"], coverageRegions: ["SA-01", "SA-02"], bboxWest: 34.5, bboxSouth: 16, bboxEast: 55.7, bboxNorth: 32.2 });
    expect(coverageFromColumns(columns)).toEqual({ crs: "WGS84", countryCodes: ["AE", "SA"], regionCodes: ["SA-01", "SA-02"], boundingBox: box });
    expect(coverageFromColumns({ ...columns, bboxNorth: null })).toMatchObject({ boundingBox: null });
    expect(coverageFromColumns({ ...columns, coverageCountries: [], coverageRegions: [], bboxWest: null, bboxSouth: null, bboxEast: null, bboxNorth: null })).toBeNull();
  });
  it("is accepted on items, versions and commands together with attribution, and nowhere else", () => {
    const item = { sourceId: "s", title: "Layer", typeKey: "dataset", layer: "DATA", content: "c", attribution: "© Atlas", coverage: { countryCodes: ["SA"], boundingBox: box } };
    expect(itemSchema.parse(item)).toMatchObject({ attribution: "© Atlas", coverage: { countryCodes: ["SA"] } });
    expect(itemSchema.parse({ ...item, attribution: undefined, coverage: undefined }).coverage).toBeUndefined();
    expect(versionSchema.parse({ itemId: "i", title: "Layer", content: "c", reason: "Updated extent", coverage: { countryCodes: ["SA"] } }).coverage?.countryCodes).toEqual(["SA"]);
    expect(commandSchema.parse({ ...item, action: "create-item" })).toMatchObject({ action: "create-item", attribution: "© Atlas" });
    expect(() => itemSchema.parse({ ...item, attribution: "   " })).toThrow();
    expect(() => itemSchema.parse({ ...item, coverage: { countryCodes: ["SA"], geometry: { type: "Polygon" } } })).toThrow();
  });
});
