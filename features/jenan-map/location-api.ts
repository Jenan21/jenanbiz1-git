import { mapRequest } from "./api";
import { isCoordinate } from "./geometry";
import type { LocationSource, SavedJenanLocation } from "./types";

function savedLocation(value: unknown): SavedJenanLocation {
  if (!value || typeof value !== "object")
    throw new Error("استجابة الموقع المحفوظ غير صالحة.");
  const point = value as Record<string, unknown>;
  if (
    typeof point.latitude !== "number" ||
    typeof point.longitude !== "number" ||
    !isCoordinate(point.latitude, point.longitude) ||
    point.country !== "SA" ||
    !["map", "search", "geolocation", "coordinates"].includes(
      String(point.source),
    ) ||
    typeof point.selectedAt !== "string" ||
    !Number.isFinite(Date.parse(point.selectedAt)) ||
    ["region", "city", "district", "formattedAddress"].some(
      (key) => point[key] !== null && typeof point[key] !== "string",
    )
  ) {
    throw new Error("استجابة الموقع المحفوظ غير صالحة.");
  }
  return value as SavedJenanLocation;
}

export async function loadOwnedMapLocation(signal?: AbortSignal) {
  const result = await mapRequest<{ location: unknown }>(
    "/api/jenan-map/location",
    { signal },
  );
  return result.location === null ? null : savedLocation(result.location);
}

export async function saveOwnedMapLocation(
  point: {
    latitude: number;
    longitude: number;
    source: LocationSource;
    releaseId: string;
  },
  signal?: AbortSignal,
) {
  const result = await mapRequest<{ location: unknown }>(
    "/api/jenan-map/location",
    {
      method: "PUT",
      signal,
      body: JSON.stringify({
        latitude: point.latitude,
        longitude: point.longitude,
        source: point.source,
        releaseId: point.releaseId,
      }),
    },
  );
  return savedLocation(result.location);
}
