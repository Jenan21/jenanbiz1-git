import { afterEach, describe, expect, it } from "vitest";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { setProjectIntelligenceProvider } from "@/services/projects/project-intelligence-provider";

const currentYear = new Date().getUTCFullYear();

afterEach(() => {
  setProjectIntelligenceProvider({
    getJson: async () => { throw new Error("No test provider configured"); },
  });
});

describe("project intelligence data quality", () => {
  it("keeps valid indicators when another fails and rejects invalid provider records", async () => {
    setProjectIntelligenceProvider({
      getJson: async <T>(url: string) => {
        if (url.includes("nominatim")) return [{ lat: "24.7", lon: "46.6", display_name: "Riyadh" }] as T;
        if (url.includes("SP.POP.TOTL")) throw new Error("Population provider unavailable");
        if (url.includes("NY.GNP.PCAP.PP.CD")) {
          return [{}, [
            { value: 0, date: String(currentYear) },
            { value: Number.POSITIVE_INFINITY, date: String(currentYear - 1) },
            { value: 1000, date: "2035" },
          ]] as T;
        }
        if (url.includes("FP.CPI.TOTL.ZG")) {
          return [{}, [{ value: -1.5, date: String(currentYear) }]] as T;
        }
        if (url.includes("overpass")) {
          return {
            elements: [
              { tags: { name: "Valid nearby listing", shop: "retail" }, lat: 24.71, lon: 46.61 },
              { tags: { name: "Missing coordinates" } },
              { tags: { name: "Invalid coordinates" }, lat: Number.NaN, lon: 46.62 },
            ],
          } as T;
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "retail" });

    expect(result.population).toEqual({ value: null, year: null });
    expect(result.purchasingPower).toEqual({ value: null, year: null, metric: "GNI per capita, PPP (current international $)" });
    expect(result.costInflation).toMatchObject({ value: -1.5, year: currentYear });
    expect(result.competitors).toEqual([{ name: "Valid nearby listing", category: "retail", latitude: 24.71, longitude: 46.61 }]);
    expect(result.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("population data could not be loaded"),
      expect.stringContaining("no valid purchasing power observation"),
      expect.stringContaining("not independently verified competitors"),
    ]));
    expect(result.sources.map((source) => source.source)).toEqual(expect.arrayContaining([
      "World Bank Open Data — purchasing power",
      "World Bank Open Data — cost inflation",
    ]));
  });

  it("selects the newest valid observation and downgrades stale indicators", async () => {
    setProjectIntelligenceProvider({
      getJson: async <T>(url: string) => {
        if (url.includes("nominatim")) return [] as T;
        if (url.includes("SP.POP.TOTL")) {
          return [{}, [
            { value: 10, date: String(currentYear - 1) },
            { value: 9, date: String(currentYear - 4) },
          ]] as T;
        }
        if (url.includes("NY.GNP.PCAP.PP.CD")) return [{}, [{ value: 20, date: String(currentYear - 6) }]] as T;
        if (url.includes("FP.CPI.TOTL.ZG")) return [{}, [{ value: 3, date: String(currentYear - 4) }]] as T;
        throw new Error(`Unexpected URL: ${url}`);
      },
    });

    const result = await searchProjectIntelligence({ query: "A city", countryCode: "SA" });

    expect(result.population).toEqual({ value: 10, year: currentYear - 1 });
    expect(result.purchasingPower.year).toBe(currentYear - 6);
    expect(result.sources.find((source) => source.source.endsWith("purchasing power"))?.confidence).toBe("LOW");
    expect(result.sources.find((source) => source.source.endsWith("cost inflation"))?.confidence).toBe("LOW");
    expect(result.limitations).toEqual(expect.arrayContaining([
      expect.stringContaining("purchasing power data is 6 years old"),
      expect.stringContaining("cost inflation data is 4 years old"),
    ]));
  });

  it("rejects malformed country codes before requesting external sources", async () => {
    let requested = false;
    setProjectIntelligenceProvider({
      getJson: async () => {
        requested = true;
        return [];
      },
    });

    await expect(searchProjectIntelligence({ query: "Riyadh", countryCode: "<>" })).rejects.toThrow("Country code must contain two letters");
    expect(requested).toBe(false);
  });
});
