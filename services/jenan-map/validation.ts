import type { FileHandle } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { PMTiles, tileIdToZxy } from "pmtiles";
import { MapError, type Artifact } from "./contracts";
import { openArtifact } from "./storage";
import { validateCoverage, validateProvenance } from "../../scripts/jenan-map/open-data.mjs";

const JSON_LIMIT = 16 * 1024 * 1024;
function invalid(): never { throw new MapError("ARTIFACT_FORMAT_INVALID", 422); }
function internal(value: { visibility?: unknown; internal?: unknown; publicSafe?: unknown } | undefined) {
  return value?.visibility === "internal" || value?.internal === true || value?.publicSafe === false;
}
export async function readJson(handle: FileHandle) {
  const info = await handle.stat();
  if (info.size > JSON_LIMIT) invalid();
  try { return JSON.parse((await handle.readFile()).toString("utf8")); }
  catch { return invalid(); }
}

async function readAt(handle: FileHandle, offset: number, size: number) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size < 1 || size > JSON_LIMIT) invalid();
  const data = Buffer.alloc(size);
  if ((await handle.read(data, 0, size, offset)).bytesRead !== size) invalid();
  return data;
}

function protobuf(bytes: Buffer): Map<number, Buffer[]> {
  let cursor = 0;
  const fields = new Map<number, Buffer[]>();
  const uint = () => {
    let value = 0;
    for (let shift = 0; shift < 49 && cursor < bytes.length; shift += 7) {
      const byte = bytes[cursor++]; value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
    }
    return invalid();
  };
  while (cursor < bytes.length) {
    const key = uint(), wire = key & 7, field = Math.floor(key / 8);
    if (field < 1) invalid();
    if (wire === 0) { const value = uint(); fields.set(field, [Buffer.from(String(value))]); continue; }
    if (wire === 1 || wire === 5) { cursor += wire === 1 ? 8 : 4; if (cursor > bytes.length) invalid(); continue; }
    if (wire !== 2) invalid();
    const length = uint(), end = cursor + length;
    if (end > bytes.length) invalid();
    fields.set(field, [...(fields.get(field) ?? []), bytes.subarray(cursor, end)]);
    cursor = end;
  }
  return fields;
}

export async function validateArtifactFormat(file: Artifact, handle: FileHandle) {
  if (file.kind === "pmtiles") {
    const h = await readAt(handle, 0, 127);
    if (h.subarray(0, 7).toString() !== "PMTiles" || h[7] !== 3 || h[99] !== 1 ||
        ![1, 2].includes(h[97]) || ![1, 2].includes(h[98]) || h[100] > h[101] || h[101] > 26) invalid();
    const n = (at: number) => { const value = Number(h.readBigUInt64LE(at)); if (!Number.isSafeInteger(value)) invalid(); return value; };
    const sections = [[n(8), n(16)], [n(24), n(32)], [n(40), n(48)], [n(56), n(64)]];
    let end = 127;
    for (const [offset, length] of sections) {
      if (offset < end || offset + length > Number(file.byteSize)) invalid();
      end = offset + length;
    }
    if (n(72) < 1 || n(80) < 1 || n(88) < 1 || !sections[0][1] || !sections[3][1]) invalid();
    const minLon = h.readInt32LE(102) / 1e7, minLat = h.readInt32LE(106) / 1e7;
    const maxLon = h.readInt32LE(110) / 1e7, maxLat = h.readInt32LE(114) / 1e7;
    if (minLon < 34 || maxLon > 56 || minLat < 15 || maxLat > 33 || minLon >= maxLon || minLat >= maxLat) invalid();
    const decode = (data: Buffer) => h[97] === 2 ? gunzipSync(data, { maxOutputLength: JSON_LIMIT }) : data;
    let metadata;
    try { metadata = JSON.parse(decode(await readAt(handle, ...sections[1] as [number, number])).toString("utf8")); }
    catch { return invalid(); }
    if (!Array.isArray(metadata.vector_layers) || !metadata.vector_layers.length ||
        metadata.vector_layers.some((v: { id?: unknown }) => typeof v.id !== "string")) invalid();
    if (file.publicSafe && (internal(metadata) || metadata.vector_layers.some(internal))) invalid();
    // Parse the actual root directory and verify its entries address retained tile/leaf bytes.
    const directory = decode(await readAt(handle, ...sections[0] as [number, number]));
    let cursor = 0;
    const uint = () => {
      let value = 0;
      for (let shift = 0; shift < 49 && cursor < directory.length; shift += 7) {
        const b = directory[cursor++]; value += (b & 127) * 2 ** shift;
        if (!(b & 128)) return value;
      }
      return invalid();
    };
    const count = uint();
    if (count < 1 || count > 1_000_000) invalid();
    let firstTileId = 0;
    for (let i = 0; i < count; i++) { const delta = uint(); if (i === 0) firstTileId = delta; }
    const runs = Array.from({ length: count }, uint);
    const lengths = Array.from({ length: count }, uint);
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const encoded = uint(), offset = encoded === 0 && i > 0 ? previous : encoded - 1;
      if (offset < 0 || lengths[i] < 1 || offset + lengths[i] > sections[runs[i] === 0 ? 2 : 3][1]) invalid();
      previous = offset + lengths[i];
    }
    if (cursor !== directory.length) invalid();
    const archive = new PMTiles({
      getKey: () => file.id,
      getBytes: async (offset, length) => {
        const data = await readAt(handle, offset, Math.min(length, Number(file.byteSize) - offset));
        return { data: Uint8Array.from(data).buffer };
      },
    }, undefined, async (data, compression) => {
      if (compression === 1) return data;
      if (compression !== 2) return invalid();
      return Uint8Array.from(gunzipSync(Buffer.from(data), { maxOutputLength: JSON_LIMIT })).buffer;
    });
    const sample = await archive.getZxy(...tileIdToZxy(firstTileId));
    if (!sample) invalid();
    const layers = protobuf(Buffer.from(sample.data)).get(3);
    if (!layers?.length) invalid();
    for (const layer of layers) {
      const fields = protobuf(layer), name = fields.get(1)?.[0]?.toString();
      if (fields.get(15)?.[0]?.toString() !== "2" || !metadata.vector_layers.some((v: { id: string }) => v.id === name)) invalid();
      for (const feature of fields.get(2) ?? []) {
        if (!protobuf(feature).get(4)?.[0]?.length) invalid();
      }
    }
    return { type: "pmtiles", layers: metadata.vector_layers.map((v: { id: string }) => v.id), minzoom: h[100], maxzoom: h[101] };
  }
  if (file.kind === "glyphs") {
    if (!/^[^/\\]{1,150}\/\d+-\d+\.pbf$/.test(file.filename)) invalid();
    const [start, end] = file.filename.split("/")[1].replace(".pbf", "").split("-").map(Number);
    if (start % 256 || end !== start + 255 || end > 65535) invalid();
    const bytes = await readAt(handle, 0, Number(file.byteSize));
    const stacks = protobuf(bytes).get(1);
    if (!stacks?.length) invalid();
    for (const stack of stacks) {
      const fields = protobuf(stack);
      const name = fields.get(1)?.[0]?.toString(), range = fields.get(2)?.[0]?.toString();
      if (`${name}/${range}.pbf` !== file.filename || !fields.get(3)?.length) invalid();
      for (const glyph of fields.get(3)!) {
        const values = protobuf(glyph);
        if (![1, 3, 4, 5, 6, 7].every((field) => values.has(field))) invalid();
        const id = Number(values.get(1)![0].toString());
        const width = Number(values.get(3)![0].toString()), height = Number(values.get(4)![0].toString());
        if (id < start || id > end || width > 512 || height > 512 ||
            width * height > 0 && values.get(2)?.[0]?.length !== width * height) invalid();
      }
    }
    return { type: "glyphs" };
  }
  if (file.kind === "sprite" && file.filename.endsWith(".png")) {
    const png = await readAt(handle, 0, 33);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
        png.subarray(12, 16).toString() !== "IHDR" || !png.readUInt32BE(16) || !png.readUInt32BE(20) ||
        png.readUInt32BE(16) > 8192 || png.readUInt32BE(20) > 8192) invalid();
    const { loadImage } = await import("@napi-rs/canvas");
    try { await loadImage(await readAt(handle, 0, Number(file.byteSize))); } catch { return invalid(); }
    return { type: "sprite", width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }
  const value = await readJson(handle);
  if (file.kind === "style") {
    if (validateStyleMin(value).length || value.version !== 8 || !Object.keys(value.sources ?? {}).length) invalid();
    if (file.publicSafe && (internal(value.metadata) || value.layers.some((layer: { metadata?: object }) => internal(layer.metadata)))) invalid();
  } else if (file.kind === "schema") {
    if (typeof value.version !== "string" || !Array.isArray(value.vector_layers) || !value.vector_layers.length ||
        value.vector_layers.some((layer: { id?: unknown }) => typeof layer.id !== "string")) invalid();
    if (internal(value) || value.vector_layers.some(internal)) invalid();
  } else if (file.kind === "coverage") {
    try { validateCoverage(value); } catch { invalid(); }
  } else if (file.kind === "geojson") {
    if (value.type !== "FeatureCollection" || !Array.isArray(value.features)) invalid();
  } else if (file.kind === "sprite") {
    if (!Object.keys(value).length || Object.values(value).some((entry) => {
      const v = entry as Record<string, number>;
      return !v || !["x", "y", "width", "height", "pixelRatio"].every((k) => Number.isFinite(v[k]) && v[k] >= 0) || !v.width || !v.height || !v.pixelRatio;
    })) invalid();
  } else invalid();
  return { type: file.kind, value };
}

export function releaseAssetBase(releaseId: string, admin = false) {
  return `/api/${admin ? "admin/" : ""}jenan-map/releases/${releaseId}`;
}

export async function validateReleaseArtifacts(files: Artifact[], forceVerification = false, boundary?: { authority: string; source: string; coverage?: Record<string, unknown> | null }) {
  const results = new Map<string, Awaited<ReturnType<typeof validateArtifactFormat>>>();
  for (const file of files.filter((f) => f.kind !== "source")) {
    const handle = await openArtifact(file, forceVerification);
    try { results.set(file.id, await validateArtifactFormat(file, handle)); }
    finally { await handle.close(); }
  }
  const tiles = files.filter((f) => f.kind === "pmtiles" && f.publicSafe);
  const styles = files.filter((f) => f.kind === "style" && f.publicSafe);
  const schemas = files.filter((f) => f.kind === "schema");
  if (!tiles.length || styles.length !== 1 || schemas.length !== 1) invalid();
  const schema = results.get(schemas[0].id)!.value;
  if (boundary) {
    const coverage = files.filter((f) => f.kind === "coverage");
    if (coverage.length !== 1) invalid();
    const evidence = results.get(coverage[0].id)!.value;
    if (evidence.boundaryAuthority !== boundary.authority || evidence.boundarySource !== boundary.source) invalid();
    // An open-data assertion cannot be substituted for the coverage actually imported into PostGIS.
    if (evidence.authoritative === false || boundary.coverage) {
      if (!boundary.coverage || evidence.authoritative !== false) invalid();
      for (const key of ["boundarySha256", "coverageBasis", "coverageVerified", "unofficial", "notice"]) {
        if (evidence[key] !== boundary.coverage[key]) invalid();
      }
      // Canonicalize metadata: PostgreSQL jsonb reorders object keys.
      try {
        validateCoverage(boundary.coverage);
        if (JSON.stringify(validateProvenance(evidence.provenance)) !== JSON.stringify(validateProvenance(boundary.coverage.provenance))) invalid();
        const layers = (value: unknown) => (value as { id: string; provenance: unknown }[])
          .map((layer) => ({ id: layer.id, provenance: validateProvenance(layer.provenance) }))
          .sort((a, b) => a.id.localeCompare(b.id));
        if (JSON.stringify(layers(evidence.layers)) !== JSON.stringify(layers(boundary.coverage.layers))) invalid();
      } catch { invalid(); }
    }
  }
  for (const tile of tiles) {
    if (results.get(tile.id)!.layers!.some((id: string) => !schema.vector_layers.some((v: { id: string }) => v.id === id))) invalid();
  }
  const style = results.get(styles[0].id)!.value;
  const base = releaseAssetBase(styles[0].releaseId);
  for (const source of Object.values(style.sources) as Record<string, unknown>[]) {
    if (source.type !== "vector" || typeof source.url !== "string" || source.tiles) invalid();
    const tile = tiles.find((f) => source.url === `pmtiles://${base}/pmtiles/${encodeURIComponent(f.filename)}`);
    if (!tile || source.minzoom !== undefined && source.minzoom !== results.get(tile.id)!.minzoom ||
        source.maxzoom !== undefined && source.maxzoom !== results.get(tile.id)!.maxzoom) invalid();
  }
  for (const layer of style.layers) {
    if (layer["source-layer"]) {
      const tile = tiles.find((f) => style.sources[layer.source]?.url === `pmtiles://${base}/pmtiles/${encodeURIComponent(f.filename)}`);
      if (!tile || !results.get(tile.id)!.layers!.includes(layer["source-layer"])) invalid();
    }
  }
  if (style.glyphs !== `${base}/glyphs/{fontstack}/{range}.pbf`) invalid();
  const fonts = new Set<string>();
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout?.["text-field"]) continue;
    const stack = layer.layout["text-font"];
    if (!Array.isArray(stack) || !stack.length || stack.some((v: unknown) => typeof v !== "string")) invalid();
    fonts.add(stack.join(","));
  }
  for (const font of fonts) {
    for (const range of ["0-255", "1536-1791"]) {
      if (!files.some((f) => f.kind === "glyphs" && f.publicSafe && f.filename === `${font}/${range}.pbf`)) invalid();
    }
  }
  if (style.sprite) {
    if (style.sprite !== `${base}/sprites/sprite`) invalid();
    for (const scale of ["", "@2x"]) {
      const image = files.find((f) => f.kind === "sprite" && f.publicSafe && f.filename === `sprite${scale}.png`);
      const index = files.find((f) => f.kind === "sprite" && f.publicSafe && f.filename === `sprite${scale}.json`);
      if (!image || !index) invalid();
      const dimensions = results.get(image.id)!;
      for (const entry of Object.values(results.get(index.id)!.value) as Record<string, number>[]) {
        if (entry.x + entry.width > dimensions.width! || entry.y + entry.height > dimensions.height!) invalid();
      }
    }
  }
  return style;
}
