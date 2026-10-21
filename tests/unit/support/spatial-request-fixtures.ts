import { SPATIAL_REQUEST_CONTRACT } from "@/services/analysis-engines/spatial/constants";
import type { SpatialRequestInput } from "@/services/analysis-engines/spatial/contracts";

/** Pure helpers for building Spatial requests and geometry in tests. They depend only on the request contract. */
export const riyadh = { type: "Point" as const, coordinates: [46.6753, 24.7136] as [number, number] };

export const baseRequest = (over: Partial<SpatialRequestInput> = {}): SpatialRequestInput => ({
  contract: SPATIAL_REQUEST_CONTRACT, analyses: ["PROXIMITY"], location: riyadh, parameters: { roles: ["poi:hospital"] }, ...over,
});

/** A closed square ring of the given side (in degrees) with its south-west corner at the given position. */
export const square = (west: number, south: number, side: number): [number, number][] => [[west, south], [west + side, south], [west + side, south + side], [west, south + side], [west, south]];

/** A closed ring with the requested number of positions approximating a small circle; used to build requests at the size limits. */
export function circleRing(centerLng: number, centerLat: number, radiusDegrees: number, positions: number): [number, number][] {
  const ring = Array.from({ length: positions - 1 }, (_, index) => {
    const angle = (2 * Math.PI * index) / (positions - 1);
    return [Number((centerLng + radiusDegrees * Math.cos(angle)).toFixed(6)), Number((centerLat + radiusDegrees * Math.sin(angle)).toFixed(6))] as [number, number];
  });
  return [...ring, ring[0] as [number, number]];
}
