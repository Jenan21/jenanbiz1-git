export const TILE_SIZE = 256;
export const TILE_ZOOM = 16;

/** The slippy-map tile that holds a coordinate, and the pixel of that coordinate inside the tile. */
export function tileAt(latitude: number, longitude: number, zoom = TILE_ZOOM) {
  const n = 2 ** zoom;
  const x = ((longitude + 180) / 360) * n;
  const radians = (latitude * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * n;
  return { px: (x - Math.floor(x)) * TILE_SIZE, py: (y - Math.floor(y)) * TILE_SIZE, tx: Math.floor(x), ty: Math.floor(y) };
}
