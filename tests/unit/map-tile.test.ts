import { describe, expect, it } from "vitest";
import { TILE_SIZE, tileAt } from "@/lib/projects/map-tile";

describe("map tile of a coordinate", () => {
  it("puts the equator and the prime meridian on the corner of the centre tile", () => {
    expect(tileAt(0, 0, 16)).toEqual({ px: 0, py: 0, tx: 32768, ty: 32768 });
    expect(tileAt(0, 0, 1)).toEqual({ px: 0, py: 0, tx: 1, ty: 1 });
  });

  it("keeps the pixel inside the tile and the tile inside the world grid", () => {
    for (const [latitude, longitude] of [
      [24.8216, 46.6633],
      [21.4858, 39.1925],
      [-33.8688, 151.2093],
      [60.1699, -24.9384],
    ] as const) {
      const { px, py, tx, ty } = tileAt(latitude, longitude, 16);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThan(TILE_SIZE);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThan(TILE_SIZE);
      expect(tx).toBeGreaterThanOrEqual(0);
      expect(tx).toBeLessThan(2 ** 16);
      expect(ty).toBeGreaterThanOrEqual(0);
      expect(ty).toBeLessThan(2 ** 16);
    }
  });

  it("moves east with the longitude and south as the latitude falls", () => {
    const riyadh = tileAt(24.8216, 46.6633);
    const east = tileAt(24.8216, 46.7633);
    const south = tileAt(24.7216, 46.6633);
    expect(east.tx * TILE_SIZE + east.px).toBeGreaterThan(riyadh.tx * TILE_SIZE + riyadh.px);
    expect(south.ty * TILE_SIZE + south.py).toBeGreaterThan(riyadh.ty * TILE_SIZE + riyadh.py);
  });
});
