import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, createHash: vi.fn(actual.createHash) };
});
const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: session.requireUser, getCurrentUser: vi.fn() }));
vi.mock("@/features/jenan-map/jenan-map-harness", () => ({ JenanMapHarness: () => null }));
vi.mock("@/lib/db", () => ({ db: {} }));

import JenanMapPage from "@/app/jenan-map/page";
import type { Artifact } from "@/services/jenan-map/contracts";
import { logicalFilename, openArtifact } from "@/services/jenan-map/storage";
import { validateArtifactFormat, validGeometry } from "@/services/jenan-map/validation";
import { fixtureReleaseId, pmtilesFixture, readyFixtureFiles } from "./jenan-map-artifact-fixtures";

const varint = (value: number) => {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 127) { bytes.push((rest & 127) | 128); rest = Math.floor(rest / 128); }
  return Buffer.from([...bytes, rest]);
};
const field = (tag: number, data: Buffer) => Buffer.concat([Buffer.from([tag]), varint(data.length), data]);

let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(os.tmpdir(), "jenan-map-review-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function validate(artifact: Artifact, bytes: Buffer) {
  const file = path.join(directory, "artifact.bin");
  await writeFile(file, bytes);
  const handle = await open(file, "r");
  try { return await validateArtifactFormat({ ...artifact, byteSize: BigInt(bytes.length) }, handle); }
  finally { await handle.close(); }
}

describe("review: private preview survives sign-in", () => {
  it.each([
    [{ preview: fixtureReleaseId }, `/jenan-map?preview=${fixtureReleaseId}`],
    [{}, "/jenan-map"],
    [{ preview: "not-a-release" }, "/jenan-map?preview=invalid"],
  ])("asks for sign-in with the return path for %j", async (query, returnPath) => {
    session.requireUser.mockClear();
    await JenanMapPage({ searchParams: Promise.resolve(query) });
    expect(session.requireUser).toHaveBeenCalledWith(returnPath);
  });
});

describe("review: vector-tile geometry is decoded, not just present", () => {
  it("accepts a point, a line and a closed ring", () => {
    expect(() => validGeometry(1, Buffer.from([9, 50, 34]))).not.toThrow();
    expect(() => validGeometry(2, Buffer.from([9, 4, 4, 18, 0, 2, 2, 0]))).not.toThrow();
    expect(() => validGeometry(3, Buffer.from([9, 4, 4, 18, 10, 0, 0, 10, 15]))).not.toThrow();
  });

  it.each([
    ["unterminated varints", 1, [128, 128, 128]],
    ["an unclosed ring", 3, [9, 4, 4, 18, 10, 0, 0, 10]],
    ["a line that never draws", 2, [9, 4, 4]],
    ["a point with a LineTo", 1, [9, 2, 2, 10, 2, 2]],
    ["a MoveTo without its parameters", 1, [9, 4]],
    ["ClosePath on a line", 2, [9, 0, 0, 10, 2, 0, 15]],
    ["an unknown feature type", 4, [9, 0, 0]],
    ["an empty geometry", 1, []],
  ])("rejects %s", (_name, type, bytes) => {
    expect(() => validGeometry(type, Buffer.from(bytes))).toThrow();
  });

  it("rejects a PMTiles archive whose sampled feature has an unterminated geometry (the reviewed case)", async () => {
    const pmtiles = readyFixtureFiles()[2];
    expect(await validate(pmtiles.artifact, pmtiles.bytes)).toMatchObject({ type: "pmtiles" });
    const tampered = Buffer.from(pmtiles.bytes);
    const at = tampered.indexOf(Buffer.from([34, 3, 9, 0, 0]));
    expect(at).toBeGreaterThan(0);
    Buffer.from([34, 3, 128, 128, 128]).copy(tampered, at);
    await expect(validate(pmtiles.artifact, tampered)).rejects.toMatchObject({ code: "ARTIFACT_FORMAT_INVALID" });
  });
});

describe("review: glyph bitmaps carry the standard three-pixel SDF border", () => {
  const glyphArtifact = { ...readyFixtureFiles()[3].artifact };
  const glyphFile = (bitmap: Buffer, width: number, height: number) => {
    const glyph = Buffer.concat([Buffer.from([8, 65]), field(18, bitmap), Buffer.from([24, width, 32, height, 40, 0, 48, 0, 56, 9])]);
    const stack = Buffer.concat([field(10, Buffer.from("Noto")), field(18, Buffer.from("0-255")), field(26, glyph)]);
    return field(10, stack);
  };

  it("accepts an 8x8 glyph whose bitmap is (8+6)x(8+6) = 196 bytes", async () => {
    expect(await validate(glyphArtifact, glyphFile(Buffer.alloc(196, 7), 8, 8))).toEqual({ type: "glyphs" });
  });
  it("rejects a bitmap without the border and one with a wrong size", async () => {
    await expect(validate(glyphArtifact, glyphFile(Buffer.alloc(64, 7), 8, 8))).rejects.toMatchObject({ code: "ARTIFACT_FORMAT_INVALID" });
    await expect(validate(glyphArtifact, glyphFile(Buffer.alloc(197, 7), 8, 8))).rejects.toMatchObject({ code: "ARTIFACT_FORMAT_INVALID" });
  });
});

describe("review: places.geojson may be as large as the builder produces", () => {
  const handleOf = (size: number, body: string) => ({ stat: async () => ({ size }), readFile: async () => Buffer.from(body) }) as never;
  const places = { ...readyFixtureFiles()[0].artifact };
  const collection = '{"type":"FeatureCollection","features":[]}';

  it("reads a 40 MiB GeoJSON but still bounds a 129 MiB one", async () => {
    expect(await validateArtifactFormat(places, handleOf(40 * 1024 * 1024, collection))).toMatchObject({ type: "geojson" });
    await expect(validateArtifactFormat(places, handleOf(129 * 1024 * 1024, collection))).rejects.toMatchObject({ code: "ARTIFACT_FORMAT_INVALID" });
  });
  it("keeps the small bound for styles", async () => {
    const style = readyFixtureFiles()[1].artifact;
    await expect(validateArtifactFormat(style, handleOf(20 * 1024 * 1024, "{}"))).rejects.toMatchObject({ code: "ARTIFACT_FORMAT_INVALID" });
  });
});

describe("review: the portable manifest keeps the names the style refers to", () => {
  const base = { id: "00000000-0000-4000-8000-000000000001", mime: "application/octet-stream" } as const;
  it.each([
    ["sprite", "sprite@2x.png"], ["sprite", "sprite.json"], ["sprite", "sprite@2x.json"],
    ["pmtiles", "saudi.2026-10.pmtiles"], ["pmtiles", "basemap.pmtiles"], ["glyphs", "Noto Sans Arabic Regular/1536-1791.pbf"],
  ])("preserves %s %s", (kind, filename) => {
    expect(logicalFilename({ ...base, kind: kind as Artifact["kind"], filename })).toBe(filename);
  });
  it("still sanitises names that are not a known logical form", () => {
    expect(logicalFilename({ ...base, kind: "pmtiles", filename: "../evil name.pmtiles" })).toBe("evil_name.pmtiles");
    expect(logicalFilename({ ...base, kind: "sprite", filename: "sprite@2x.png/../x" })).not.toContain("/");
  });
});

describe("review: concurrent cold requests hash an artifact once", () => {
  it("serves eight simultaneous range requests from one full-file verification", async () => {
    const root = path.join(directory, "storage");
    const bytes = pmtilesFixture();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await mkdir(path.join(root, fixtureReleaseId), { recursive: true });
    await writeFile(path.join(root, fixtureReleaseId, `${sha256}.pmtiles`), bytes);
    process.env.JENAN_MAP_STORAGE_ROOT = root;
    const artifact = { ...readyFixtureFiles()[2].artifact, sha256, storageKey: `${fixtureReleaseId}/${sha256}.pmtiles`, byteSize: BigInt(bytes.length) };
    vi.mocked(createHash).mockClear();
    try {
      const handles = await Promise.all(Array.from({ length: 8 }, () => openArtifact(artifact)));
      await Promise.all(handles.map((handle) => handle.close()));
      expect(vi.mocked(createHash)).toHaveBeenCalledTimes(1);
    } finally { delete process.env.JENAN_MAP_STORAGE_ROOT; }
  });
});
