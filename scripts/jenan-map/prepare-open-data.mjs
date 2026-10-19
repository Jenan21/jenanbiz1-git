#!/usr/bin/env node
// Operator-only: never invoked by an HTTP request, never publishes a release.
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPrivateDirectory } from "./fs-safety.mjs";
import { importedFeature, OPEN_BOUNDARY_NOTICE, OSM_ATTRIBUTION, validateProvenance } from "./open-data.mjs";

const API = "https://www.geoboundaries.org/api/current/gbOpen/SAU";
const GCC = "https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf";
const REVISION = "9469f09592ced973a3448cf66b6100b741b64c0d";
const MAX_JSON = 128 * 1024 * 1024;
const MAX_SEARCH = 100_000;
const collection = (features) => ({ type: "FeatureCollection", features });
const checksum = async (filename) => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filename)) hash.update(bytes);
  return hash.digest("hex");
};
const json = async (filename) => {
  // Size and content come from the same descriptor, so the file cannot change between the check and the read.
  const handle = await open(filename, "r");
  try {
    if ((await handle.stat()).size > MAX_JSON) throw new Error("GeoJSON exceeds bounded preparation limit");
    return JSON.parse(await handle.readFile({ encoding: "utf8" }));
  } finally { await handle.close(); }
};
// Upstream metadata is untrusted text. Only the named fields below are kept (as bounded strings or numbers) before anything is
// written, so a hostile response can neither add keys nor write large or structured values to disk.
const METADATA_TEXT = ["boundaryID", "boundaryName", "boundaryISO", "boundaryYearRepresented", "boundaryYear", "boundaryType", "boundaryCanonical",
  "boundarySource", "boundaryLicense", "licenseDetail", "licenseSource", "boundarySourceURL", "sourceDataUpdateDate", "buildDate", "Continent",
  "UNSDG-region", "UNSDG-subregion", "worldBankIncomeGroup", "admUnitCount", "meanVertices", "minBoundaryYear", "maxBoundaryYear", "gjDownloadURL"];
export function retainedMetadata(metadata) {
  const kept = {};
  for (const key of METADATA_TEXT) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) kept[key] = value;
    else if (typeof value === "string") kept[key] = value.slice(0, 2000);
  }
  return kept;
}
const save = (filename, value) => writeFile(filename, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });

// Everything below that comes from the network is untrusted. Downloads and the URLs recorded for them may only name these hosts, over HTTPS.
const REVIEWED_HOSTS = ["www.geoboundaries.org", "geoboundaries.org", "media.githubusercontent.com", "raw.githubusercontent.com", "github.com", "download.geofabrik.de"];
export function reviewedUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Unreviewed acquisition URL"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !REVIEWED_HOSTS.includes(parsed.hostname)) throw new Error("Unreviewed acquisition/redirect host");
  return parsed;
}

// Text that is recorded as provenance must be plain, visible and of bounded length: no control, line-separator or text-direction characters that
// could mislead the operator who reviews it. Anything else is refused, never truncated or repaired.
const VISIBLE_TEXT = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+$/u;
export function upstreamText(value, label, max = 300) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max || !VISIBLE_TEXT.test(text)) throw new Error(`Unreviewed upstream ${label}`);
  return text;
}
export function upstreamBoundaryId(value, level) {
  if (typeof value !== "string" || !new RegExp(`^SAU-${level}-[0-9]{1,12}$`).test(value)) throw new Error("Unreviewed upstream boundaryID");
  return value;
}

// A metadata answer is a few kilobytes; anything larger is not metadata and is not read.
const MAX_METADATA_BYTES = 1024 * 1024;
async function boundedMetadata(response) {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_METADATA_BYTES) throw new Error("Upstream metadata exceeds the bounded size");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_METADATA_BYTES) throw new Error("Upstream metadata exceeds the bounded size");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
// GeoJSON text sequences (RFC 8142) prefix each record with the ASCII record separator.
const RECORD_SEPARATOR = String.fromCharCode(0x1e);
export const stripRecordSeparator = (line) => (line.startsWith(RECORD_SEPARATOR) ? line.slice(RECORD_SEPARATOR.length) : line);

// Operator tools run from an explicit, fixed directory, never from a PATH search that a writable directory could shadow.
const FIXED_TOOL_DIRECTORIES = ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"];
export function resolveTool(name, env = process.env, exists = existsSync) {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error("Invalid operator tool name");
  const configured = env.JENAN_MAP_TOOLS_DIR;
  if (configured && !path.isAbsolute(configured)) throw new Error("JENAN_MAP_TOOLS_DIR must be an absolute directory");
  const suffixes = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const directory of configured ? [configured] : FIXED_TOOL_DIRECTORIES) {
    for (const suffix of suffixes) {
      const candidate = path.join(directory, name + suffix);
      if (exists(candidate)) return candidate;
    }
  }
  throw new Error(`Operator tool ${name} not found in ${configured ?? FIXED_TOOL_DIRECTORIES.join(", ")}; install a reviewed version or set JENAN_MAP_TOOLS_DIR`);
}

function tool(name, args) {
  const result = spawnSync(resolveTool(name), args, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) throw new Error(`Operator tool ${name} failed; install a reviewed version and retry in a NEW work directory`);
}

function toolVersion(name) {
  const result = spawnSync(resolveTool(name), ["--version"], { encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) throw new Error(`Installed reviewed operator tool required: ${name}`);
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

async function download(url, filename) {
  let response;
  for (let redirects = 0; redirects <= 5; redirects++) {
    reviewedUrl(url);
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(60 * 60 * 1000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (!response.headers.get("location") || redirects === 5) throw new Error("Invalid acquisition redirect");
    url = new URL(response.headers.get("location"), url).href;
    await response.body?.cancel();
  }
  if (!response.ok || !response.body) throw new Error(`Acquisition failed: ${url} (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filename, { flags: "wx", mode: 0o600 }));
}

export function boundaryLicense(metadata) {
  const license = metadata.boundaryLicense ?? "";
  if (/Open Data Commons Open Database|ODbL|Open Database License/i.test(license)) return "ODbL-1.0";
  if (/Attribution.Share.?Alike 2\.0|CC.?BY.?SA.?2\.0/i.test(license)) return "CC-BY-SA-2.0";
  if (/Creative Commons Attribution 4\.0|CC.?BY.?4\.0/i.test(license)) return "CC-BY-4.0";
  throw new Error(`Unreviewed upstream boundary license: ${license}`);
}

export function boundaryAttribution(metadata) {
  const license = boundaryLicense(metadata);
  if (typeof metadata.boundarySource !== "string" || !metadata.boundarySource.trim()) throw new Error("Individual upstream boundary attribution required");
  return `geoBoundaries / William & Mary (product CC BY 4.0; https://www.geoboundaries.org; https://creativecommons.org/licenses/by/4.0/); upstream ${metadata.boundarySource}, ${license}${license === "CC-BY-SA-2.0" ? " (https://creativecommons.org/licenses/by-sa/2.0/)" : ""}; represented year precision; upstream simplified geometry; ${OSM_ATTRIBUTION}`;
}

export async function acquire(root, pinnedBoundariesOnly = false) {
  const importedAt = new Date().toISOString();
  const sources = [];
  for (const level of ["ADM0", "ADM1", "ADM2"]) {
    const metadataUrl = pinnedBoundariesOnly
      ? `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${REVISION}/releaseData/gbOpen/SAU/${level}/geoBoundaries-SAU-${level}-metaData.json`
      : `${API}/${level}/`;
    const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(60_000) });
    if (level !== "ADM0" && response.status === 404) continue;
    if (!response.ok) throw new Error(`geoBoundaries ${level} metadata unavailable (${response.status})`);
    const metadata = await boundedMetadata(response);
    if (metadata.boundaryISO !== "SAU" || metadata.boundaryType !== level) throw new Error(`Unverified geoBoundaries ${level} country`);
    const license = boundaryLicense(metadata);
    // What is recorded as provenance comes from the network, so it is checked before anything is written.
    const boundaryId = upstreamBoundaryId(metadata.boundaryID, level);
    const boundarySource = upstreamText(metadata.boundarySource, "boundarySource");
    const sourceUrl = pinnedBoundariesOnly
      ? `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${REVISION}/releaseData/gbOpen/SAU/${level}/geoBoundaries-SAU-${level}_simplified.geojson`
      : reviewedUrl(metadata.gjDownloadURL).href;
    await save(path.join(root, `${level}-metadata.json`), retainedMetadata(metadata));
    const filename = path.join(root, `${level}.geojson`);
    await download(sourceUrl, filename);
    const year = String(metadata.boundaryYearRepresented ?? metadata.boundaryYear).match(/\d{4}/)?.[0];
    if (!year) throw new Error("geoBoundaries represented year missing; operator review required");
    sources.push({ level, file: filename, sha256: await checksum(filename), provenance: {
      source: `geoBoundaries gbOpen SAU ${level} ${boundaryId}`,
      organization: `geoBoundaries / William & Mary; upstream: ${boundarySource}`,
      url: sourceUrl, sourceDate: `${year}-01-01T00:00:00.000Z`, importedAt,
      license, attribution: boundaryAttribution({ boundaryLicense: metadata.boundaryLicense, boundarySource }),
    } });
  }
  if (pinnedBoundariesOnly) {
    await save(path.join(root, "boundary-sources.json"), { boundaries: sources, osm: null,
      reviewRequired: "Supply pinned GCC .osm.pbf, source timestamp, SHA-256 and ODbL provenance; no synthetic fallback" });
    return { boundaries: sources };
  }
  // Retain distributor state as evidence, but use the actual PBF header for its source timestamp.
  await download("https://download.geofabrik.de/asia/gcc-states-updates/state.txt", path.join(root, "osm-state.txt"));
  const timestamp = (await readFile(path.join(root, "osm-state.txt"), "utf8")).match(/^timestamp=(.+)$/m)?.[1]?.replaceAll("\\:", ":");
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) throw new Error("Geofabrik replication timestamp unavailable");
  const osmFile = path.join(root, "gcc-states.osm.pbf");
  await download(GCC, osmFile);
  const info = spawnSync(resolveTool("osmium"), ["fileinfo", "-g", "header.option.osmosis_replication_timestamp", osmFile], { encoding: "utf8", shell: false });
  const sourceTimestamp = info.stdout?.trim();
  if (info.error || info.status !== 0 || !sourceTimestamp || !Number.isFinite(Date.parse(sourceTimestamp))) throw new Error("Installed osmium and actual PBF replication timestamp required");
  const config = { boundaries: sources, osm: { file: osmFile, sha256: await checksum(osmFile), provenance: {
    source: "OpenStreetMap via Geofabrik GCC states extract", organization: "OpenStreetMap contributors / Geofabrik",
    url: GCC, sourceDate: new Date(sourceTimestamp).toISOString(), importedAt, license: "ODbL-1.0", attribution: OSM_ATTRIBUTION,
  } } };
  await save(path.join(root, "sources.json"), config);
  return config;
}

async function verifySource(source) {
  if (!source || typeof source.file !== "string" || !path.isAbsolute(source.file) || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "") ||
      await checksum(source.file) !== source.sha256) throw new Error("Pinned absolute source file and matching SHA-256 required");
  return validateProvenance(source.provenance);
}

export async function prepare(config, root, releaseId) {
  if (!/^[a-f0-9-]{36}$/.test(releaseId)) throw new Error("Existing Draft release UUID required");
  const adm0 = config.boundaries?.find((source) => source.level === "ADM0");
  if (!adm0 || new Set(config.boundaries.map((source) => source.level)).size !== config.boundaries.length) throw new Error("One Saudi ADM0 required");
  const sourceFiles = [];
  for (const source of config.boundaries) {
    if (!["ADM0", "ADM1", "ADM2"].includes(source.level)) throw new Error("Unsupported administrative level");
    await verifySource(source);
    const filename = `original-${source.level}.geojson`;
    await copyFile(source.file, path.join(root, filename), constants.COPYFILE_EXCL);
    sourceFiles.push({ filename, level: source.level, sha256: source.sha256 });
    if (source.level !== "ADM0") {
      source.provenance = { ...source.provenance, attribution: `${source.provenance.attribution}; modified by Jenan PRO: GDAL/PostGIS intersection with reviewed unofficial ADM0; original source retained privately` };
    }
  }
  if ((await verifySource(config.osm)).license !== "ODbL-1.0") throw new Error("OSM ODbL required");
  const boundarySource = await json(adm0.file);
  if (boundarySource.type !== "FeatureCollection" || boundarySource.features?.length !== 1 ||
      boundarySource.features[0]?.properties?.shapeGroup !== "SAU" ||
      boundarySource.features[0]?.properties?.shapeType !== "ADM0" ||
      !["Polygon", "MultiPolygon"].includes(boundarySource.features[0]?.geometry?.type)) throw new Error("Single geoBoundaries ADM0 polygon/multipolygon required");
  const boundary = boundarySource.features[0];
  await save(path.join(root, "boundary.geojson"), boundary);
  const versions = Object.fromEntries(["osmium", "ogr2ogr", "tippecanoe"].map((name) => [name, toolVersion(name)]));
  const commands = [];
  const run = (name, args) => { commands.push({ executable: name, args }); tool(name, args); };
  run("osmium", ["extract", "-p", path.join(root, "boundary.geojson"), "-s", "complete_ways", config.osm.file, "-o", path.join(root, "saudi.osm.pbf")]);
  run("osmium", ["tags-filter", path.join(root, "saudi.osm.pbf"), "w/highway", "n/place", "-o", path.join(root, "roads-places.osm.pbf")]);
  run("osmium", ["export", path.join(root, "roads-places.osm.pbf"), "--add-unique-id=type_id", "-f", "geojsonseq", "-o", path.join(root, "osm.geojsonseq")]);
  const handles = {
    roads: await open(path.join(root, "roads-unclipped.geojsonseq"), "wx", 0o600),
    places: await open(path.join(root, "places-unclipped.geojsonseq"), "wx", 0o600),
  };
  try {
    for await (const line of createInterface({ input: createReadStream(path.join(root, "osm.geojsonseq")), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const feature = JSON.parse(stripRecordSeparator(line));
      const layer = feature.properties?.highway ? "roads" : feature.properties?.place ? "places" : null;
      if (!layer) continue;
      // Retain unnamed roads for rendering, but not as fabricated searchable names.
      const normalized = importedFeature(feature, "OpenStreetMap", layer);
      if (!normalized && layer !== "roads") continue;
      const output = normalized ?? { ...feature, properties: { category: "roads", layerId: "roads", source: "OpenStreetMap", sourceId: String(feature.properties["@id"] ?? feature.id ?? "") } };
      await handles[layer].write(JSON.stringify(output) + "\n");
    }
  } finally { for (const handle of Object.values(handles)) await handle.close(); }
  const layers = [];
  const searchFeatures = [];
  for (const id of ["base", "roads", "places", ...config.boundaries.filter((source) => source.level !== "ADM0").map((source) => source.level === "ADM1" ? "regions" : "governorates")]) {
    const source = config.boundaries.find((item) => item.level === ({ base: "ADM0", regions: "ADM1", governorates: "ADM2" })[id]);
    if (source && !["roads", "places"].includes(id)) {
      const data = await json(source.file);
      if (data.type !== "FeatureCollection" || !Array.isArray(data.features) ||
          data.features.some((feature) => feature.properties?.shapeGroup !== "SAU" || feature.properties?.shapeType !== source.level)) throw new Error("Administrative source country/level mismatch");
      const features = data.features.map((feature) => importedFeature(feature, "geoBoundaries", id)).filter(Boolean);
      await save(path.join(root, `${id}-unclipped.geojson`), collection(features));
    }
    const input = path.join(root, `${id}-unclipped.${source && !["roads", "places"].includes(id) ? "geojson" : "geojsonseq"}`);
    // complete_ways retains cross-border ways; clip their actual geometries, not only bounding boxes.
    run("ogr2ogr", ["-f", "GeoJSONSeq", path.join(root, `${id}.geojsonseq`), input, "-clipsrc", path.join(root, "boundary.geojson"), "-makevalid", "-lco", "RS=NO"]);
    let count = 0;
    for await (const line of createInterface({ input: createReadStream(path.join(root, `${id}.geojsonseq`)), crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      count++;
      const feature = JSON.parse(stripRecordSeparator(line));
      // Only actual source names enter search; unnamed roads still render in the tile archive.
      if (id !== "base" && typeof feature.properties?.label === "string") {
        if (searchFeatures.length >= MAX_SEARCH) throw new Error("Real search exceeds 100,000-feature v1 limit; do not truncate or publish");
        searchFeatures.push(feature);
      }
    }
    if (!count) continue;
    layers.push({ id, styleLayerIds: [id], searchCategories: id === "base" ? [] : [id],
      visibility: "public", confidence: null, provenance: source && !["roads", "places"].includes(id) ? source.provenance : config.osm.provenance });
  }
  if (!layers.some((layer) => layer.id === "roads") || !layers.some((layer) => layer.id === "places")) throw new Error("Empty real roads/places extraction");
  const searchBytes = Buffer.from(JSON.stringify(collection(searchFeatures)));
  if (!searchFeatures.length || searchBytes.length > MAX_JSON) throw new Error("Real search exceeds bounded v1 import; do not truncate");
  await writeFile(path.join(root, "features.geojson"), searchBytes, { flag: "wx", mode: 0o600 });
  const boundarySha256 = await checksum(path.join(root, "boundary.geojson"));
  const coverage = {
    countryCode: "SA", authoritative: false, coverageBasis: "geoBoundaries-ADM0",
    // Only the actual PostGIS import can verify coverage/topology; an operator must review before attesting.
    coverageVerified: false, unofficial: true, notice: OPEN_BOUNDARY_NOTICE,
    boundaryAuthority: "geoBoundaries open data — not a Saudi government authority",
    boundarySource: `${adm0.provenance.source}; SHA-256 ${adm0.sha256}`,
    boundarySha256, provenance: adm0.provenance, layers,
  };
  await save(path.join(root, "coverage-review-required.json"), coverage);
  await save(path.join(root, "import-review-required.json"), {
    ...coverage, featuresFile: "features.geojson", boundaryFile: "boundary.geojson", sourceFiles,
    clipAdministrativeToBoundary: sourceFiles.some((source) => source.level !== "ADM0"), confirmation: "BUILD OWNED SA DATA",
  });
  const base = `/api/jenan-map/releases/${releaseId}`;
  const styleLayers = layers.map(({ id }) => id === "roads"
    ? { id, type: "line", source: "saudi", "source-layer": id, paint: { "line-color": "#237884", "line-width": 1.2 } }
    : ["base", "regions", "governorates"].includes(id)
      ? { id, type: "line", source: "saudi", "source-layer": id, paint: { "line-color": "#387e92", "line-width": 1, "line-dasharray": [3, 2] } }
      : { id, type: "symbol", source: "saudi", "source-layer": id, layout: { "text-field": ["coalesce", ["get", "name_ar"], ["get", "name_en"], ["get", "label"]], "text-font": ["Noto Sans Arabic"], "text-size": 13 }, paint: { "text-color": "#d3f6f3", "text-halo-color": "#071723", "text-halo-width": 1.5 } });
  run("tippecanoe", ["-o", path.join(root, "saudi.pmtiles"), "-Z3", "-z14", "--drop-densest-as-needed",
    "--attribution", `${OSM_ATTRIBUTION}; ${config.boundaries.map((source) => source.provenance.attribution).join("; ")}; ${OPEN_BOUNDARY_NOTICE}`,
    ...layers.flatMap(({ id }) => ["-L", `${id}:${path.join(root, `${id}.geojsonseq`)}`])]);
  await save(path.join(root, "style.json"), { version: 8, glyphs: `${base}/glyphs/{fontstack}/{range}.pbf`,
    sources: { saudi: { type: "vector", url: `pmtiles://${base}/pmtiles/saudi.pmtiles`, attribution: `${OSM_ATTRIBUTION}; ${config.boundaries.map((source) => source.provenance.attribution).join("; ")}; ${OPEN_BOUNDARY_NOTICE}` } }, layers: styleLayers });
  await save(path.join(root, "schema.json"), { version: "sa-open-v1", vector_layers: layers.map(({ id }) => ({ id })) });
  await save(path.join(root, "bindings.json"), { layers, confirmation: "BIND MAP LAYERS" });
  const evidence = [];
  for (const filename of ["features.geojson", "boundary.geojson", "saudi.pmtiles", "style.json", "schema.json", "bindings.json"]) {
    evidence.push({ filename, sha256: await checksum(path.join(root, filename)), byteSize: (await stat(path.join(root, filename))).size });
  }
  await save(path.join(root, "prepared-artifacts.json"), { releaseId, evidence, reviewRequired: true,
    runtime: process.version, versions, commands,
    transformations: "osmium complete_ways extract; exact ADM0 polygon clipping and GDAL makevalid; upstream simplification retained; tippecanoe zoom 3-14 density generalization",
    missing: ["Reviewed coverageVerified attestation", "Licensed self-hosted Noto Sans Arabic glyph PBFs (Latin/Arabic ranges and all used labels)", "Private preview, approve and explicit publish"],
    searchScope: "All imported source-named roads/places and named administrative units; unnamed roads render only" });
}

async function main(args) {
  const [mode, rootArg, sourceArg, releaseId] = args;
  if (!["acquire", "acquire-pinned-boundaries", "prepare"].includes(mode) || !path.isAbsolute(rootArg ?? "") ||
      (mode !== "prepare" ? args.length !== 2 : args.length !== 4 || !path.isAbsolute(sourceArg ?? ""))) {
    throw new Error("Usage: acquire|acquire-pinned-boundaries /absolute/new-private-directory OR prepare /absolute/new-private-directory /absolute/sources.json DRAFT-UUID");
  }
  const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
  if (rootArg === publicRoot || rootArg.startsWith(publicRoot + path.sep)) throw new Error("Private operator directory required");
  await mkdir(rootArg, { mode: 0o700 }); // Existing directories refused; no overwrite/resume of immutable evidence.
  const root = await realpath(rootArg);
  if (root !== path.resolve(rootArg) || !(await isPrivateDirectory(root))) throw new Error("Private nonsymlink 0700 operator directory required");
  if (mode !== "prepare") await acquire(root, mode === "acquire-pinned-boundaries");
  else await prepare(await json(sourceArg), root, releaseId);
  console.log(JSON.stringify({ status: "prepared-not-published", directory: root }));
}
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
