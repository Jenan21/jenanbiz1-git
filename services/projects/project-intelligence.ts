type LocationInput = {
  query: string;
  countryCode?: string;
  sector?: string;
  latitude?: number;
  longitude?: number;
};

type SourceRecord = { source: string; url: string; fetchedAt: string; confidence: "HIGH" | "MEDIUM" | "LOW" };
export type ProjectIntelligenceResult = {
  location: { latitude: number; longitude: number; label: string } | null;
  population: { value: number | null; year: number | null };
  purchasingPower: { value: number | null; year: number | null; metric: string };
  competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>;
  sources: SourceRecord[];
  limitations: string[];
};

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "JenanBIZ-project-intelligence/1.0" }, cache: "no-store" });
    if (!response.ok) throw new Error(`External provider returned ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchProjectIntelligence(input: LocationInput): Promise<ProjectIntelligenceResult> {
  const fetchedAt = new Date().toISOString();
  const query = input.query.trim();
  if (!query) throw new Error("Location query is required");
  if ((input.latitude === undefined) !== (input.longitude === undefined)) throw new Error("latitude and longitude must be provided together");
  if (input.latitude !== undefined && (input.latitude < -90 || input.latitude > 90 || input.longitude! < -180 || input.longitude! > 180)) throw new Error("Invalid coordinates");

  const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const geocoded = await getJson<Array<{ lat: string; lon: string; display_name: string }>>(geocodeUrl);
  const location = input.latitude === undefined && geocoded[0]
    ? { latitude: Number(geocoded[0].lat), longitude: Number(geocoded[0].lon), label: geocoded[0].display_name }
    : input.latitude !== undefined
      ? { latitude: input.latitude, longitude: input.longitude!, label: query }
      : null;

  const sources: SourceRecord[] = [{ source: "OpenStreetMap Nominatim", url: geocodeUrl, fetchedAt, confidence: location ? "MEDIUM" : "LOW" }];
  const result: { location: typeof location; population: { value: number | null; year: number | null }; purchasingPower: { value: number | null; year: number | null; metric: string }; competitors: Array<{ name: string; category: string; latitude: number; longitude: number }>; sources: SourceRecord[]; limitations: string[] } = {
    location,
    population: { value: null, year: null },
    purchasingPower: { value: null, year: null, metric: "GNI per capita, PPP (current international $)" },
    competitors: [],
    sources,
    limitations: [],
  };

  const countryCode = input.countryCode?.trim().toUpperCase();
  if (countryCode) {
    const indicatorUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/SP.POP.TOTL?format=json&per_page=1`;
    const purchasingUrl = `https://api.worldbank.org/v2/country/${encodeURIComponent(countryCode)}/indicator/NY.GNP.PCAP.PP.CD?format=json&per_page=1`;
    try {
      const [populationPayload, purchasingPayload] = await Promise.all([
        getJson<[unknown, Array<{ value: number | null; date: string }> | undefined]>(indicatorUrl),
        getJson<[unknown, Array<{ value: number | null; date: string }> | undefined]>(purchasingUrl),
      ]);
      const population = populationPayload[1]?.find((item) => item.value !== null);
      const purchasing = purchasingPayload[1]?.find((item) => item.value !== null);
      result.population = { value: population?.value ?? null, year: population ? Number(population.date) : null };
      result.purchasingPower = { ...result.purchasingPower, value: purchasing?.value ?? null, year: purchasing ? Number(purchasing.date) : null };
      sources.push({ source: "World Bank Open Data", url: indicatorUrl, fetchedAt, confidence: population && purchasing ? "HIGH" : "MEDIUM" });
    } catch {
      result.limitations.push("World Bank population and purchasing-power data could not be loaded.");
    }
  } else {
    result.limitations.push("A two-letter country code is required for population and purchasing-power data.");
  }

  if (location) {
    const radius = 5000;
    const category = input.sector?.trim() ? `nwr[\"name\"][\"industry\"~\"${input.sector.trim().replace(/["\\]/g, "")}",i]` : "nwr[\"name\"]";
    const overpassQuery = `[out:json][timeout:8];(${category}(around:${radius},${location.latitude},${location.longitude}););out center tags;`;
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    try {
      const payload = await getJson<{ elements?: Array<{ tags?: { name?: string; amenity?: string; shop?: string; office?: string }; lat?: number; lon?: number; center?: { lat: number; lon: number } }> }>(overpassUrl);
      result.competitors = (payload.elements ?? []).filter((item) => item.tags?.name).slice(0, 50).map((item) => ({ name: item.tags!.name!, category: item.tags!.amenity ?? item.tags!.shop ?? item.tags!.office ?? "business", latitude: item.lat ?? item.center!.lat, longitude: item.lon ?? item.center!.lon }));
      sources.push({ source: "OpenStreetMap Overpass", url: overpassUrl, fetchedAt, confidence: "MEDIUM" });
    } catch {
      result.limitations.push("Competitor discovery could not be loaded from the map provider.");
    }
  } else {
    result.limitations.push("A resolvable location is required for competitor discovery.");
  }

  if (!result.population.value) result.limitations.push("Population result is unavailable; no population number is shown.");
  if (!result.purchasingPower.value) result.limitations.push("Purchasing-power result is unavailable; no purchasing-power number is shown.");
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
      competitors: result.competitors,
      sources: result.sources,
      limitations: result.limitations,
      fetchedAt: new Date(result.sources[0]?.fetchedAt ?? new Date().toISOString()),
    },
  });
}
