#!/usr/bin/env node
// Builds the staging folder `build.mjs` imports, from REAL data only: searchable features read out of the Saudi PMTiles archive and
// the pinned geoBoundaries country/region/governorate polygons. Points outside the country polygon are dropped (never moved).
//   DATABASE_URL=<disposable PostGIS> node scripts/jenan-map/prepare-saudi-import.mjs --pmtiles <file> --boundaries <dir> --out <new empty dir>
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { importedFeature, OPEN_BOUNDARY_NOTICE, OSM_ATTRIBUTION } from "./open-data.mjs";
import { boundaryAttribution, boundaryLicense } from "./prepare-open-data.mjs";
import { collectSearchFeatures } from "./pmtiles-features.mjs";
import { buildStyle, styleLayerGroups } from "./styles.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export async function filterInsideCountry(client, boundaryGeometry, features) {
  const inside = [];
  for (let start = 0; start < features.length; start += 5000) {
    const batch = features.slice(start, start + 5000);
    const { rows } = await client.query(
      `SELECT p.idx::int AS idx FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS p(lon, lat, idx)
       WHERE ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), ST_SetSRID(ST_MakePoint(p.lon, p.lat), 4326))`,
      [JSON.stringify(boundaryGeometry), batch.map((f) => f.geometry.coordinates[0]), batch.map((f) => f.geometry.coordinates[1])]);
    for (const { idx } of rows) inside.push(batch[idx - 1]);
  }
  return inside;
}

export async function main(argv) {
  const options = Object.fromEntries(argv.reduce((pairs, arg, i) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), argv[i + 1]]] : pairs), []));
  if (!options.pmtiles || !options.boundaries || !options.out) throw new Error("Usage: --pmtiles <file> --boundaries <dir> --out <new dir>");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL of a disposable PostGIS is required to test points against the country polygon");
  const out = path.resolve(options.out);
  await mkdir(out, { mode: 0o700 });
  const tilesManifest = JSON.parse(await readFile(`${options.pmtiles}.manifest.json`, "utf8"));
  const importedAt = new Date().toISOString();

  const levels = {};
  for (const level of ["ADM0", "ADM1", "ADM2"]) {
    const bytes = await readFile(path.join(options.boundaries, `${level}.geojson`));
    const metadata = JSON.parse((await readFile(path.join(options.boundaries, `${level}-metadata.json`), "utf8")).replace(/^\uFEFF/, ""));
    const year = String(metadata.boundaryYearRepresented ?? metadata.boundaryYear).match(/\d{4}/)?.[0];
    if (metadata.boundaryISO !== "SAU" || metadata.boundaryType !== level || !year) throw new Error(`Unverified geoBoundaries ${level}`);
    levels[level] = { bytes, sha256: sha256(bytes), metadata, json: JSON.parse(bytes.toString("utf8")), license: boundaryLicense(metadata),
      provenance: {
        source: `geoBoundaries gbOpen SAU ${level} ${metadata.boundaryID}`,
        organization: `geoBoundaries / William & Mary; upstream: ${metadata.boundarySource}`,
        url: metadata.gjDownloadURL, sourceDate: `${year}-01-01T00:00:00.000Z`, importedAt, license: boundaryLicense(metadata), attribution: boundaryAttribution(metadata),
      } };
  }
  const country = levels.ADM0.json.features;
  if (country.length !== 1 || country[0].properties.shapeGroup !== "SAU") throw new Error("Single Saudi ADM0 polygon required");
  const boundaryFeature = country[0];

  const tilesProvenance = {
    source: `${tilesManifest.source.name} build ${tilesManifest.source.build}`,
    organization: "OpenStreetMap contributors / Protomaps", url: tilesManifest.source.url,
    sourceDate: tilesManifest.source.osmReplicationTime, importedAt, license: "ODbL-1.0", attribution: OSM_ATTRIBUTION,
  };

  console.log("reading searchable features from the real PMTiles archive ...");
  const collected = await collectSearchFeatures(options.pmtiles, { onProgress: (d, t, f) => process.stdout.write(`\r  ${d}/${t} tiles, ${f} features`) });
  console.log("");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let kept;
  try { kept = await filterInsideCountry(client, boundaryFeature.geometry, collected); } finally { await client.end(); }
  console.log(`inside the Saudi polygon: ${kept.length} of ${collected.length}`);

  const administrative = [
    ...levels.ADM1.json.features.map((f) => importedFeature(f, "geoBoundaries", "regions")),
    ...levels.ADM2.json.features.map((f) => importedFeature(f, "geoBoundaries", "governorates")),
  ].filter(Boolean);
  const features = [...administrative, ...kept.map(({ type, properties, geometry }) => ({ type, properties, geometry }))];
  if (features.length > 100_000) throw new Error(`Too many searchable features (${features.length}); the v1 limit is 100000 and nothing is truncated`);

  const boundaryBytes = Buffer.from(JSON.stringify(boundaryFeature));
  const featuresBytes = Buffer.from(JSON.stringify({ type: "FeatureCollection", features }));
  const clipNote = "; modified by Jenan PRO: PostGIS ST_Intersection with reviewed unofficial ADM0; original source retained privately";
  // Bindings come from the real style, so every style layer is claimed by exactly one catalog layer. Governorates are data without a style
  // layer: they stay in the release as administrative context (they fill the city of a saved location) and carry their own reviewed provenance.
  const groups = styleLayerGroups(buildStyle({ theme: "light", language: "ar", releaseBase: "/api/jenan-map/releases/layout", tileFilename: "layout.pmtiles" }));
  const regionsProvenance = { ...levels.ADM1.provenance, attribution: levels.ADM1.provenance.attribution + clipNote };
  const governoratesProvenance = { ...levels.ADM2.provenance, attribution: levels.ADM2.provenance.attribution + clipNote };
  const layers = [
    { id: "base", searchCategories: [], provenance: tilesProvenance },
    { id: "roads", searchCategories: ["roads"], provenance: tilesProvenance },
    { id: "places", searchCategories: ["places"], provenance: tilesProvenance },
    { id: "pois", searchCategories: ["pois"], provenance: tilesProvenance },
    { id: "buildings", searchCategories: [], provenance: tilesProvenance },
    { id: "regions", searchCategories: ["regions"], provenance: regionsProvenance },
  ].map((layer) => {
    if (!groups[layer.id]?.length) throw new Error(`The style has no layers for ${layer.id}`);
    return { ...layer, styleLayerIds: groups[layer.id], visibility: "public", confidence: null };
  });
  const coverage = {
    countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0", coverageVerified: true, unofficial: true, notice: OPEN_BOUNDARY_NOTICE,
    boundaryAuthority: "geoBoundaries open data — not a Saudi government authority",
    boundarySource: levels.ADM0.provenance.source, boundarySha256: sha256(boundaryBytes), provenance: levels.ADM0.provenance,
    layers: [...layers, { id: "governorates", provenance: governoratesProvenance }].map(({ id, provenance }) => ({ id, provenance })),
  };
  const sourceFiles = Object.entries(levels).map(([level, item]) => ({ level, filename: `original-${level}.geojson`, sha256: item.sha256 }));
  const write = (name, data) => writeFile(path.join(out, name), data, { flag: "wx", mode: 0o600 });
  await write("boundary.geojson", boundaryBytes);
  await write("features.geojson", featuresBytes);
  for (const [level, item] of Object.entries(levels)) await write(`original-${level}.geojson`, item.bytes);
  await write("import.json", JSON.stringify({ ...coverage, featuresFile: "features.geojson", boundaryFile: "boundary.geojson", sourceFiles, clipAdministrativeToBoundary: true, confirmation: "BUILD OWNED SA DATA" }));
  await write("bindings.json", JSON.stringify({ layers, confirmation: "BIND MAP LAYERS" }));
  const summary = { features: features.length, administrative: administrative.length, byLayer: Object.fromEntries(["places", "roads", "pois"].map((id) => [id, kept.filter((f) => f.properties.layerId === id).length])),
    dropped: collected.length - kept.length, featuresBytes: (await stat(path.join(out, "features.geojson"))).size, pmtilesSha256: tilesManifest.sha256, out };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}
