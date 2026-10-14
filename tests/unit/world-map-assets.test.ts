import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_COUNTRIES, WORLD_OUTLINES_URL, WORLD_VIEWBOX } from "@/components/auth/world-map-data";

const outlines = readFileSync(path.join(process.cwd(), "public", WORLD_OUTLINES_URL), "utf8");

describe("pre-login world map assets", () => {
  it("has one outline for every country the page draws", () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(200);
    const ids = WORLD_COUNTRIES.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(outlines, id).toContain(`<path id="${id}" d="`);
    expect(outlines.match(/<path /g)?.length).toBe(ids.length);
    expect(outlines).toContain(`viewBox="${WORLD_VIEWBOX}"`);
  });

  it("has a label anchor inside the map for every country", () => {
    const [, , width, height] = WORLD_VIEWBOX.split(" ").map(Number);
    for (const [id, name, x, y] of WORLD_COUNTRIES) {
      expect(name, id).toBeTruthy();
      expect(Number.isFinite(x) && Number.isFinite(y), id).toBe(true);
      expect(x, id).toBeGreaterThanOrEqual(-5);
      expect(x, id).toBeLessThanOrEqual(width + 5);
      expect(y, id).toBeGreaterThanOrEqual(-5);
      expect(y, id).toBeLessThanOrEqual(height + 5);
    }
  });

  it("keeps the activity countries the home page highlights", () => {
    const ids = new Set(WORLD_COUNTRIES.map(([id]) => id.toUpperCase()));
    for (const code of ["SA", "AE", "US", "DE"]) expect(ids.has(code), code).toBe(true);
  });
});
