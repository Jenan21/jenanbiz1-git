import { createHash } from "node:crypto";
import type { Artifact } from "@/services/jenan-map/contracts";
import { releaseAssetBase } from "@/services/jenan-map/validation";

export const fixtureReleaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
export function pmtilesFixture(extraMetadata: Record<string, unknown> = {}) {
  const feature = Buffer.from([24, 1, 34, 3, 9, 0, 0]);
  const layer = Buffer.concat([Buffer.from([10, 6]), Buffer.from("places"), Buffer.from([18, feature.length]), feature, Buffer.from([120, 2])]);
  const tile = Buffer.concat([Buffer.from([26, layer.length]), layer]);
  const metadata = Buffer.from(JSON.stringify({ vector_layers: [{ id: "places", fields: {} }], ...extraMetadata }));
  const directory = Buffer.from([1, 0, 1, tile.length, 1]);
  const header = Buffer.alloc(127);
  header.write("PMTiles"); header[7] = 3;
  const tileOffset = 127 + directory.length + metadata.length;
  for (const [at, value] of [[8, 127], [16, directory.length], [24, 127 + directory.length], [32, metadata.length], [40, tileOffset], [48, 0], [56, tileOffset], [64, tile.length], [72, 1], [80, 1], [88, 1]]) header.writeBigUInt64LE(BigInt(value), at);
  header[96] = 1; header[97] = 1; header[98] = 1; header[99] = 1;
  header.writeInt32LE(35e7, 102); header.writeInt32LE(16e7, 106);
  header.writeInt32LE(55e7, 110); header.writeInt32LE(32e7, 114);
  return Buffer.concat([header, directory, metadata, tile]);
}
const fixtureCoverage = {
  countryCode: "SA", authoritative: true, boundaryAuthority: "Fixture authority", boundarySource: "Synthetic unit fixture only",
};
export function readyFixtureFiles(releaseId = fixtureReleaseId, coverage = fixtureCoverage) {
  const font = Buffer.from("Noto");
  const range = Buffer.from("0-255");
  const glyph = Buffer.from([8, 65, 24, 0, 32, 0, 40, 0, 48, 0, 56, 1]);
  const stack = Buffer.concat([Buffer.from([10, font.length]), font, Buffer.from([18, range.length]), range, Buffer.from([26, glyph.length]), glyph]);
  const base = releaseAssetBase(releaseId);
  const values = [
    ["geojson", "places.geojson", Buffer.from('{"type":"FeatureCollection","features":[]}'), true],
    ["style", "style.json", Buffer.from(JSON.stringify({ version: 8, sources: { basemap: { type: "vector", url: `pmtiles://${base}/pmtiles/basemap.pmtiles` } }, glyphs: `${base}/glyphs/{fontstack}/{range}.pbf`, layers: [{ id: "places", type: "circle", source: "basemap", "source-layer": "places" }] })), true],
    ["pmtiles", "basemap.pmtiles", pmtilesFixture(), true],
    ["glyphs", "Noto/0-255.pbf", Buffer.concat([Buffer.from([10, stack.length]), stack]), true],
    ["schema", "schema.json", Buffer.from(JSON.stringify({ version: "v1", vector_layers: [{ id: "places" }] })), false],
    ["coverage", "coverage.json", Buffer.from(JSON.stringify(coverage)), false],
  ] as const;
  return values.map(([kind, filename, bytes, publicSafe], i) => {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const ext = kind === "pmtiles" ? "pmtiles" : kind === "geojson" ? "geojson" : kind === "glyphs" ? "bin" : "json";
    const artifact: Artifact = { id: `${i + 2}c1b5f07-9581-4e3b-a0a3-9fc7ea08ead${i + 2}`, releaseId, kind, filename, sha256, storageKey: `${releaseId}/${sha256}.${ext}`, byteSize: BigInt(bytes.length), publicSafe, mime: kind === "glyphs" ? "application/x-protobuf" : kind === "pmtiles" ? "application/vnd.pmtiles" : kind === "geojson" ? "application/geo+json" : "application/json" };
    return { artifact, bytes };
  });
}
