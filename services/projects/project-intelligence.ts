type LocationInput = {
  query: string;
  countryCode?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
};

type SourceRecord = { source: string; url: string; fetchedAt: string; confidence: "HIGH" | "MEDIUM" | "LOW" };
import { getProjectIntelligenceProvider } from "@/services/projects/project-intelligence-provider";
export type ProjectIntelligenceResult = {
  location: { latitude: number; longitude: number; label: string } | null;
  population: { value: number | null; year: number | null };
  purchasingPower: { value: number | null; year: number | null; metric: string };
  costInflation: { value: number | null; year: number | null; metric: string };
  competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>;
  sources: SourceRecord[];
  limitations: string[];
};

type IndicatorObservation = { value: number; year: number };

function coordinates(latitude: unknown, longitude: unknown) {
  const parse = (value: unknown) => {
    if (typeof value === "number") return value;
    return typeof value === "string" && value.trim() ? Number(value) : NaN;
  };
  const lat = parse(latitude);
  const lon = parse(longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
    ? { latitude: lat, longitude: lon }
    : null;
}

function latestValidIndicator(payload: unknown, allowNegative = false): IndicatorObservation | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) return null;
  const currentYear = new Date().getUTCFullYear();
  return payload[1].flatMap((item: unknown): IndicatorObservation[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { value?: unknown; date?: unknown };
    const year = typeof candidate.date === "string" && /^\d{4}$/.test(candidate.date) ? Number(candidate.date) : NaN;
    const valid = typeof candidate.value === "number" &&
      Number.isFinite(candidate.value) &&
      (allowNegative || candidate.value > 0) &&
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= currentYear;
    return valid ? [{ value: candidate.value as number, year }] : [];
  }).sort((left, right) => right.year - left.year)[0] ?? null;
}

export async function searchProjectIntelligence(input: LocationInput): Promise<ProjectIntelligenceResult> {
  const provider = getProjectIntelligenceProvider();
  const query = input.query.trim();
  if (!query) throw new Error("Location query is required");
  if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new Error("latitude and longitude must be provided together");
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90 || input.longitude! < -180 || input.longitude! > 180)) throw new Error("Invalid coordinates");

  const suppliedCountryCode = input.countryCode?.trim().toUpperCase();
  if (suppliedCountryCode && !/^[A-Z]{2}$/.test(suppliedCountryCode)) throw new Error("Country code must contain two letters");

  const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const sources: SourceRecord[] = [];
  const limitations: string[] = [];
  let location: ProjectIntelligenceResult["location"] = input.latitude !== undefined
    ? { latitude: input.latitude, longitude: input.longitude!, label: query }
    : null;

  if (!location) {
    try {
      const geocoded = await provider.getJson<Array<{ lat: string; lon: string; display_name: string }>>(geocodeUrl);
      const firstResult = Array.isArray(geocoded) ? geocoded[0] : undefined;
      const point = firstResult ? coordinates(firstResult.lat, firstResult.lon) : null;
      if (point && typeof firstResult?.display_name === "string" && firstResult.display_name.trim()) {
        location = { ...point, label: firstResult.display_name };
        sources.push({ source: "OpenStreetMap Nominatim", url: geocodeUrl, fetchedAt: new Date().toISOString(), confidence: "MEDIUM" });
      } else {
        limitations.push("The location provider returned no valid matching coordinates.");
      }
    } catch {
      limitations.push("Location geocoding could not be loaded from the map provider.");
    }
  }
  if (input.latitude !== undefined) {
    sources.push({ source: "User-supplied coordinates", url: "", fetchedAt: new Date().toISOString(), confidence: "LOW" });
    limitations.push("Coordinates were supplied by the user and were not independently verified.");
  }

  const result: { location: typeof location; population: { value: number | null; year: number | null }; purchasingPower: { value: number | null; year: number | null; metric: string }; costInflation: { value: number | null; year: number | null; metric: string }; competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>; sources: SourceRecord[]; limitations: string[] } = {
    location,
    population: { value: null, year: null },
    purchasingPower: { value: null, year: null, metric: "GNI per capita, PPP (current international $)" },
    costInflation: { value: null, year: null, metric: "Consumer price inflation (annual %)" },
    competitors: [],
    sources,
    limitations,
  };

  const countryCode = suppliedCountryCode;
  if (countryCode) {
    const indicators = [
      { label: "population", code: "SP.POP.TOTL", maxAgeYears: 5, allowNegative: false },
      { label: "purchasing power", code: "NY.GNP.PCAP.PP.CD", maxAgeYears: 5, allowNegative: false },
      { label: "cost inflation", code: "FP.CPI.TOTL.ZG", maxAgeYears: 3, allowNegative: true },
    ] as const;
    const observations = await Promise.all(indicators.map(async (indicator) => {
      const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/${indicator.code}?format=json&per_page=100`;
      try {
        const payload = await provider.getJson<unknown>(url);
        const observation = latestValidIndicator(payload, indicator.allowNegative);
        const ageYears = observation ? new Date().getUTCFullYear() - observation.year : null;
        const confidence: SourceRecord["confidence"] = !observation ? "LOW" : ageYears! > indicator.maxAgeYears ? "LOW" : "HIGH";
        return {
          observation,
          source: { source: `World Bank Open Data — ${indicator.label}`, url, fetchedAt: new Date().toISOString(), confidence },
          limitation: !observation
            ? `World Bank returned no valid ${indicator.label} observation.`
            : ageYears! > indicator.maxAgeYears
              ? `World Bank ${indicator.label} data is ${ageYears} years old; review its relevance.`
              : null,
        };
      } catch {
        return { observation: null, source: null, limitation: `World Bank ${indicator.label} data could not be loaded.` };
      }
    }));
    for (const observation of observations) {
      if (observation.source) sources.push(observation.source);
      if (observation.limitation) limitations.push(observation.limitation);
    }
    const [population, purchasing, inflation] = observations.map(({ observation }) => observation);
    result.population = { value: population?.value ?? null, year: population?.year ?? null };
    result.purchasingPower = { ...result.purchasingPower, value: purchasing?.value ?? null, year: purchasing?.year ?? null };
    result.costInflation = { ...result.costInflation, value: inflation?.value ?? null, year: inflation?.year ?? null };
  } else {
    result.limitations.push("A two-letter country code is required for population and purchasing-power data.");
  }

  if (location) {
    const radius = 5000;
    const sector = input.sector?.trim().replace(/[^a-z0-9 _-]/gi, "");
    const category = sector ? `nwr[\"name\"][\"industry\"~\"${sector}",i]` : "nwr[\"name\"]";
    if (input.sector?.trim() && !sector) limitations.push("The sector filter contained no supported search characters; nearby listings use the unfiltered map query.");
    const overpassQuery = `[out:json][timeout:8];(${category}(around:${radius},${location.latitude},${location.longitude}););out center tags;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    try {
      const payload = await provider.getJson<{ elements?: Array<{ tags?: { name?: string; amenity?: string; shop?: string; office?: string }; lat?: number; lon?: number; center?: { lat: number; lon: number } }> }>(overpassUrl);
      result.competitors = (Array.isArray(payload.elements) ? payload.elements : [])
        .flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const name = typeof item.tags?.name === "string" ? item.tags.name.trim() : "";
          const point = coordinates(item.lat ?? item.center?.lat, item.lon ?? item.center?.lon);
          return name && point
            ? [{ name, category: item.tags?.amenity ?? item.tags?.shop ?? item.tags?.office ?? "mapped business", ...point }]
            : [];
        })
        .slice(0, 50);
      sources.push({ source: "OpenStreetMap Overpass", url: overpassUrl, fetchedAt: new Date().toISOString(), confidence: "MEDIUM" });
      limitations.push("Nearby mapped businesses are geographic listings, not independently verified competitors or a complete market census.");
      if (!result.competitors.length) limitations.push("No named nearby businesses were returned; this does not establish that no competitors exist.");
    } catch {
      result.limitations.push("Competitor discovery could not be loaded from the map provider.");
    }
  } else {
    result.limitations.push("A resolvable location is required for competitor discovery.");
  }

  if (result.population.value === null) result.limitations.push("Population result is unavailable; no population number is shown.");
  if (result.purchasingPower.value === null) result.limitations.push("Purchasing-power result is unavailable; no purchasing-power number is shown.");
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
