#!/usr/bin/env node
// Writes the Jenan PRO Map Light and Dark styles for one release into .jenan-map-data/styles (never committed).
//   npm run jenan-map:styles -- --release=<release-uuid> --tiles=saudi-20261017-z15.pmtiles [--language=ar|en|bilingual]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStyle, styleLayerGroups, THEMES } from "./styles.mjs";

export async function main(argv) {
  const options = Object.fromEntries(argv.map((arg) => arg.replace(/^--/, "").split("=")));
  const release = options.release, tiles = options.tiles, language = options.language ?? "ar";
  if (!/^[a-f0-9-]{36}$/.test(release ?? "")) throw new Error("--release=<release uuid> is required");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,139}\.pmtiles$/.test(tiles ?? "")) throw new Error("--tiles=<filename>.pmtiles is required");
  const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".jenan-map-data", "styles");
  await mkdir(out, { recursive: true });
  const written = [];
  for (const theme of THEMES) {
    const style = buildStyle({ theme, language, releaseBase: `/api/jenan-map/releases/${release}`, tileFilename: tiles });
    const file = path.join(out, `jenan-pro-map-${theme}-${language}.style.json`);
    await writeFile(file, JSON.stringify(style, null, 2) + "\n", { flag: "w" });
    await writeFile(file.replace(".style.json", ".layers.json"), JSON.stringify(styleLayerGroups(style), null, 2) + "\n");
    written.push(file);
  }
  console.log(written.join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exit(1); });
}