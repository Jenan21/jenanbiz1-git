import { describe, expect, it } from "vitest";
import { buildManifest, buildUrl, parseArgs, SAUDI_BBOX, SOURCE, TOOL_ARCHIVES, toolKey } from "../../scripts/jenan-map/saudi-pmtiles.mjs";

describe("Saudi PMTiles acquisition script", () => {
  it("builds only well-formed source URLs on the reviewed host", () => {
    expect(buildUrl("20261017")).toBe("https://build.protomaps.com/20261017.pmtiles");
    for (const bad of ["2026-10-17", "../x", "20261017/../../a", ""]) expect(() => buildUrl(bad)).toThrow();
  });

  it("defaults to the whole country at full detail and rejects unsafe options", () => {
    expect(parseArgs([])).toMatchObject({ maxzoom: 15, build: null, dryRun: false });
    expect(parseArgs(["--maxzoom=12", "--build=20261017", "--dry-run"])).toMatchObject({ maxzoom: 12, build: "20261017", dryRun: true });
    expect(() => parseArgs(["--maxzoom=22"])).toThrow(/maxzoom/);
    expect(() => parseArgs(["--maxzoom=2"])).toThrow(/maxzoom/);
    expect(() => parseArgs(["--url=http://evil"])).toThrow(/Unknown option/);
  });

  it("pins a SHA-256 for every supported platform and refuses others", () => {
    for (const spec of Object.values(TOOL_ARCHIVES)) expect(spec.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(toolKey("win32", "x64")).toBe("win32-x64");
    expect(toolKey("linux", "x64")).toBe("linux-x64");
    expect(() => toolKey("freebsd", "x64")).toThrow(/No pinned/);
  });

  it("covers Saudi Arabia's extent", () => {
    const [west, south, east, north] = SAUDI_BBOX;
    expect(west).toBeLessThanOrEqual(34.6); // Tabuk/Haql coast
    expect(east).toBeGreaterThanOrEqual(55.6); // eastern desert border
    expect(south).toBeLessThanOrEqual(16.4); // Jazan
    expect(north).toBeGreaterThanOrEqual(32.2); // northern border
  });

  const metadata = {
    version: "4.15.2", "planetiler:version": "0.10.2", "planetiler:osm:osmosisreplicationtime": "2026-10-17T04:00:00Z",
    vector_layers: [{ id: "earth" }, { id: "roads" }, { id: "places" }],
  };
  it("records source, date, checksum, license and ownership class in the manifest", () => {
    const manifest = buildManifest({ build: "20261017", maxzoom: 15, sha256: "a".repeat(64), byteSize: 970e6, metadata, tool: {}, downloadedAt: "2026-10-18T06:00:00.000Z" });
    expect(manifest).toMatchObject({
      kind: "pmtiles", file: "saudi-20261017-z15.pmtiles", sha256: "a".repeat(64),
      source: { license: "ODbL-1.0", ownership: "OPEN_LICENSE", build: "20261017", osmReplicationTime: "2026-10-17T04:00:00.000Z", schema: "4.15.2" },
      vectorLayers: ["earth", "roads", "places"], downloadedAt: "2026-10-18T06:00:00.000Z",
    });
    expect(SOURCE.attribution).toContain("OpenStreetMap");
    expect(manifest.notice).toMatch(/never presented as Jenan-owned/);
  });
  it("refuses an archive that does not state when its OpenStreetMap data was current", () => {
    expect(() => buildManifest({ build: "20261017", maxzoom: 15, sha256: "a".repeat(64), byteSize: 1, metadata: { ...metadata, "planetiler:osm:osmosisreplicationtime": undefined }, tool: {}, downloadedAt: "x" })).toThrow(/replication time/);
  });
});
