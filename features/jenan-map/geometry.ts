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
): JenanLocation {
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
