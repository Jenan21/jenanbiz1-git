import { z } from "zod";
import type { ImportScanner } from "./contracts";
import { DataCenterError } from "./policy";

export const IMPORT_LIMIT_BYTES = 2 * 1024 * 1024;
let scanner: ImportScanner | undefined;
export function configureDataCenterScanner(provider: ImportScanner | undefined) { scanner = provider; }
export const importCapabilities = {
  json: true, csv: true, geojson: true, text: true,
  xlsx: false, documents: false, api: false,
  reason: "Office/document and remote API ingestion are unavailable; no sandboxed parser/fetch adapter configured.",
};

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ",") { row.push(field); field = ""; closed = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; closed = false;
    } else {
      if (closed || c === '"') throw new DataCenterError("Malformed CSV");
      field += c;
    }
    if (row.length > 100 || rows.length > 5000 || field.length > 100_000) throw new DataCenterError("CSV limits exceeded");
  }
  if (quoted) throw new DataCenterError("Unclosed CSV quote");
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  if (!rows.length || rows.some((entry) => entry.length !== rows[0].length)) throw new DataCenterError("CSV must have consistent columns");
  return rows;
}

export async function parseDataCenterFile(file: File) {
  if (file.size < 1 || file.size > IMPORT_LIMIT_BYTES) throw new DataCenterError("Import must be 1 byte to 2 MB", 413);
  const fileName = z.string().min(1).max(255).parse(file.name);
  const mimeType = file.type.toLowerCase().split(";")[0].trim();
  const extensions: Record<string, string[]> = {
    "application/json": [".json"], "application/geo+json": [".geojson", ".json"],
    "text/csv": [".csv"], "text/plain": [".txt"],
  };
  if (!extensions[mimeType]?.some((extension) => fileName.toLowerCase().endsWith(extension))) throw new DataCenterError("Unsupported MIME type or extension", 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > IMPORT_LIMIT_BYTES) throw new DataCenterError("Invalid import size", 413);
  if (!scanner) throw new DataCenterError("Import scanner unavailable; import refused", 503, "SCAN_UNAVAILABLE");
  let clean = false;
  try { clean = (await scanner.scan(bytes, mimeType)).clean; } catch { /* Scanner errors fail closed. */ }
  if (!clean) throw new DataCenterError("Import scanner did not approve the file", 422, "SCAN_REJECTED");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new DataCenterError("Only UTF-8 text imports supported"); }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new DataCenterError("Binary control bytes refused");
  let content = text;
  if (mimeType === "text/csv") content = JSON.stringify(csvRows(text));
  if (mimeType === "application/json" || mimeType === "application/geo+json") {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new DataCenterError("Invalid JSON"); }
    let nodes = 0;
    function bound(value: unknown, depth: number) {
      if (depth > 20 || ++nodes > 20_000) throw new DataCenterError("JSON structure exceeds import limits");
      if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw new DataCenterError("Unsafe JSON key");
        bound(child, depth + 1);
      }
    }
    bound(parsed, 0);
    if (mimeType === "application/geo+json") {
      const geo = z.object({ type: z.literal("FeatureCollection"), features: z.array(z.object({
        type: z.literal("Feature"),
        geometry: z.object({ type: z.enum(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"]) }).passthrough().nullable(),
        properties: z.record(z.string(), z.unknown()).nullable(),
      }).passthrough()).max(5000) }).parse(parsed);
      content = JSON.stringify(geo);
    } else content = JSON.stringify(parsed);
  }
  if (!content.trim() || content.length > 200_000) throw new DataCenterError("Parsed content must be 1 to 200000 characters");
  return { bytes, mimeType, content };
}
