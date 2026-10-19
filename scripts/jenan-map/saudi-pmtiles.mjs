#!/usr/bin/env node
// One command that turns the public OpenStreetMap-derived Protomaps build into a real Saudi PMTiles archive on this machine:
//   npm run jenan-map:saudi-pmtiles            (all of Saudi Arabia, zoom 0-15, about 1 GB)
//   npm run jenan-map:saudi-pmtiles -- --maxzoom=12 --build=20261017
// Nothing here talks to the database or publishes a release; the output goes to .jenan-map-data/ (never committed).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_VERSION = "1.31.2";
// Pinned from the official GitHub release assets (trust on first use, then fixed); a different archive is refused.
export const TOOL_ARCHIVES = {
  "win32-x64": { file: `go-pmtiles_${TOOL_VERSION}_Windows_x86_64.zip`, sha256: "a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1", binary: "pmtiles.exe" },
  "linux-x64": { file: `go-pmtiles_${TOOL_VERSION}_Linux_x86_64.tar.gz`, sha256: "3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f", binary: "pmtiles" },
  "linux-arm64": { file: `go-pmtiles_${TOOL_VERSION}_Linux_arm64.tar.gz`, sha256: "f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1", binary: "pmtiles" },
  "darwin-x64": { file: `go-pmtiles-${TOOL_VERSION}_Darwin_x86_64.zip`, sha256: "1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b", binary: "pmtiles" },
  "darwin-arm64": { file: `go-pmtiles-${TOOL_VERSION}_Darwin_arm64.zip`, sha256: "40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d", binary: "pmtiles" },
};
export const SOURCE = {
  name: "Protomaps basemap build (OpenStreetMap + Natural Earth)",
  baseUrl: "https://build.protomaps.com",
  license: "ODbL-1.0",
  licenseUrl: "https://www.openstreetmap.org/copyright",
  attribution: "© OpenStreetMap contributors (ODbL 1.0); Natural Earth (public domain); tiles built with Protomaps/planetiler",
  ownership: "OPEN_LICENSE",
};
// Saudi Arabia with a small margin; neighbouring countries inside the box are context, not Jenan-owned data.
export const SAUDI_BBOX = [34.4, 16.0, 55.8, 32.4];

export const buildUrl = (build) => {
  if (!/^\d{8}$/.test(build)) throw new Error("--build must look like YYYYMMDD");
  return `${SOURCE.baseUrl}/${build}.pmtiles`;
};
export function parseArgs(argv) {
  const options = { maxzoom: 15, build: null, out: ".jenan-map-data/saudi", dryRun: false };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "maxzoom") options.maxzoom = Number(value);
    else if (key === "build") options.build = value;
    else if (key === "out") options.out = value;
    else if (key === "dry-run") options.dryRun = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  if (!Number.isInteger(options.maxzoom) || options.maxzoom < 6 || options.maxzoom > 15) throw new Error("--maxzoom must be an integer from 6 to 15");
  return options;
}
export function toolKey(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  if (!TOOL_ARCHIVES[key]) throw new Error(`No pinned pmtiles tool for ${key}`);
  return key;
}
export function buildManifest({ build, maxzoom, sha256, byteSize, metadata, tool, downloadedAt }) {
  const sourceTime = metadata["planetiler:osm:osmosisreplicationtime"];
  if (!sourceTime || !Number.isFinite(Date.parse(sourceTime))) throw new Error("Source OSM replication time missing from archive metadata");
  return {
    kind: "pmtiles", file: `saudi-${build}-z${maxzoom}.pmtiles`, sha256, byteSize,
    source: { ...SOURCE, url: buildUrl(build), build, osmReplicationTime: new Date(sourceTime).toISOString(), schema: metadata.version, generator: `planetiler ${metadata["planetiler:version"]}` },
    region: { name: "Saudi Arabia (with margin)", bbox: SAUDI_BBOX, minzoom: 0, maxzoom },
    vectorLayers: (metadata.vector_layers ?? []).map((layer) => layer.id),
    tool: { name: "go-pmtiles", version: TOOL_VERSION, ...tool }, downloadedAt,
    notice: "OpenStreetMap-derived data under ODbL; classified OPEN_LICENSE and never presented as Jenan-owned data.",
  };
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha256Of = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
// Fixed system location for the archiver (bsdtar understands both zip and tar.gz); no PATH search.
const archiver = () => (process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar");

async function ensureTool(dir) {
  const spec = TOOL_ARCHIVES[toolKey()];
  const toolDir = path.join(dir, "tools", `pmtiles-${TOOL_VERSION}`);
  const binary = path.join(toolDir, spec.binary);
  if (existsSync(binary)) return binary;
  await mkdir(toolDir, { recursive: true });
  const archive = path.join(toolDir, spec.file);
  const response = await fetch(`https://github.com/protomaps/go-pmtiles/releases/download/v${TOOL_VERSION}/${spec.file}`, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`pmtiles tool download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  if (await sha256Of(archive) !== spec.sha256) { await rm(archive); throw new Error("pmtiles tool checksum mismatch; refusing to run it"); }
  const unpacked = spawnSync(archiver(), ["-xf", archive, "-C", toolDir], { stdio: "inherit", shell: false });
  if (unpacked.status !== 0) throw new Error("Could not unpack the pmtiles tool");
  if (process.platform !== "win32") await chmod(binary, 0o755);
  await rm(archive);
  return binary;
}

async function latestBuild() {
  for (let back = 0; back < 10; back++) {
    const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
    const head = await fetch(buildUrl(day), { method: "HEAD", signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (head?.ok) return day;
  }
  throw new Error("No Protomaps build found in the last 10 days; pass --build=YYYYMMDD");
}

function run(binary, args, capture = false) {
  const result = spawnSync(binary, args, capture ? { encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 } : { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) throw new Error(`pmtiles ${args[0]} failed${capture ? `: ${result.stderr}` : ""}`);
  return result.stdout;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const dir = path.resolve(root, options.out);
  const dataRoot = path.resolve(root, ".jenan-map-data");
  await mkdir(dir, { recursive: true });
  const binary = await ensureTool(dataRoot);
  const build = options.build ?? await latestBuild();
  const name = `saudi-${build}-z${options.maxzoom}.pmtiles`;
  const target = path.join(dir, name), partial = `${target}.partial`;
  console.log(`source ${buildUrl(build)}\nregion  Saudi Arabia bbox ${SAUDI_BBOX.join(",")}  zoom 0-${options.maxzoom}`);
  if (options.dryRun) { run(binary, ["extract", buildUrl(build), partial, `--bbox=${SAUDI_BBOX.join(",")}`, `--maxzoom=${options.maxzoom}`, "--dry-run"]); return; }
  if (existsSync(target)) throw new Error(`${target} already exists; choose another --out or delete it`);
  await rm(partial, { force: true });
  run(binary, ["extract", buildUrl(build), partial, `--bbox=${SAUDI_BBOX.join(",")}`, `--maxzoom=${options.maxzoom}`]);
  run(binary, ["verify", partial]);
  const metadata = JSON.parse(run(binary, ["show", partial, "--metadata"], true));
  const manifest = buildManifest({
    build, maxzoom: options.maxzoom, sha256: await sha256Of(partial), byteSize: (await stat(partial)).size, metadata,
    tool: { path: path.relative(root, binary) }, downloadedAt: new Date().toISOString(),
  });
  await rename(partial, target);
  await writeFile(`${target}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(`\nreal Saudi PMTiles: ${target}\n  ${(manifest.byteSize / 1024 ** 2).toFixed(0)} MB, sha256 ${manifest.sha256}\n  OSM data time ${manifest.source.osmReplicationTime}, license ${manifest.source.license}`);
  console.log(`manifest: ${target}.manifest.json`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}
