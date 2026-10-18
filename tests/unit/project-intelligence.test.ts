import { afterEach, describe, expect, it } from "vitest";
import { competitorSelectorsFor } from "@/lib/projects/competitor-sectors";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { getProjectIntelligenceProvider, setProjectIntelligenceProvider, type IntelligenceRequestOptions, type ProjectIntelligenceProvider } from "@/services/projects/project-intelligence-provider";

describe("competitor sectors", () => {
  it("maps the sectors offered by the forms and their Arabic names", () => {
    expect(competitorSelectorsFor("Food")).not.toBeNull();
    expect(competitorSelectorsFor("Retail")).not.toBeNull();
    expect(competitorSelectorsFor("Real Estate")).not.toBeNull();
    expect(competitorSelectorsFor("الأغذية والمشروبات")).not.toBeNull();
    expect(competitorSelectorsFor("مطعم")).not.toBeNull();
  });

  it("has no map category for broad sectors, so no competitor count is invented", () => {
    for (const sector of ["Technology", "Energy", "Services", "", "  ", undefined, null, "Childcare", "طبيعة", "مطبخ"]) {
      expect(competitorSelectorsFor(sector), String(sector)).toBeNull();
    }
  });

  it("matches whole words instead of fragments", () => {
    expect(competitorSelectorsFor("Healthcare")).not.toBeNull();
    expect(competitorSelectorsFor("Used cars")).not.toBeNull();
    expect(competitorSelectorsFor("Scarf design")).toBeNull();
  });
});

describe("project intelligence competitor discovery", () => {
  const original = getProjectIntelligenceProvider();
  afterEach(() => setProjectIntelligenceProvider(original));

  function fakeProvider(overpassElements: unknown[]) {
    const urls: string[] = [];
    const provider: ProjectIntelligenceProvider = {
      async getJson<T>(url: string) {
        urls.push(url);
        if (url.includes("nominatim")) return [{ lat: "24.7", lon: "46.6", display_name: "Riyadh" }] as T;
        if (url.includes("worldbank")) return [{}, [{ value: 1, date: "2024" }]] as T;
        return { elements: overpassElements } as T;
      },
    };
    setProjectIntelligenceProvider(provider);
    return urls;
  }

  it("does not query the map for competitors when the sector has no category", async () => {
    const urls = fakeProvider([{ tags: { name: "Anything" }, lat: 1, lon: 1 }]);
    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "Technology" });

    expect(urls.some((url) => url.includes("overpass"))).toBe(false);
    expect(result.competitors).toEqual([]);
    expect(result.sources.map((source) => source.source)).not.toContain("OpenStreetMap Overpass");
    expect(result.limitations.join(" ")).toContain("known map category");
  });

  it("asks for the sector's place types and never for the industry tag", async () => {
    const urls = fakeProvider([
      { tags: { name: "Cafe A", amenity: "cafe" }, lat: 24.7, lon: 46.6 },
      { tags: { name: "Bakery B", shop: "bakery" }, center: { lat: 24.71, lon: 46.61 } },
      { tags: { amenity: "cafe" }, lat: 24.7, lon: 46.6 },
    ]);
    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "Food" });
    const overpass = decodeURIComponent(urls.find((url) => url.includes("overpass"))!);

    expect(overpass).toContain('["amenity"~"^(restaurant|fast_food|cafe|food_court)$"]');
    expect(overpass).not.toContain("industry");
    expect(result.competitors.map((item) => item.name)).toEqual(["Cafe A", "Bakery B"]);
    expect(result.sources.map((source) => source.source)).toContain("OpenStreetMap Overpass");
  });

  it("records that an empty result is not proof of no competition", async () => {
    fakeProvider([]);
    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "Food" });

    expect(result.competitors).toEqual([]);
    expect(result.limitations.join(" ")).toContain("not evidence that there is no competition");
  });

  it("keeps successful World Bank indicators when another fails, using the latest non-null year", async () => {
    const urls: string[] = [];
    setProjectIntelligenceProvider({
      async getJson<T>(url: string) {
        urls.push(url);
        if (url.includes("NY.GNP")) throw new Error("unavailable");
        if (url.includes("worldbank")) return [{}, [
          { value: null, date: "2026" },
          { value: 17, date: "2023" },
          { value: 21, date: "2025" },
        ]] as T;
        return { elements: [] } as T;
      },
    });
    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "Food", latitude: 24.7, longitude: 46.6 });
    expect(result.population).toEqual({ value: 21, year: 2025 });
    expect(result.costInflation.value).toBe(21);
    expect(result.purchasingPower.value).toBeNull();
    expect(result.limitations.join(" ")).toContain("successful indicators are retained");
    expect(urls.filter((url) => url.includes("worldbank")).every((url) => url.includes("per_page=10"))).toBe(true);
    expect(result.sources.filter((source) => source.source === "World Bank Open Data")).toHaveLength(2);
  });

  it("degrades honestly when every source fails", async () => {
    setProjectIntelligenceProvider({ async getJson() { throw new Error("unavailable"); } });
    const result = await searchProjectIntelligence({ query: "Riyadh", countryCode: "SA", sector: "Food" });
    expect(result.location).toBeNull();
    expect(result.population.value).toBeNull();
    expect(result.competitors).toEqual([]);
    expect(result.limitations.length).toBeGreaterThan(3);
  });

  it("passes a shared deadline to providers and never swallows cancellation", async () => {
    const controller = new AbortController();
    let deadline: number | undefined;
    setProjectIntelligenceProvider({
      async getJson<T>(_url: string, options?: IntelligenceRequestOptions): Promise<T> {
        deadline = options?.deadlineAt;
        controller.abort();
        throw new Error("lease lost");
      },
    });
    await expect(searchProjectIntelligence({ query: "Riyadh" }, undefined, { signal: controller.signal, deadlineAt: Date.now() + 1000 })).rejects.toMatchObject({ name: "AbortError" });
    expect(deadline).toBeGreaterThan(Date.now());
    expect(deadline).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
