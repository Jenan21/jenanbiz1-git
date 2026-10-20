import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquire, reviewedUrl, upstreamBoundaryId, upstreamText } from "../../scripts/jenan-map/prepare-open-data.mjs";

// The operator's acquisition tool takes metadata and files from the network. What it records as provenance is checked first, a hostile or malformed
// answer is refused before anything is written, and downloads and recorded URLs may only name reviewed hosts over HTTPS.

// The values of the real geoBoundaries answer for Saudi Arabia ADM0, plus fields the tool must not keep.
const real = {
  boundaryID: "SAU-ADM0-44563762", boundaryName: "Saudi Arabia", boundaryISO: "SAU", boundaryYearRepresented: "2017", boundaryType: "ADM0",
  boundaryCanonical: "Unknown", boundarySource: "OpenStreetMap, Wambacher", boundaryLicense: "Open Data Commons Open Database License 1.0",
  licenseDetail: "Open Data Commons Open Database License 1.0", licenseSource: "www.openstreetmap.org/copyright", boundarySourceURL: "wambachers-osm.website/boundaries/",
  sourceDataUpdateDate: "Thu Jan 19 07:31:04 2023", buildDate: "Dec 12, 2023", Continent: "Asia", "UNSDG-region": "Northern Africa and Western Asia",
  "UNSDG-subregion": "Western Asia", worldBankIncomeGroup: "High-income Countries", admUnitCount: "1", meanVertices: "78508.0",
  gjDownloadURL: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SAU/ADM0/geoBoundaries-SAU-ADM0.geojson",
  tjDownloadURL: "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/SAU/ADM0/geoBoundaries-SAU-ADM0.topojson", evil: "<script>alert(1)</script>",
};
const geojson = Buffer.from('{"type":"FeatureCollection","features":[]}');
const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Answers the metadata and file requests of an ADM0-only acquisition; ADM1 and ADM2 are not published (404). */
function serve(metadata: Buffer | object) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (/\/ADM0\/geoBoundaries-SAU-ADM0-metaData\.json$/.test(url) || /\/api\/current\/gbOpen\/SAU\/ADM0\/$/.test(url)) return new Response(Buffer.isBuffer(metadata) ? new Uint8Array(metadata) : JSON.stringify(metadata), { status: 200 });
    if (/-metaData\.json$/.test(url) || /\/api\/current\/gbOpen\/SAU\/ADM[12]\/$/.test(url)) return new Response("", { status: 404 });
    if (/_simplified\.geojson$/.test(url)) return new Response(new Uint8Array(geojson), { status: 200 });
    throw new Error(`unexpected request to ${url}`);
  }));
}

describe("acquiring the boundaries", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "jenan-acquire-")); });
  afterEach(async () => { vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });

  it("records the real answer as validated provenance and keeps only the named evidence fields", async () => {
    serve(real);
    const { boundaries } = await acquire(root, true);
    expect(boundaries).toHaveLength(1);
    expect(boundaries[0]).toMatchObject({ level: "ADM0", sha256: sha256(geojson), provenance: {
      source: "geoBoundaries gbOpen SAU ADM0 SAU-ADM0-44563762", organization: "geoBoundaries / William & Mary; upstream: OpenStreetMap, Wambacher",
      license: "ODbL-1.0", sourceDate: "2017-01-01T00:00:00.000Z",
    } });
    expect(boundaries[0].provenance.url).toMatch(/^https:\/\/media\.githubusercontent\.com\/media\/wmgeolab\/geoBoundaries\/[0-9a-f]{40}\/releaseData\/gbOpen\/SAU\/ADM0\//);
    expect(boundaries[0].provenance.attribution).toContain("OpenStreetMap, Wambacher");
    expect(boundaries[0].provenance.attribution).toContain("ODbL-1.0");
    expect((await readdir(root)).sort()).toEqual(["ADM0-metadata.json", "ADM0.geojson", "boundary-sources.json"]);
    expect(await readFile(path.join(root, "ADM0.geojson"))).toEqual(geojson);
    const kept = JSON.parse(await readFile(path.join(root, "ADM0-metadata.json"), "utf8"));
    expect(kept).toMatchObject({ boundaryID: "SAU-ADM0-44563762", boundarySource: "OpenStreetMap, Wambacher", boundaryISO: "SAU" });
    expect(Object.keys(kept)).not.toEqual(expect.arrayContaining(["evil"]));
    expect(kept).not.toHaveProperty("tjDownloadURL");
  });

  it.each([
    ["a control character", "OpenStreetMap\u0000"],
    ["an escape sequence", "OpenStreetMap\u001b[31m"],
    ["a line break", "OpenStreetMap\nlicense: public domain"],
    ["a text-direction override", "OpenStreetMap\u202e"],
    ["a zero-width character", "Open\u200bStreetMap"],
    ["a line separator", "OpenStreetMap\u2028x"],
    ["nothing", "   "],
    ["more than 300 characters", "x".repeat(301)],
    ["something that is not text", { text: "OpenStreetMap" }],
    ["no value", undefined],
  ])("refuses an upstream source with %s, before anything is written", async (_name, boundarySource) => {
    serve({ ...real, boundarySource });
    await expect(acquire(root, true)).rejects.toThrow("Unreviewed upstream boundarySource");
    expect(await readdir(root)).toEqual([]);
  });

  it.each(["SAU-ADM1-44563762", "SAU-ADM0-4456376x", "SAU-ADM0-1234567890123", "XYZ-ADM0-1", "SAU-ADM0-44563762\nlicense", "", undefined, 44563762])(
    "refuses the boundary identifier %j, before anything is written", async (boundaryID) => {
      serve({ ...real, boundaryID });
      await expect(acquire(root, true)).rejects.toThrow("Unreviewed upstream boundaryID");
      expect(await readdir(root)).toEqual([]);
    });

  it("refuses an unreviewed licence, a wrong country or level, an oversized answer and an answer that is not JSON, writing nothing", async () => {
    serve({ ...real, boundaryLicense: "All rights reserved" });
    await expect(acquire(root, true)).rejects.toThrow("Unreviewed upstream boundary license");
    serve({ ...real, boundaryISO: "EGY" });
    await expect(acquire(root, true)).rejects.toThrow("Unverified geoBoundaries ADM0 country");
    serve({ ...real, boundaryType: "ADM1" });
    await expect(acquire(root, true)).rejects.toThrow("Unverified geoBoundaries ADM0 country");
    serve(Buffer.from(JSON.stringify({ ...real, padding: "a".repeat(2 * 1024 * 1024) })));
    await expect(acquire(root, true)).rejects.toThrow("bounded size");
    serve(Buffer.from("<html>not metadata</html>"));
    await expect(acquire(root, true)).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses to record or download from a URL the metadata names outside the reviewed hosts, writing nothing", async () => {
    for (const gjDownloadURL of ["http://github.com/wmgeolab/x.geojson", "https://evil.example/x.geojson", "https://user:secret@github.com/x.geojson", "javascript:alert(1)", "not a url", undefined]) {
      serve({ ...real, gjDownloadURL });
      await expect(acquire(root, false)).rejects.toThrow(/Unreviewed acquisition/);
      expect(await readdir(root), String(gjDownloadURL)).toEqual([]);
    }
  });
});

describe("the checks themselves", () => {
  it("accepts the real values", () => {
    expect(upstreamText("OpenStreetMap, Wambacher", "x")).toBe("OpenStreetMap, Wambacher");
    expect(upstreamText("geoBoundaries, OpenStreetMap", "x")).toBe("geoBoundaries, OpenStreetMap");
    expect(upstreamText("  trimmed  ", "x")).toBe("trimmed");
    expect(upstreamText("مصدر مفتوح — OpenStreetMap", "x")).toBe("مصدر مفتوح — OpenStreetMap");
    expect(upstreamBoundaryId("SAU-ADM0-44563762", "ADM0")).toBe("SAU-ADM0-44563762");
    expect(upstreamBoundaryId("SAU-ADM2-3984122", "ADM2")).toBe("SAU-ADM2-3984122");
    for (const url of ["https://github.com/wmgeolab/geoBoundaries/raw/9469f09/x.geojson", "https://media.githubusercontent.com/media/x", "https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf", "https://www.geoboundaries.org/api/current/gbOpen/SAU/ADM0/"]) {
      expect(reviewedUrl(url).href).toBe(url);
    }
  });
  it("accepts text of exactly the limit and refuses one character more", () => {
    expect(upstreamText("x".repeat(300), "x")).toHaveLength(300);
    expect(() => upstreamText("x".repeat(301), "x")).toThrow("Unreviewed upstream x");
    expect(upstreamText("x".repeat(50), "x", 50)).toHaveLength(50);
    expect(() => upstreamText("x".repeat(51), "x", 50)).toThrow();
  });
  it("names a level in its own identifier and nothing else", () => {
    expect(() => upstreamBoundaryId("SAU-ADM1-1", "ADM0")).toThrow("Unreviewed upstream boundaryID");
    expect(() => upstreamBoundaryId("SAU-ADM0-1", "ADM1")).toThrow();
  });
});
