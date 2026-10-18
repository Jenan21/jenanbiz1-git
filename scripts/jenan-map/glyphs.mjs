#!/usr/bin/env node
// Downloads the Arabic- and Latin-capable glyph ranges the Jenan PRO Map styles use, from the Protomaps basemaps-assets repository
// (Noto Sans, SIL Open Font License 1.1), pins every file by SHA-256 and writes a manifest. Output: .jenan-map-data/glyphs (never committed).
//   npm run jenan-map:glyphs
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GLYPH_SOURCE = {
  repository: "https://github.com/protomaps/basemaps-assets",
  revision: "main",
  rawBase: "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts",
  license: "OFL-1.1",
  licenseUrl: "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts/OFL.txt",
  copyright: "Copyright 2022 The Noto Project Authors (https://github.com/notofonts)",
  ownership: "OPEN_LICENSE",
};
export const FONT_STACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
// Latin + Latin Extended, Arabic, Arabic Supplement/Extended, general punctuation, Arabic Presentation Forms A and B (shaped letters).
export const GLYPH_RANGES = ["0-255", "256-511", "1536-1791", "1792-2047", "8192-8447", "64256-64511", "64512-64767", "64768-65023", "65024-65279", "65280-65535"];

export const glyphUrl = (stack, range) => {
  if (!FONT_STACKS.includes(stack) || !GLYPH_RANGES.includes(range)) throw new Error("Unreviewed glyph request");
  return `${GLYPH_SOURCE.rawBase}/${encodeURIComponent(stack)}/${range}.pbf`;
};
export const glyphName = (stack, range) => `${stack}/${range}.pbf`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function main() {
  const out = path.join(root, ".jenan-map-data", "glyphs");
  const files = [];
  for (const stack of FONT_STACKS) {
    await mkdir(path.join(out, stack), { recursive: true });
    for (const range of GLYPH_RANGES) {
      const response = await fetch(glyphUrl(stack, range), { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Glyph download failed (${response.status}): ${stack} ${range}`);
      // Streamed to disk and verified afterwards from the file itself, never held in memory or rewritten from the response.
      const target = path.join(out, stack, `${range}.pbf`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { flags: "w", mode: 0o600 }));
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(target)) hash.update(chunk);
      files.push({ filename: glyphName(stack, range), sha256: hash.digest("hex"), byteSize: (await stat(target)).size });
    }
  }
  const license = await fetch(GLYPH_SOURCE.licenseUrl, { signal: AbortSignal.timeout(60_000) });
  if (!license.ok || !license.body) throw new Error(`License download failed (${license.status})`);
  await pipeline(Readable.fromWeb(license.body), createWriteStream(path.join(out, "OFL.txt"), { flags: "w", mode: 0o600 }));
  const manifest = { source: GLYPH_SOURCE, fonts: FONT_STACKS, ranges: GLYPH_RANGES, downloadedAt: new Date().toISOString(), files };
  await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`glyphs: ${files.length} files, ${(files.reduce((sum, f) => sum + f.byteSize, 0) / 1024 ** 2).toFixed(1)} MB -> ${out}`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
