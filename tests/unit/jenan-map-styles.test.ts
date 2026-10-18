import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { buildStyle, labelField, SOURCE_LAYERS, STYLE_FONTS, styleLayerGroups, THEMES } from "../../scripts/jenan-map/styles.mjs";
import { FONT_STACKS, GLYPH_RANGES, glyphUrl } from "../../scripts/jenan-map/glyphs.mjs";
import { releaseAssetBase } from "@/services/jenan-map/validation";

const releaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const input = { releaseBase: releaseAssetBase(releaseId), tileFilename: "saudi-20261017-z15.pmtiles" };

describe("Jenan PRO Map Light and Dark styles", () => {
  it.each(THEMES.flatMap((theme) => ["ar", "en", "bilingual"].map((language) => [theme, language])))("%s/%s is a valid MapLibre style", (theme, language) => {
    const style = buildStyle({ theme, language, ...input });
    expect(validateStyleMin(style as never)).toEqual([]);
    expect(style.name).toBe(`Jenan PRO Map ${theme === "dark" ? "Dark" : "Light"}`);
  });

  it("matches the platform's release-pinned contract: one pmtiles source and the release glyph template", () => {
    const style = buildStyle({ theme: "light", ...input });
    expect(style.glyphs).toBe(`${input.releaseBase}/glyphs/{fontstack}/{range}.pbf`);
    expect(Object.values(style.sources)).toEqual([expect.objectContaining({ type: "vector", url: `pmtiles://${input.releaseBase}/pmtiles/${input.tileFilename}` })]);
    expect((style as Record<string, unknown>).sprite).toBeUndefined();
  });

  it("reads only layers of the Saudi archive and only fonts the glyph script downloads", () => {
    for (const theme of THEMES) {
      const style = buildStyle({ theme, ...input });
      for (const layer of style.layers) if (layer["source-layer"]) expect(SOURCE_LAYERS).toContain(layer["source-layer"]);
      const fonts = new Set((style.layers as Array<{ layout?: { "text-font"?: string[] } }>).flatMap((layer) => layer.layout?.["text-font"] ?? []));
      for (const font of fonts) expect(FONT_STACKS).toContain(font);
      for (const font of Object.values(STYLE_FONTS)) expect(FONT_STACKS).toContain(font);
    }
    expect(GLYPH_RANGES).toEqual(expect.arrayContaining(["0-255", "1536-1791", "65024-65279"]));
    expect(glyphUrl("Noto Sans Regular", "1536-1791")).toContain("Noto%20Sans%20Regular/1536-1791.pbf");
    expect(() => glyphUrl("Evil Font", "0-255")).toThrow();
    expect(() => glyphUrl("Noto Sans Regular", "../../x")).toThrow();
  });

  it("has the full road hierarchy, buildings, boundaries, water, parks and commercial areas in both themes", () => {
    for (const theme of THEMES) {
      const ids = buildStyle({ theme, ...input }).layers.map((layer: { id: string }) => layer.id);
      for (const id of ["roads-highway", "roads-major", "roads-minor", "roads-other", "roads-path", "roads-rail", "buildings", "boundaries-country", "boundaries-region",
        "water", "landuse-nature", "landuse-commercial", "landuse-industrial", "pois-dot"]) expect(ids).toContain(id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("shows detail progressively: no label layer is visible at every zoom, and POI names come last", () => {
    const layers = buildStyle({ theme: "light", ...input }).layers as Array<{ id: string; type: string; minzoom?: number; maxzoom?: number }>;
    for (const layer of layers.filter((l) => l.type === "symbol")) expect(layer.minzoom !== undefined || layer.maxzoom !== undefined, layer.id).toBe(true);
    const zoom = (id: string) => layers.find((l) => l.id === id)!.minzoom!;
    expect(zoom("labels-city")).toBeLessThan(zoom("labels-town"));
    expect(zoom("labels-town")).toBeLessThan(zoom("labels-village"));
    expect(zoom("labels-village")).toBeLessThan(zoom("labels-neighbourhood"));
    expect(zoom("labels-neighbourhood")).toBeLessThan(zoom("labels-pois"));
    expect(zoom("roads-highway")).toBeLessThan(zoom("roads-minor"));
  });

  it("puts the Arabic name first and falls back to the source name; English mode does the reverse", () => {
    expect(labelField("ar")).toEqual(["coalesce", ["get", "name:ar"], ["get", "name"]]);
    expect(labelField("en")).toEqual(["coalesce", ["get", "name:en"], ["get", "name"]]);
    expect(JSON.stringify(labelField("bilingual", true))).toContain("name:en");
    expect(labelField("bilingual", false)).toEqual(labelField("ar"));
  });

  it("marks the design Jenan-owned and the tile data open-licensed, never the other way round", () => {
    const style = buildStyle({ theme: "dark", ...input });
    expect(style.metadata["jenan:ownership"]).toBe("JENAN_OWNED");
    expect(style.metadata["jenan:note"]).toMatch(/OpenStreetMap-derived \(ODbL\)/);
    expect(style.sources.saudi.attribution).toContain("OpenStreetMap");
  });

  it("groups every style layer into exactly one catalog layer for release bindings", () => {
    const style = buildStyle({ theme: "light", ...input });
    const groups = styleLayerGroups(style);
    expect(Object.values(groups).flat().sort()).toEqual(style.layers.map((layer: { id: string }) => layer.id).sort());
    expect(groups.roads).toEqual(expect.arrayContaining(["roads-highway", "labels-roads-highway"]));
  });

  it.each(["unknown", ""])("rejects theme %j and missing release information", (theme) => {
    expect(() => buildStyle({ theme, ...input })).toThrow();
    expect(() => buildStyle({ theme: "light", releaseBase: "", tileFilename: "" })).toThrow();
  });

  const real = path.resolve(".jenan-map-data/glyphs/manifest.json");
  it.skipIf(!existsSync(real))("downloaded glyphs pass the platform's glyph validation (Arabic ranges, SDF border)", async () => {
    const { open } = await import("node:fs/promises");
    const { validateArtifactFormat } = await import("@/services/jenan-map/validation");
    const manifest = JSON.parse(readFileSync(real, "utf8"));
    let checked = 0;
    for (const entry of manifest.files.filter((f: { filename: string }) => /Regular\/(0-255|1536-1791|1792-2047|65024-65279)\.pbf$/.test(f.filename))) {
      const handle = await open(path.resolve(".jenan-map-data/glyphs", entry.filename), "r");
      try {
        const artifact = { id: "x", releaseId, kind: "glyphs", filename: entry.filename, sha256: entry.sha256, storageKey: "x", byteSize: BigInt(entry.byteSize), publicSafe: true, mime: "application/x-protobuf" };
        await expect(validateArtifactFormat(artifact as never, handle)).resolves.toEqual({ type: "glyphs" });
        checked++;
      } finally { await handle.close(); }
    }
    expect(checked).toBe(4);
  });
});
