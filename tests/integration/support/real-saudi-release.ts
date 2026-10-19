import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "../../../scripts/jenan-map/build.mjs";
import { FONT_STACKS } from "../../../scripts/jenan-map/glyphs.mjs";
import { buildStyle } from "../../../scripts/jenan-map/styles.mjs";

// Shared by the real-data suites (acceptance and local provisioning): builds a map release from REAL Saudi data through the same
// offline operator path an administrator uses, with nothing synthetic. The environment (DATABASE_URL, storage and staging roots,
// JENAN_MAP_BUILD_ACTOR) must be set before the first call, because the services read it when they are first imported.

export type TilesManifest = { source: { name: string; build: string; osmReplicationTime: string; schema: string | number } };
export type RealArchive = { file: string; manifest: TilesManifest };

export const realDataRoot = () => path.resolve(".jenan-map-data");

/** Real-data suites write to the database, so they only ever run against a disposable loopback database with one of these names. */
export const DISPOSABLE_DATABASES = ["/jenan_map_test", "/jenan_map_e2e"];
export function assertDisposableDatabase(databaseUrl: string | undefined) {
  const url = new URL(databaseUrl ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !DISPOSABLE_DATABASES.includes(url.pathname)) {
    throw new Error(`Only a disposable loopback database (${DISPOSABLE_DATABASES.join(" or ")}) may be used`);
  }
}

/** The real PMTiles archive in `.jenan-map-data/<directory>` together with the manifest that pins its source and build. */
export async function realArchive(directory: string): Promise<RealArchive> {
  const folder = path.join(realDataRoot(), directory);
  const name = (await readdir(folder)).find((entry) => entry.endsWith(".pmtiles"));
  if (!name) throw new Error(`No PMTiles archive in ${folder}`);
  return { file: path.join(folder, name), manifest: JSON.parse(await readFile(path.join(folder, `${name}.manifest.json`), "utf8")) };
}

async function vectorLayersOf(tilesFile: string) {
  const { PMTiles } = await import("pmtiles");
  const handle = await open(tilesFile, "r");
  try {
    const archive = new PMTiles({ getKey: () => tilesFile, getBytes: async (offset: number, length: number) => {
      const bytes = Buffer.alloc(length);
      const read = await handle.read(bytes, 0, length, offset);
      return { data: Uint8Array.from(bytes.subarray(0, read.bytesRead)).buffer };
    } });
    return ((await archive.getMetadata()) as { vector_layers: Array<{ id: string }> }).vector_layers;
  } finally { await handle.close(); }
}

export type RealReleaseInput = {
  /** Names the staged files of this release; unique per release inside the staging folder. */
  label: string;
  archive: RealArchive;
  actor: string;
  /** Private staging folder (the same one JENAN_MAP_STAGING_ROOT points at). */
  staging: string;
  /** Which of the two Jenan PRO styles the release carries; a release carries exactly one. */
  theme?: "light" | "dark";
  /** Folder prepared by prepare-saudi-import (features, boundary, original sources, coverage, bindings). */
  stage?: string;
};

/** Creates a release, builds its real features offline, imports every artifact through the validated import path and binds the layers. */
export async function createRealRelease({ label, archive, actor, staging, theme = "light", stage = path.resolve(process.env.JENAN_MAP_ACCEPTANCE_STAGE ?? ".jenan-map-data/stage") }: RealReleaseInput) {
  const service = await import("@/services/jenan-map/service");
  const ingestion = await import("@/services/jenan-map/ingestion");
  const layerIngestion = await import("@/services/jenan-map/layer-ingestion");
  const validation = await import("@/services/jenan-map/validation");
  const { source } = archive.manifest;
  const created = await service.command({
    action: "create", version: `${label}-${randomUUID().slice(0, 8)}`, source: `${source.name} build ${source.build}`,
    sourceDate: source.osmReplicationTime, license: "ODbL-1.0",
  }, actor) as { id: string };

  // The offline importer reads the prepared real staging folder (features, boundary, original sources, coverage).
  await mkdir(path.join(staging, label), { mode: 0o700 });
  for (const name of await readdir(stage)) await copyFile(path.join(stage, name), path.join(staging, `${label}-${name}`));
  const importJson = JSON.parse(await readFile(path.join(stage, "import.json"), "utf8"));
  const prefixed = { ...importJson, featuresFile: `${label}-features.geojson`, boundaryFile: `${label}-boundary.geojson`,
    sourceFiles: importJson.sourceFiles.map((entry: { filename: string }) => ({ ...entry, filename: `${label}-${entry.filename}` })) };
  await writeFile(path.join(staging, `${label}-import.json`), JSON.stringify(prefixed));
  await build(["--release", created.id, "--manifest", `${label}-import.json`]);

  const importArtifact = async (kind: string, filename: string, file: string, publicSafe: boolean, license: string) => {
    const bytes = await readFile(file);
    // The logical name is unique per asset (the three font stacks all contain 0-255.pbf); a file's basename is not.
    const staged = `${label}-${filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}`;
    if (!existsSync(path.join(staging, staged))) await copyFile(file, path.join(staging, staged));
    const metadata = ingestion.importSchema.parse({ kind, filename, sha256: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length, publicSafe,
      exportAllowed: publicSafe, ...(publicSafe ? { exportLicense: license } : {}), confirmation: "IMPORT OWNED MAP ARTIFACT" });
    return ingestion.ingestArtifact(created.id, metadata, await ingestion.localImportStream(staged), actor);
  };

  const tilesName = path.basename(archive.file);
  const style = buildStyle({ theme, language: "ar", releaseBase: validation.releaseAssetBase(created.id), tileFilename: tilesName });
  const styleFile = path.join(staging, `${label}-style.json`);
  await writeFile(styleFile, JSON.stringify(style));
  const schemaFile = path.join(staging, `${label}-schema.json`);
  await writeFile(schemaFile, JSON.stringify({ version: String(source.schema), vector_layers: (await vectorLayersOf(archive.file)).map(({ id }) => ({ id })) }));
  const { featuresFile, boundaryFile, sourceFiles, clipAdministrativeToBoundary, layers, confirmation, ...coverage } = importJson as Record<string, unknown>;
  void featuresFile; void boundaryFile; void sourceFiles; void clipAdministrativeToBoundary; void confirmation;
  const coverageFile = path.join(staging, `${label}-coverage.json`);
  await writeFile(coverageFile, JSON.stringify({ ...coverage, layers }));

  await importArtifact("pmtiles", tilesName, archive.file, true, "ODbL-1.0");
  await importArtifact("style", "style.json", styleFile, true, "Jenan PRO Map style");
  await importArtifact("schema", "schema.json", schemaFile, false, "");
  await importArtifact("coverage", "coverage.json", coverageFile, false, "");
  const glyphRoot = path.join(realDataRoot(), "glyphs");
  const glyphManifest = JSON.parse(await readFile(path.join(glyphRoot, "manifest.json"), "utf8")) as { files: Array<{ filename: string }> };
  for (const entry of glyphManifest.files.filter((item) => FONT_STACKS.includes(item.filename.split("/")[0]))) {
    await importArtifact("glyphs", entry.filename, path.join(glyphRoot, entry.filename), true, "OFL-1.1");
  }

  // The prepared bindings come from the real style (every style layer claimed once), so nothing is adjusted here.
  const bound = layerIngestion.bindLayersSchema.parse(JSON.parse(await readFile(path.join(stage, "bindings.json"), "utf8")));
  const claimed = new Set(bound.layers.flatMap((layer) => layer.styleLayerIds));
  const drawn = new Set<string>(style.layers.map((layer: { id: string }) => layer.id));
  if (claimed.size !== drawn.size || [...drawn].some((id) => !claimed.has(id))) throw new Error("The prepared bindings do not claim exactly the style layers");
  await layerIngestion.ingestLayerBindings(created.id, bound, actor);
  return created.id;
}
