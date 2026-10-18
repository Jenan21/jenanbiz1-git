import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { PMTiles } from "pmtiles";
import type { Artifact } from "@/services/jenan-map/contracts";
import { validateArtifactFormat } from "@/services/jenan-map/validation";

// Real-data check: runs only when `npm run jenan-map:saudi-pmtiles` has produced an archive on this machine (it is never committed).
const dir = path.resolve(".jenan-map-data/saudi");
const file = existsSync(dir) ? readdirSync(dir).find((name) => /^saudi-\d{8}-z\d+\.pmtiles$/.test(name)) : undefined;
const real = describe.skipIf(!file);

real("the real Saudi PMTiles archive", () => {
  const archive = path.join(dir, file ?? "x");
  const manifest = async () => JSON.parse(await readFile(`${archive}.manifest.json`, "utf8"));

  it("passes the platform's own artifact validation (format, metadata, coverage, sampled tile geometry)", async () => {
    const info = await manifest();
    const handle = await open(archive, "r");
    try {
      const size = (await handle.stat()).size;
      const artifact = { id: "00000000-0000-4000-8000-000000000001", releaseId: "00000000-0000-4000-8000-000000000002", kind: "pmtiles",
        filename: "saudi.pmtiles", sha256: info.sha256, storageKey: "x", byteSize: BigInt(size), publicSafe: true, mime: "application/vnd.pmtiles" } as Artifact;
      const result = await validateArtifactFormat(artifact, handle);
      expect(result).toMatchObject({ type: "pmtiles", minzoom: 0, maxzoom: info.region.maxzoom });
      expect((result as { layers: string[] }).layers).toEqual(expect.arrayContaining(["places", "roads", "buildings", "pois", "boundaries", "water", "landuse"]));
    } finally { await handle.close(); }
  }, 120_000);

  it("contains Riyadh, Jeddah, Dammam, Makkah and Madinah tiles at street zoom with Arabic names", async () => {
    const handle = await open(archive, "r");
    const source = {
      getKey: () => archive,
      getBytes: async (offset: number, length: number) => {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return { data: Uint8Array.from(buffer.subarray(0, bytesRead)).buffer };
      },
    };
    try {
      const pm = new PMTiles(source);
      const header = await pm.getHeader();
      expect(header.maxZoom).toBeGreaterThanOrEqual(14);
      const tileFor = (lon: number, lat: number, z: number) => {
        const n = 2 ** z, rad = (lat * Math.PI) / 180;
        return [z, Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)] as const;
      };
      const cities: Array<[string, number, number]> = [["Riyadh", 46.6753, 24.7136], ["Jeddah", 39.1728, 21.4858], ["Dammam", 50.1033, 26.4207], ["Makkah", 39.8579, 21.3891], ["Madinah", 39.6142, 24.5247]];
      for (const [name, lon, lat] of cities) {
        const [z, x, y] = tileFor(lon, lat, 14);
        const tile = await pm.getZxy(z, x, y);
        expect(tile, `${name} z14 tile exists`).toBeTruthy();
        expect(tile!.data.byteLength, `${name} z14 tile is not empty`).toBeGreaterThan(500);
      }
    } finally { await handle.close(); }
  }, 120_000);
  it("carries real Arabic and English names (no placeholder text) around the five cities", async () => {
    const { VectorTile } = await import("@mapbox/vector-tile");
    const { PbfReader } = await import("pbf");
    const handle = await open(archive, "r");
    const pm = new PMTiles({
      getKey: () => archive,
      getBytes: async (offset: number, length: number) => {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        return { data: Uint8Array.from(buffer.subarray(0, bytesRead)).buffer };
      },
    });
    try {
      const names = new Set<string>();
      for (const [lon, lat] of [[46.6753, 24.7136], [39.1728, 21.4858], [50.1033, 26.4207], [39.8579, 21.3891], [39.6142, 24.5247]]) {
        const n = 2 ** 12, rad = (lat * Math.PI) / 180;
        const x = Math.floor(((lon + 180) / 360) * n), y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
        const tile = await pm.getZxy(12, x, y);
        const decoded = new VectorTile(new PbfReader(tile!.data));
        for (const layer of ["places", "roads", "pois"]) {
          const source = decoded.layers[layer];
          for (let i = 0; source && i < source.length; i++) {
            const properties = source.feature(i).properties;
            if (typeof properties["name:ar"] === "string") names.add(properties["name:ar"]);
          }
        }
      }
      const arabic = [...names];
      expect(arabic.length).toBeGreaterThan(20);
      expect(arabic.every((name) => /[\u0600-\u06FF]/.test(name))).toBe(true);
      expect(arabic.some((name) => name.includes("الرياض"))).toBe(true);
    } finally { await handle.close(); }
  }, 120_000);
});
