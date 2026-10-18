import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateArtifactFormat, validateReleaseArtifacts } from "@/services/jenan-map/validation";
import { openArtifact } from "@/services/jenan-map/storage";
import { pmtilesFixture, readyFixtureFiles } from "./jenan-map-artifact-fixtures";
import { OPEN_BOUNDARY_NOTICE } from "../../scripts/jenan-map/open-data.mjs";

const root = path.resolve(".jenan-map-validation-test");
beforeEach(async () => { process.env.JENAN_MAP_STORAGE_ROOT = root; await mkdir(root, { mode: 0o700 }); });
afterEach(async () => { delete process.env.JENAN_MAP_STORAGE_ROOT; await rm(root, { recursive: true, force: true }); });
async function files() {
  const fixtures = readyFixtureFiles();
  await mkdir(path.join(root, fixtures[0].artifact.releaseId));
  for (const file of fixtures) await writeFile(path.join(root, file.artifact.storageKey), file.bytes);
  return fixtures;
}

describe("real retained map artifact validation", () => {
  it("parses a PMTiles v3 root, metadata, actual MVT sample, style, glyph PBF and release schema together", async () => {
    const fixtures = await files();
    expect(await validateReleaseArtifacts(fixtures.map((f) => f.artifact))).toMatchObject({ version: 8 });
  });
  it("rejects the PR24 fake PMTiles JSON even with correct checksum and file size", async () => {
    const fixture = readyFixtureFiles()[2];
    const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
    const name = path.join(root, "fake.pmtiles");
    await writeFile(name, bytes);
    const handle = await open(name, "r");
    try { await expect(validateArtifactFormat({ ...fixture.artifact, byteSize: BigInt(bytes.length) }, handle)).rejects.toThrow("ARTIFACT_FORMAT_INVALID"); }
    finally { await handle.close(); }
  });
  it.each(["schema", "style"])("rejects incompatible %s content instead of trusting registered kinds", async (kind) => {
    const fixtures = await files();
    const fixture = fixtures.find((f) => f.artifact.kind === kind)!;
    const json = JSON.parse(fixture.bytes.toString());
    if (kind === "schema") json.vector_layers = [{ id: "absent" }];
    else json.sources.basemap.url = "https://unowned.example/tiles";
    const bytes = Buffer.from(JSON.stringify(json));
    fixture.artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    fixture.artifact.byteSize = BigInt(bytes.length);
    await writeFile(path.join(root, fixture.artifact.storageKey), bytes);
    await expect(validateReleaseArtifacts(fixtures.map((f) => f.artifact))).rejects.toThrow("ARTIFACT_FORMAT_INVALID");
  });
  it("coalesces simultaneous cold checksum hashing through separate open handles", async () => {
    const fixtures = await files(), artifact = fixtures[2].artifact;
    const handle = await open(path.join(root, artifact.storageKey), "r");
    const spy = vi.spyOn(Object.getPrototypeOf(handle), "createReadStream");
    try {
      const handles = await Promise.all(Array.from({ length: 8 }, () => openArtifact(artifact, true)));
      await Promise.all(handles.map((h) => h.close()));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally { spy.mockRestore(); await handle.close(); }
  });
  it("rejects arbitrary JSON masquerading as a glyph PBF", async () => {
    const fixtures = await files(), glyph = fixtures[3];
    await writeFile(path.join(root, glyph.artifact.storageKey), Buffer.from("{}"));
    const handle = await open(path.join(root, glyph.artifact.storageKey), "r");
    try { await expect(validateArtifactFormat({ ...glyph.artifact, byteSize: BigInt(2) }, handle)).rejects.toThrow(); }
    finally { await handle.close(); }
  });
  it("rejects a PMTiles header/directory with a non-MVT tile payload", async () => {
    const fixture = readyFixtureFiles()[2], bytes = Buffer.from(fixture.bytes);
    const tileOffset = Number(bytes.readBigUInt64LE(56));
    bytes.fill(0xff, tileOffset);
    const filename = path.join(root, "invalid.pmtiles");
    await writeFile(filename, bytes); const handle = await open(filename, "r");
    try { await expect(validateArtifactFormat(fixture.artifact, handle)).rejects.toThrow(); }
    finally { await handle.close(); }
  });
  it("rejects declared internal layers inside a public PMTiles archive", async () => {
    const bytes = pmtilesFixture({ vector_layers: [{ id: "places", visibility: "internal" }] });
    const filename = path.join(root, "internal.pmtiles");
    await writeFile(filename, bytes); const handle = await open(filename, "r");
    try {
      await expect(validateArtifactFormat({ ...readyFixtureFiles()[2].artifact, byteSize: BigInt(bytes.length) }, handle))
        .rejects.toThrow("ARTIFACT_FORMAT_INVALID");
    } finally { await handle.close(); }
  });
  it("validates actual sprite PNG decoding, not just a filename or magic header", async () => {
    const { createCanvas } = await import("@napi-rs/canvas");
    const bytes = createCanvas(2, 2).toBuffer("image/png");
    const filename = path.join(root, "sprite.png");
    // One descriptor writes and reads each file, so nothing can swap it between the two steps.
    const artifact = { ...readyFixtureFiles()[0].artifact, kind: "sprite", filename: "sprite.png", byteSize: BigInt(bytes.length) };
    const handle = await open(filename, "wx+");
    try {
      await handle.writeFile(bytes);
      expect(await validateArtifactFormat(artifact, handle)).toMatchObject({ width: 2, height: 2 });
    } finally { await handle.close(); }
    const broken = await open(path.join(root, "sprite-truncated.png"), "wx+");
    try {
      await broken.writeFile(bytes.subarray(0, 33));
      await expect(validateArtifactFormat({ ...artifact, byteSize: BigInt(33) }, broken)).rejects.toThrow("ARTIFACT_FORMAT_INVALID");
    } finally { await broken.close(); }
  });
  it("requires open-data coverage to match the actual imported boundary rather than an authority assertion", async () => {
    const fixtures = await files();
    const fixture = fixtures.find((file) => file.artifact.kind === "coverage")!;
    const provenance = {
      source: "geoBoundaries SAU ADM0", organization: "geoBoundaries / William & Mary",
      url: "https://www.geoboundaries.org/api/current/gbOpen/SAU/ADM0/",
      sourceDate: "2017-01-01T00:00:00.000Z", importedAt: "2026-10-17T00:00:00.000Z",
      license: "ODbL-1.0", attribution: "geoBoundaries; © OpenStreetMap contributors / Wambacher",
    };
    const coverage = {
      countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0", coverageVerified: true,
      unofficial: true, notice: OPEN_BOUNDARY_NOTICE, boundaryAuthority: "Unofficial geoBoundaries",
      boundarySource: "Pinned Saudi ADM0", boundarySha256: "a".repeat(64), provenance,
      layers: [{ id: "places", provenance }],
    };
    const bytes = Buffer.from(JSON.stringify(coverage));
    fixture.artifact.sha256 = createHash("sha256").update(bytes).digest("hex");
    fixture.artifact.byteSize = BigInt(bytes.length);
    await writeFile(path.join(root, fixture.artifact.storageKey), bytes);
    const boundary = { authority: coverage.boundaryAuthority, source: coverage.boundarySource, coverage };
    await expect(validateReleaseArtifacts(fixtures.map((file) => file.artifact), true, boundary)).resolves.toMatchObject({ version: 8 });
    await expect(validateReleaseArtifacts(fixtures.map((file) => file.artifact), true, { ...boundary, coverage: null })).rejects.toThrow("ARTIFACT_FORMAT_INVALID");
    await expect(validateReleaseArtifacts(fixtures.map((file) => file.artifact), true, { ...boundary, coverage: { ...coverage, boundarySha256: "b".repeat(64) } })).rejects.toThrow("ARTIFACT_FORMAT_INVALID");
    const handle = await open(path.join(root, fixture.artifact.storageKey), "r");
    try {
      await writeFile(path.join(root, fixture.artifact.storageKey), JSON.stringify({ ...coverage, coverageVerified: false }));
      await expect(validateArtifactFormat(fixture.artifact, handle)).rejects.toThrow("ARTIFACT_FORMAT_INVALID");
    } finally { await handle.close(); }
  });
});
