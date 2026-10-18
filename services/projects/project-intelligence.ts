type LocationInput = {
  query: string;
  countryCode?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
};

type SourceRecord = { source: string; url: string; fetchedAt: string; confidence: "HIGH" | "MEDIUM" | "LOW" };
import { competitorSelectorsFor } from "@/lib/projects/competitor-sectors";
import type { AnalysisStage } from "@/lib/projects/analysis-study";
import { getProjectIntelligenceProvider, type IntelligenceRequestOptions } from "@/services/projects/project-intelligence-provider";
export type ProjectIntelligenceResult = {
  location: { latitude: number; longitude: number; label: string } | null;
  population: { value: number | null; year: number | null };
  purchasingPower: { value: number | null; year: number | null; metric: string };
  costInflation: { value: number | null; year: number | null; metric: string };
  competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>;
  sources: SourceRecord[];
  limitations: string[];
};

/** `onStage` is told which real step the search is starting, so a caller can show true progress. */
export async function searchProjectIntelligence(
  input: LocationInput,
  onStage?: (stage: AnalysisStage) => Promise<void> | void,
  options: IntelligenceRequestOptions = {},
): Promise<ProjectIntelligenceResult> {
  const fetchedAt = new Date().toISOString();
  const provider = getProjectIntelligenceProvider();
  const requestOptions = { ...options, deadlineAt: Math.min(options.deadlineAt ?? Infinity, Date.now() + 40_000) };
  options.signal?.throwIfAborted();
  const query = input.query.trim();
  if (!query) throw new Error("Location query is required");
  if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new Error("latitude and longitude must be provided together");
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90 || input.longitude! < -180 || input.longitude! > 180)) throw new Error("Invalid coordinates");

  await onStage?.("LOCATION");
  const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const sources: SourceRecord[] = [{ source: "OpenStreetMap Nominatim", url: geocodeUrl, fetchedAt, confidence: "LOW" }];
  const limitations: string[] = [];
  let location: ProjectIntelligenceResult["location"] = input.latitude !== undefined
    ? { latitude: input.latitude, longitude: input.longitude!, label: query }
    : null;

  if (!location) {
    try {
      const geocoded = await provider.getJson<Array<{ lat: string; lon: string; display_name: string }>>(geocodeUrl, requestOptions);
      const firstResult = geocoded[0];
      if (firstResult && Number.isFinite(Number(firstResult.lat)) && Number.isFinite(Number(firstResult.lon))) {
        location = { latitude: Number(firstResult.lat), longitude: Number(firstResult.lon), label: firstResult.display_name };
      } else {
        limitations.push("The location provider returned no matching result.");
      }
    } catch {
      options.signal?.throwIfAborted();
      limitations.push("Location geocoding could not be loaded from the map provider.");
    }
  }
  sources[0]!.confidence = location ? "MEDIUM" : "LOW";

  const result: { location: typeof location; population: { value: number | null; year: number | null }; purchasingPower: { value: number | null; year: number | null; metric: string }; costInflation: { value: number | null; year: number | null; metric: string }; competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>; sources: SourceRecord[]; limitations: string[] } = {
    location,
    population: { value: null, year: null },
    purchasingPower: { value: null, year: null, metric: "GNI per capita, PPP (current international $)" },
    costInflation: { value: null, year: null, metric: "Consumer price inflation (annual %)" },
    competitors: [],
    sources,
    limitations,
  };

  const countryCode = input.countryCode?.trim().toUpperCase();
  await onStage?.("MARKET_DATA");
  if (countryCode) {
    const indicatorUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/SP.POP.TOTL?format=json&per_page=10`;
    const purchasingUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/NY.GNP.PCAP.PP.CD?format=json&per_page=10`;
    const inflationUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=10`;
    type IndicatorPayload = [unknown, Array<{ value: number | null; date: string }> | undefined];
    const urls = [indicatorUrl, purchasingUrl, inflationUrl];
    const indicators = await Promise.allSettled(urls.map((url) => provider.getJson<IndicatorPayload>(url, requestOptions)));
    options.signal?.throwIfAborted();
    const currentYear = new Date().getUTCFullYear();
    const latest = indicators.map((item) => {
      if (item.status !== "fulfilled" || !Array.isArray(item.value?.[1])) return undefined;
      return item.value[1]
        .filter((row) => typeof row.value === "number" && Number.isFinite(row.value) && /^\d{4}$/.test(row.date) && Number(row.date) <= currentYear)
        .sort((a, b) => Number(b.date) - Number(a.date))[0];
    });
    const [population, purchasing, inflation] = latest;
    {
      result.population = { value: population?.value ?? null, year: population ? Number(population.date) : null };
      result.purchasingPower = { ...result.purchasingPower, value: purchasing?.value ?? null, year: purchasing ? Number(purchasing.date) : null };
      result.costInflation = { ...result.costInflation, value: inflation?.value ?? null, year: inflation ? Number(inflation.date) : null };
      latest.forEach((row, index) => {
        if (!row) return;
        const age = currentYear - Number(row.date);
        sources.push({ source: "World Bank Open Data", url: urls[index]!, fetchedAt, confidence: age <= 2 ? "HIGH" : age <= 5 ? "MEDIUM" : "LOW" });
      });
      if (indicators.some((item) => item.status === "rejected")) {
        result.limitations.push("Some World Bank indicators could not be loaded; successful indicators are retained.");
      }
    }
  } else {
    result.limitations.push("A two-letter country code is required for population and purchasing-power data.");
  }

  const selectors = competitorSelectorsFor(input.sector);
  await onStage?.("COMPETITION");
  if (!location) {
    result.limitations.push("A resolvable location is required for competitor discovery.");
  } else if (!selectors) {
    result.limitations.push("Competitor discovery needs a sector with a known map category; no competitor count is shown for this sector.");
  } else {
    const radius = 5000;
    const around = `(around:${radius},${location.latitude},${location.longitude})`;
    const overpassQuery = `[out:json][timeout:8];(${selectors.map((selector) => `${selector}${around};`).join("")});out center tags;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    try {
      const payload = await provider.getJson<{ elements?: Array<{ tags?: { name?: string; amenity?: string; shop?: string; office?: string; leisure?: string; tourism?: string }; lat?: number; lon?: number; center?: { lat: number; lon: number } }> }>(overpassUrl, { ...requestOptions, timeoutMs: 10_000 });
      result.competitors = (payload.elements ?? [])
        .filter((item) => item.tags?.name && (item.lat ?? item.center?.lat) !== undefined && (item.lon ?? item.center?.lon) !== undefined)
        .slice(0, 50)
        .map((item) => ({ name: item.tags!.name!, category: item.tags!.amenity ?? item.tags!.shop ?? item.tags!.office ?? item.tags!.leisure ?? item.tags!.tourism ?? "business", latitude: (item.lat ?? item.center?.lat)!, longitude: (item.lon ?? item.center?.lon)! }));
      sources.push({ source: "OpenStreetMap Overpass", url: overpassUrl, fetchedAt, confidence: "MEDIUM" });
      if (!result.competitors.length) result.limitations.push("No venues of this sector are mapped within 5 km; this is not evidence that there is no competition.");
    } catch {
      options.signal?.throwIfAborted();
      result.limitations.push("Competitor discovery could not be loaded from the map provider.");
    }
  }

  if (!result.population.value) result.limitations.push("Population result is unavailable; no population number is shown.");
  if (!result.purchasingPower.value) result.limitations.push("Purchasing-power result is unavailable; no purchasing-power number is shown.");
  if (result.costInflation.value === null) result.limitations.push("Cost inflation result is unavailable; no cost inflation number is shown.");
  return result;
}

export async function saveProjectIntelligenceSnapshot(projectId: string, query: string, result: ProjectIntelligenceResult) {
  const { db } = await import("@/lib/db");
  return db.projectIntelligenceSnapshot.create({
    data: {
      projectId,
      query,
      location: result.location ?? undefined,
      population: result.population,
      purchasingPower: result.purchasingPower,
      costInflation: result.costInflation,
      competitors: result.competitors,
      sources: result.sources,
      limitations: result.limitations,
      fetchedAt: new Date(result.sources[0]?.fetchedAt ?? new Date().toISOString()),
    },
  });
}
