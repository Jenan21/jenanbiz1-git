import type { JenanLocation, LocationSource } from "./types";

export const EARTH_RADIUS_METERS = 6_371_008.8;
export const MAP_RADII = [500, 1000, 3000, 5000] as const;

export function isCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function coordinateDraft(
  latitude: number,
  longitude: number,
  source: LocationSource,
): JenanLocation & { source: LocationSource; selectedAt: string } {
  if (!isCoordinate(latitude, longitude))
    throw new Error("Invalid coordinates");
  return {
    latitude,
    longitude,
    source,
    selectedAt: new Date().toISOString(),
    country: null,
    region: null,
    city: null,
    district: null,
    formattedAddress: null,
  };
}

/** Great-circle destinations, not a screen-space circle or a coverage claim. */
export function geodesicRing(
  latitude: number,
  longitude: number,
  radius: number,
  segments = 96,
): [number, number][] {
  if (
    !isCoordinate(latitude, longitude) ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isInteger(segments) ||
    segments < 8
  )
    throw new Error("Invalid circle");
  const lat = (latitude * Math.PI) / 180;
  const lng = (longitude * Math.PI) / 180;
  const distance = radius / EARTH_RADIUS_METERS;
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const bearing = (i * 2 * Math.PI) / segments;
    const destinationLat = Math.asin(
      Math.sin(lat) * Math.cos(distance) +
        Math.cos(lat) * Math.sin(distance) * Math.cos(bearing),
    );
    const destinationLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat),
        Math.cos(distance) - Math.sin(lat) * Math.sin(destinationLat),
      );
    ring.push([
      (((destinationLng * 180) / Math.PI + 540) % 360) - 180,
      (destinationLat * 180) / Math.PI,
    ]);
  }
  ring.push([...ring[0]]);
  return ring;
}

/** The smallest box that holds the analysis ring; the camera frames it. */
export function ringBounds(
  latitude: number,
  longitude: number,
  radius: number,
): [[number, number], [number, number]] {
  const ring = geodesicRing(latitude, longitude, radius, 32);
  const longitudes = ring.map(([lng]) => lng);
  const latitudes = ring.map(([, lat]) => lat);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

export type CameraMove = "fit" | "center" | "stay";
export interface FramedPoint {
  latitude: number;
  longitude: number;
  radius: number;
}

/**
 * How the camera follows a change of the analysis point or radius. `previous` is undefined on the first pass, when the saved
 * viewport rules, and null when nothing had been selected. A point chosen from search, the device or typed coordinates, and every
 * new radius, bring the whole ring into view; a click or a dragged marker only follows the point.
 */
export function cameraMoveFor(
  previous: FramedPoint | null | undefined,
  next: (FramedPoint & { source: LocationSource | null }) | null,
): CameraMove {
  if (!next || previous === undefined) return "stay";
  const moved =
    !previous ||
    previous.latitude !== next.latitude ||
    previous.longitude !== next.longitude;
  if (!moved) return previous && previous.radius !== next.radius ? "fit" : "stay";
  return next.source === "map" || next.source === null ? "center" : "fit";
}
