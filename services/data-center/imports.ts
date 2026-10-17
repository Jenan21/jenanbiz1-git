import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { documentStorage } from "@/lib/storage/document-storage";
import { DOCX_MIME_TYPE, normalizeDeclaredMimeType, sniffFileContent, XLSX_MIME_TYPE } from "@/services/files/content-sniffing";
import { listZipEntryNames } from "@/packages/docs-engine/src/zip-guard";
import { DataCenterError, itemSchema, type CreateItemInput, type DataCenterActor, type DataCenterGeoFeature, type DataCenterScanner } from "./contracts";
import { assertSourceAccess, requireDataCenterAdmin } from "./policy";
import { auditDataCenter, createDataCenterItemInTransaction } from "./service";
import { configuredDataCenterScanner } from "./scanner";

export const DATA_CENTER_UPLOAD_LIMIT = 10 * 1024 * 1024;
let scanner: DataCenterScanner | undefined;
export function configureDataCenterScanner(provider?: DataCenterScanner) { scanner = provider; }
export function dataCenterImportCapabilities() {
  const active = scanner ?? configuredDataCenterScanner();
  return { scanner: { available: !!active, provider: active?.name ?? null },
    formats: ["csv", "xlsx", "json", "geojson", "docx", "pdf"], maxBytes: DATA_CENTER_UPLOAD_LIMIT,
    pdf: "Original storage only; no text extraction", remoteUrlImport: false };
}
export interface DataCenterImportAdapter {
  readonly name: string;
  readonly extensions: readonly string[];
  readonly mimeTypes: readonly string[];
  parse(bytes: Uint8Array): Promise<{ content: string; metadata: Record<string, string | number | boolean> }>;
}
export function parseDataCenterCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, afterQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else cell += c;
    } else if (c === '"' && !cell && !afterQuote) quoted = true;
    else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell); cell = ""; afterQuote = false;
      if (c !== ",") { if (c === "\r" && text[i + 1] === "\n") i++; rows.push(row); row = []; }
    } else { if (afterQuote || c === '"') throw new DataCenterError("INVALID_CSV"); cell += c; }
    if (cell.length > 50_000 || row.length > 200 || rows.length > 10_000) throw new DataCenterError("IMPORT_STRUCTURE_LIMIT");
  }
  if (quoted) throw new DataCenterError("INVALID_CSV");
  if (cell || row.length || afterQuote) { row.push(cell); rows.push(row); }
  if (!rows.length || rows[0].length > 200 || rows.some((r) => r.length !== rows[0].length)) throw new DataCenterError("INVALID_CSV_COLUMNS");
  return rows;
}
function validateJson(value: unknown, depth = 0, count = { n: 0 }): void {
  if (depth > 30 || ++count.n > 100_000) throw new DataCenterError("IMPORT_STRUCTURE_LIMIT");
  if (typeof value === "number" && !Number.isFinite(value)) throw new DataCenterError("INVALID_JSON_NUMBER");
  if (Array.isArray(value)) for (const item of value) validateJson(item, depth + 1, count);
  else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new DataCenterError("UNSAFE_JSON_KEY");
    validateJson(child, depth + 1, count);
  }
}
function validatePosition(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.length <= 3 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function validateCoordinates(value: unknown, depth: number): boolean {
  if (depth === 0) return validatePosition(value);
  return Array.isArray(value) && value.length > 0 && value.every((c) => validateCoordinates(c, depth - 1));
}
function validateGeometry(geometry: unknown, level = 0): boolean {
  if (geometry === null) return true;
  if (!geometry || typeof geometry !== "object" || level > 10) return false;
  const g = geometry as Record<string, unknown>;
  if (g.type === "GeometryCollection") return Array.isArray(g.geometries) && g.geometries.every((v) => validateGeometry(v, level + 1));
  const depths: Record<string, number> = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  const depth = depths[String(g.type)];
  if (depth === undefined || !validateCoordinates(g.coordinates, depth)) return false;
  const line = (v: unknown) => Array.isArray(v) && v.length >= 2;
  const ring = (v: unknown) => Array.isArray(v) && v.length >= 4 && JSON.stringify(v[0]) === JSON.stringify(v[v.length - 1]);
  const polygon = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every(ring);
  if (g.type === "LineString") return line(g.coordinates);
  if (g.type === "MultiLineString") return (g.coordinates as unknown[]).every(line);
  if (g.type === "Polygon") return polygon(g.coordinates);
  if (g.type === "MultiPolygon") return (g.coordinates as unknown[]).every(polygon);
  return true;
}
export function validateDataCenterGeoJson(value: unknown): DataCenterGeoFeature[] {
  validateJson(value);
  if (!value || typeof value !== "object") throw new DataCenterError("INVALID_GEOJSON");
  const data = value as Record<string, unknown>;
  if ("crs" in data) throw new DataCenterError("GEOJSON_WGS84_REQUIRED");
  const features = data.type === "FeatureCollection" && Array.isArray(data.features) ? data.features : data.type === "Feature" ? [data]
    : validateGeometry(data) ? [{ type: "Feature", properties: null, geometry: data }] : [];
  if (!features.length || features.length > 10_000) throw new DataCenterError("INVALID_GEOJSON");
  for (const feature of features) {
    if (!feature || typeof feature !== "object" || feature.type !== "Feature" || !("properties" in feature) || (feature.properties !== null && (typeof feature.properties !== "object" || Array.isArray(feature.properties)))) throw new DataCenterError("INVALID_GEOJSON_FEATURE");
    if (!validateGeometry(feature.geometry)) throw new DataCenterError("INVALID_GEOJSON_COORDINATES");
  }
  return features as DataCenterGeoFeature[];
}
function text(bytes: Uint8Array) { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); }
const adapters: DataCenterImportAdapter[] = [
  { name: "csv-v1", extensions: ["csv"], mimeTypes: ["text/csv"], async parse(bytes) {
    const rows = parseDataCenterCsv(text(bytes));
    return { content: JSON.stringify({ headers: rows[0], rows: rows.slice(1) }), metadata: { rows: rows.length - 1, columns: rows[0].length } };
  } },
  { name: "json-v1", extensions: ["json"], mimeTypes: ["application/json"], async parse(bytes) {
    const value: unknown = JSON.parse(text(bytes)); validateJson(value);
    return { content: JSON.stringify(value), metadata: { structured: true } };
  } },
  { name: "geojson-v1", extensions: ["geojson"], mimeTypes: ["application/geo+json", "application/json"], async parse(bytes) {
    const value: unknown = JSON.parse(text(bytes)); const features = validateDataCenterGeoJson(value);
    return { content: JSON.stringify(value), metadata: { features: features.length, coordinateSystem: "WGS84" } };
  } },
  { name: "xlsx-v1", extensions: ["xlsx"], mimeTypes: [XLSX_MIME_TYPE], async parse(bytes) {
    const names = await listZipEntryNames(bytes);
    if (names.some((n) => /vbaProject|externalLinks|embeddings|connections\.xml/i.test(n))) throw new DataCenterError("ACTIVE_SPREADSHEET_CONTENT_UNSUPPORTED");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as never);
    const sheets: { name: string; rows: unknown[][] }[] = [];
    let cells = 0;
    if (workbook.worksheets.length > 20) throw new DataCenterError("IMPORT_STRUCTURE_LIMIT");
    for (const sheet of workbook.worksheets) {
      if (sheet.rowCount > 10_000 || sheet.columnCount > 200) throw new DataCenterError("IMPORT_STRUCTURE_LIMIT");
      const rows: unknown[][] = [];
      sheet.eachRow((row) => {
        const values: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (++cells > 100_000) throw new DataCenterError("IMPORT_STRUCTURE_LIMIT");
          if (cell.type === ExcelJS.ValueType.Formula) throw new DataCenterError("SPREADSHEET_FORMULA_UNSUPPORTED");
          values.push(cell.text.slice(0, 50_000));
        });
        rows.push(values);
      });
      sheets.push({ name: sheet.name, rows });
    }
    return { content: JSON.stringify(sheets), metadata: { sheets: sheets.length, cells } };
  } },
  { name: "docx-v1", extensions: ["docx"], mimeTypes: [DOCX_MIME_TYPE], async parse(bytes) {
    const names = await listZipEntryNames(bytes);
    if (names.some((n) => /vbaProject|embeddings|activeX/i.test(n))) throw new DataCenterError("ACTIVE_DOCUMENT_CONTENT_UNSUPPORTED");
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { content: result.value.trim(), metadata: { extraction: "plain-text" } };
  } },
  { name: "pdf-original-v1", extensions: ["pdf"], mimeTypes: ["application/pdf"], async parse() {
    return { content: "Original PDF retained. Text extraction is unavailable; review the original document before use.", metadata: { extractionAvailable: false } };
  } },
];
export function registerDataCenterImportAdapter(adapter: DataCenterImportAdapter) {
  if (adapter.extensions.some((e) => adapters.some((a) => a.extensions.includes(e)))) throw new DataCenterError("ADAPTER_EXTENSION_ALREADY_REGISTERED", 409);
  adapters.push(adapter);
}
export async function validateDataCenterUpload(file: File) {
  if (!file.size || file.size > DATA_CENTER_UPLOAD_LIMIT) throw new DataCenterError("FILE_SIZE_LIMIT", 413);
  if (!/^[^/\\\x00-\x1f]{1,240}$/.test(file.name) || file.name.startsWith(".")) throw new DataCenterError("UNSAFE_FILE_NAME");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const adapter = adapters.find((a) => a.extensions.includes(extension));
  const mimeType = normalizeDeclaredMimeType(file.type);
  if (!adapter || !adapter.mimeTypes.includes(mimeType)) throw new DataCenterError("FILE_EXTENSION_MIME_MISMATCH");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > DATA_CENTER_UPLOAD_LIMIT) throw new DataCenterError("FILE_SIZE_LIMIT", 413);
  const sniffed = await sniffFileContent(bytes);
  const expected = ["csv", "json", "geojson"].includes(extension) ? "text/plain" : mimeType;
  if (sniffed !== expected) throw new DataCenterError("FILE_MAGIC_MISMATCH");
  const activeScanner = scanner ?? configuredDataCenterScanner();
  if (!activeScanner) throw new DataCenterError("MALWARE_SCANNER_UNAVAILABLE", 503);
  let verdict: string;
  let scanTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    verdict = await Promise.race([activeScanner.scan(bytes), new Promise<string>((resolve) => { scanTimeout = setTimeout(() => resolve("UNAVAILABLE"), 15_000); })]);
  } catch { throw new DataCenterError("MALWARE_SCANNER_UNAVAILABLE", 503); }
  finally { if (scanTimeout) clearTimeout(scanTimeout); }
  if (verdict !== "CLEAN") throw new DataCenterError(verdict === "INFECTED" ? "MALWARE_DETECTED" : "MALWARE_SCANNER_UNAVAILABLE", verdict === "INFECTED" ? 422 : 503);
  let parsed: Awaited<ReturnType<DataCenterImportAdapter["parse"]>>;
  try { parsed = await adapter.parse(bytes); } catch (error) { if (error instanceof DataCenterError) throw error; throw new DataCenterError("IMPORT_PARSE_FAILED"); }
  if (!parsed.content.trim() || parsed.content.length > 200_000) throw new DataCenterError("EXTRACTED_CONTENT_LIMIT", 413);
  return { bytes, adapter, parsed, mimeType, scanEngine: activeScanner.name, checksum: createHash("sha256").update(bytes).digest("hex") };
}
export async function ingestDataCenterFile(input: Omit<CreateItemInput, "content">, file: File, actor: DataCenterActor) {
  const source = await assertSourceAccess(await db.dataCenterSource.findUnique({ where: { id: input.sourceId } }), actor, true);
  const result = await validateDataCenterUpload(file);
  const parsed = itemSchema.parse({ ...input, content: result.parsed.content, origin: "IMPORT", evidenceStatus: "UNVERIFIED",
    provenance: [...(input.provenance ?? []), { label: file.name, reference: `sha256:${result.checksum}`, kind: "DOCUMENT" }] });
  const storageKey = `data-center/${source.id}/${randomUUID()}`;
  try {
    await documentStorage.upload(storageKey, result.bytes, result.mimeType);
    return await db.$transaction(async (tx) => {
      // Quotas serialize by owner and include the original bytes, not merely extracted text.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`data-center-upload:${actor.id}`}))`;
      const usage = await tx.dataCenterImport.aggregate({ where: { actorId: actor.id }, _count: true, _sum: { sizeBytes: true } });
      if (usage._count >= 500 || (usage._sum.sizeBytes ?? 0) + file.size > 500 * 1024 * 1024) throw new DataCenterError("IMPORT_STORAGE_QUOTA", 413);
      const item = await createDataCenterItemInTransaction(tx, parsed, actor);
      const record = await tx.dataCenterImport.create({ data: {
        sourceId: source.id, versionId: item.version.id, actorId: actor.id,
        fileName: file.name, mimeType: result.mimeType, sizeBytes: file.size, checksum: result.checksum,
        storageKey, adapter: result.adapter.name, scanEngine: result.scanEngine,
      }, omit: { storageKey: true } });
      await auditDataCenter(tx, actor, "file.imported", record.id, { adapter: result.adapter.name, checksum: result.checksum, versionId: item.version.id, ...result.parsed.metadata });
      return { item, import: record };
    });
  } catch (error) { await documentStorage.delete(storageKey).catch(() => undefined); throw error; }
}
export async function downloadDataCenterOriginal(importId: string, actor: DataCenterActor) {
  // Originals can contain rows not selected for retrieval. Restrict them to administrators.
  requireDataCenterAdmin(actor);
  const record = await db.dataCenterImport.findUnique({ where: { id: importId } });
  if (!record) throw new DataCenterError("IMPORT_NOT_FOUND", 404);
  const bytes = await documentStorage.download(record.storageKey);
  if (createHash("sha256").update(bytes).digest("hex") !== record.checksum) throw new DataCenterError("ORIGINAL_INTEGRITY_FAILURE", 409);
  await db.$transaction((tx) => auditDataCenter(tx, actor, "original.downloaded", importId, { checksum: record.checksum }));
  return { bytes, fileName: record.fileName };
}
