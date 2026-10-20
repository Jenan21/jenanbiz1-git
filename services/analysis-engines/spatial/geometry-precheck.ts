import { roundTo } from "../shared/canonical";

/**
 * Pure pre-checks of request geometry, done before any database is involved: structure, size, area ceiling and the
 * antimeridian. They bound the work and reject malformed input early; topological validity (self-intersection and the like)
 * is decided by PostGIS (`ST_IsValid`) when the geometry reaches the spatial backend.
 */
export type Position = readonly [number, number];
export type Ring = readonly Position[];
export type PolygonCoordinates = readonly Ring[];
export type AreaGeometry =
  | { readonly type: "Polygon"; readonly coordinates: PolygonCoordinates }
  | { readonly type: "MultiPolygon"; readonly coordinates: readonly PolygonCoordinates[] };
export type PointGeometry = { readonly type: "Point"; readonly coordinates: Position };
export interface BoundingBox { west: number; south: number; east: number; north: number }

export const EARTH_RADIUS_KM = 6371.0088;

export function polygonsOf(area: AreaGeometry): readonly PolygonCoordinates[] {
  return area.type === "Polygon" ? [area.coordinates] : area.coordinates;
}
export function ringsOf(area: AreaGeometry): Ring[] {
  return polygonsOf(area).flatMap((polygon) => [...polygon]);
}
export function countVertices(area: AreaGeometry): number {
  return ringsOf(area).reduce((total, ring) => total + ring.length, 0);
}
export function ringIsClosed(ring: Ring): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
}
/** An edge that spans more than half the globe in longitude means the ring crosses the antimeridian, which v1 does not support. */
export function crossesAntimeridian(area: AreaGeometry): boolean {
  return ringsOf(area).some((ring) => ring.some((position, index) => index > 0 && Math.abs(position[0] - (ring[index - 1] as Position)[0]) > 180));
}

/** Area of one ring on a sphere (Chamberlain-Duquette): R² · |Σ Δλ · (2 + sin φ1 + sin φ2)| / 2. Exact for cells bounded by parallels and meridians. */
export function ringAreaKm2(ring: Ring): number {
  const radians = Math.PI / 180;
  let sum = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const [lng1, lat1] = ring[index - 1] as Position;
    const [lng2, lat2] = ring[index] as Position;
    sum += (lng2 - lng1) * radians * (2 + Math.sin(lat1 * radians) + Math.sin(lat2 * radians));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}
/** Exterior ring minus its holes, summed over the parts. Accurate to about half a percent for areas up to the engine ceiling. */
export function approxAreaKm2(area: AreaGeometry): number {
  const total = polygonsOf(area).reduce((sum, polygon) => {
    const [exterior, ...holes] = polygon;
    if (!exterior) return sum;
    return sum + Math.max(0, ringAreaKm2(exterior) - holes.reduce((holeSum, hole) => holeSum + ringAreaKm2(hole), 0));
  }, 0);
  return roundTo(total, 6);
}

export function boundingBoxOf(geometry: AreaGeometry | PointGeometry): BoundingBox {
  const positions: Position[] = geometry.type === "Point" ? [geometry.coordinates] : ringsOf(geometry).flat();
  return positions.reduce<BoundingBox>(
    (box, [lng, lat]) => ({ west: Math.min(box.west, lng), south: Math.min(box.south, lat), east: Math.max(box.east, lng), north: Math.max(box.north, lat) }),
    { west: Number.POSITIVE_INFINITY, south: Number.POSITIVE_INFINITY, east: Number.NEGATIVE_INFINITY, north: Number.NEGATIVE_INFINITY },
  );
}
export function boxContainsPoint(box: BoundingBox, point: Position): boolean {
  return point[0] >= box.west && point[0] <= box.east && point[1] >= box.south && point[1] <= box.north;
}
