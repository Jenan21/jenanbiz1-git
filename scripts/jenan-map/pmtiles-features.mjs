// Extracts searchable features (cities, districts, streets, points of interest) from the REAL Saudi PMTiles archive, so search runs on
// the same OpenStreetMap-derived data the map draws. Nothing is invented: every feature carries its tile-layer name tags and a stable id.
import { open } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export const SOURCE_NAME = "OpenStreetMap";
export const MAX_FEATURES = 100_000;
// City windows (west, south, east, north) scanned at street zoom for minor streets and points of interest.
export const CITY_WINDOWS = {
  riyadh: [46.45, 24.55, 46.95, 24.95], jeddah: [39.05, 21.35, 39.35, 21.75], dammam: [49.95, 26.25, 50.25, 26.6],
  makkah: [39.7, 21.3, 40.0, 21.5], madinah: [39.5, 24.4, 39.75, 24.55],
};
const POI_KINDS = new Set(["hospital", "clinic", "pharmacy", "dentist", "school", "kindergarten", "college", "university", "library", "restaurant", "cafe", "fast_food",
  "bakery", "hotel", "hostel", "guest_house", "supermarket", "mall", "marketplace", "bank", "atm", "fuel", "mosque", "place_of_worship", "museum", "cinema", "stadium", "park",
  "airport", "aerodrome", "station", "bus_station", "police", "fire_station", "post_office", "townhall", "courthouse"]);

export const tileOf = (lon, lat, z) => {
  const n = 2 ** z, rad = (lat * Math.PI) / 180;
  return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)];
};

/** Names a feature may be searched by: Arabic first, English, and the local name when it differs. */
export function namesOf(properties) {
  const arabic = properties["name:ar"], english = properties["name:en"], local = properties.name;
  const label = [arabic, local, english].find((value) => typeof value === "string" && value.trim());
  if (!label) return null;
  const aliases = [...new Set([arabic, english, local].filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  return { label: label.trim().slice(0, 240), aliases: aliases.slice(0, 20), name_ar: typeof arabic === "string" ? arabic.slice(0, 240) : undefined, name_en: typeof english === "string" ? english.slice(0, 240) : undefined };
}

function midpoint(geometry) {
  if (geometry.type === "Point") return geometry.coordinates;
  const line = geometry.type === "MultiLineString" ? geometry.coordinates.flat() : geometry.type === "LineString" ? geometry.coordinates : geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates.flat(2);
  const point = line[Math.floor(line.length / 2)];
  return Array.isArray(point) ? point : null;
}

/** The searchable layer a tile feature belongs to, or null when it should not be searchable. */
export function classify(layerName, properties) {
  const kind = properties.kind, detail = properties.kind_detail;
  if (layerName === "places") {
    if (kind === "locality" || kind === "neighbourhood" || kind === "region" || kind === "county") return { layerId: "places", category: "places", rank: detail ?? kind };
    return null;
  }
  if (layerName === "roads") return ["highway", "major_road", "minor_road"].includes(kind) ? { layerId: "roads", category: "roads", rank: kind } : null;
  if (layerName === "pois") return POI_KINDS.has(kind) ? { layerId: "pois", category: "pois", rank: kind } : null;
  return null;
}

/**
 * Reads tiles of `file` and returns searchable point features. Nationwide it scans zoom 0-12 for places and major roads; inside each
 * city window it scans zoom 14 for every named street and point of interest. Duplicates (the same name in the same ~1 km cell) collapse.
 */
export async function collectSearchFeatures(file, { limit = MAX_FEATURES, onProgress } = {}) {
  const handle = await open(file, "r");
  try {
    const pm = new PMTiles({ getKey: () => file, getBytes: async (offset, length) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return { data: Uint8Array.from(buffer.subarray(0, bytesRead)).buffer };
    } });
    const header = await pm.getHeader();
    const seen = new Map();
    const add = (z, x, y, wanted) => async () => {
      const tile = await pm.getZxy(z, x, y);
      if (!tile) return;
      let data = Buffer.from(tile.data);
      if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
      const vt = new VectorTile(new PbfReader(data));
      for (const [layerName, layer] of Object.entries(vt.layers)) {
        for (let i = 0; i < layer.length; i++) {
          const source = layer.feature(i);
          const properties = source.properties;
          const cls = classify(layerName, properties);
          if (!cls || !wanted(cls, properties)) continue;
          const names = namesOf(properties);
          if (!names) continue;
          const point = midpoint(source.toGeoJSON(x, y, z).geometry);
          if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
          // A street is one long feature cut into many tiles, so streets collapse per ~11 km cell; places and points of interest per ~1 km.
          const cell = cls.layerId === "roads" ? 1 : 2;
          const key = `${cls.layerId}|${names.label}|${point[0].toFixed(cell)}|${point[1].toFixed(cell)}`;
          if (seen.has(key)) continue;
          seen.set(key, {
            type: "Feature", id: `${layerName}/${z}/${x}/${y}/${i}`,
            properties: { label: names.label, category: cls.category, layerId: cls.layerId, source: SOURCE_NAME, sourceId: `${layerName}:${properties.kind ?? ""}:${z}/${x}/${y}/${i}`, aliases: names.aliases,
              ...(names.name_ar ? { name_ar: names.name_ar } : {}), ...(names.name_en ? { name_en: names.name_en } : {}) },
            geometry: { type: "Point", coordinates: [Number(point[0].toFixed(7)), Number(point[1].toFixed(7))] },
          });
          if (seen.size > limit) throw new Error("Searchable feature limit exceeded; narrow the scan instead of truncating");
        }
      }
    };
    const tasks = [];
    const national = (cls) => cls.layerId === "places" || (cls.layerId === "roads" && ["highway", "major_road"].includes(cls.rank));
    for (let z = 4; z <= Math.min(12, header.maxZoom); z++) {
      const [x0, y0] = tileOf(34.4, 32.4, z), [x1, y1] = tileOf(55.8, 16.0, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tasks.push(add(z, x, y, national));
    }
    for (const [west, south, east, north] of Object.values(CITY_WINDOWS)) {
      const z = Math.min(14, header.maxZoom);
      const [x0, y0] = tileOf(west, north, z), [x1, y1] = tileOf(east, south, z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tasks.push(add(z, x, y, () => true));
    }
    let done = 0;
    for (const task of tasks) { await task(); if (++done % 5000 === 0) onProgress?.(done, tasks.length, seen.size); }
    return [...seen.values()];
  } finally { await handle.close(); }
}
