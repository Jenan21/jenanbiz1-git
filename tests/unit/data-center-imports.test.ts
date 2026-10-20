import { afterEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/storage/document-storage", () => ({ documentStorage: {} }));
import { configureDataCenterScanner, parseDataCenterCsv, validateDataCenterGeoJson, validateDataCenterUpload } from "@/services/data-center/imports";
import { DOCX_MIME_TYPE, XLSX_MIME_TYPE } from "@/services/files/content-sniffing";

afterEach(() => configureDataCenterScanner());
describe("Data Center upload boundary", () => {
  it("parses quoted CSV and rejects malformed or nonrectangular rows", () => {
    expect(parseDataCenterCsv('name,value\r\n"A, B","said ""hello"""\r\n')).toEqual([["name", "value"], ["A, B", 'said "hello"']]);
    expect(() => parseDataCenterCsv('a,b\n"x,y')).toThrow("INVALID_CSV");
    expect(() => parseDataCenterCsv("a,b\none")).toThrow("INVALID_CSV_COLUMNS");
  });
  it("fails closed without a scanner, and on scanner failure", async () => {
    const file = new File(['{"ok":true}'], "source.json", { type: "application/json" });
    await expect(validateDataCenterUpload(file)).rejects.toThrow("MALWARE_SCANNER_UNAVAILABLE");
    configureDataCenterScanner({ name: "test", scan: async () => "UNAVAILABLE" });
    await expect(validateDataCenterUpload(file)).rejects.toThrow("MALWARE_SCANNER_UNAVAILABLE");
    configureDataCenterScanner({ name: "test", scan: async () => { throw Error("down"); } });
    await expect(validateDataCenterUpload(file)).rejects.toThrow("MALWARE_SCANNER_UNAVAILABLE");
  });
  it("blocks infected content before parsing", async () => {
    configureDataCenterScanner({ name: "test", scan: async () => "INFECTED" });
    await expect(validateDataCenterUpload(new File(["{"], "source.json", { type: "application/json" }))).rejects.toThrow("MALWARE_DETECTED");
  });
  it("enforces extension, MIME, magic, safe filename and size", async () => {
    configureDataCenterScanner({ name: "test", scan: async () => "CLEAN" });
    await expect(validateDataCenterUpload(new File(["a,b"], "../source.csv", { type: "text/csv" }))).rejects.toThrow("UNSAFE_FILE_NAME");
    await expect(validateDataCenterUpload(new File(["a,b"], "source.csv", { type: "application/json" }))).rejects.toThrow("FILE_EXTENSION_MIME_MISMATCH");
    await expect(validateDataCenterUpload(new File(["%PDF-1.7\n"], "source.csv", { type: "text/csv" }))).rejects.toThrow("FILE_MAGIC_MISMATCH");
    await expect(validateDataCenterUpload(new File([], "source.csv", { type: "text/csv" }))).rejects.toThrow("FILE_SIZE_LIMIT");
    await expect(validateDataCenterUpload(new File(["MZ\0\0"], "source.pdf", { type: "application/pdf" }))).rejects.toThrow("FILE_MAGIC_MISMATCH");
  });
  it("imports valid scanned JSON without granting evidence status", async () => {
    configureDataCenterScanner({ name: "test", scan: async () => "CLEAN" });
    const parsed = await validateDataCenterUpload(new File(['{"value":123}'], "source.json", { type: "application/json" }));
    expect(parsed.parsed.content).toBe('{"value":123}');
    expect(parsed.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.scanEngine).toBe("test");
    await expect(validateDataCenterUpload(new File(['{"__proto__":{}}'], "source.json", { type: "application/json" }))).rejects.toThrow("UNSAFE_JSON_KEY");
  });
  it("validates WGS84 features and rejects invalid coordinates", () => {
    const feature = { type: "Feature", properties: { title: "Riyadh" }, geometry: { type: "Point", coordinates: [46.7, 24.7] } };
    expect(validateDataCenterGeoJson(feature)).toHaveLength(1);
    expect(() => validateDataCenterGeoJson({ ...feature, geometry: { type: "Point", coordinates: [200, 95] } })).toThrow("INVALID_GEOJSON_COORDINATES");
    expect(() => validateDataCenterGeoJson({ type: "FeatureCollection", features: [{ geometry: null }] })).toThrow("INVALID_GEOJSON_FEATURE");
  });
  it("applies the JSON node budget to each document instead of sharing it between validations", () => {
    // Each feature is 25 JSON nodes, so 3,000 of them fit the 100,000-node budget and 4,400 of them do not.
    const collection = (count: number) => ({ type: "FeatureCollection", features: Array.from({ length: count }, () => ({ type: "Feature", properties: { values: Array.from({ length: 20 }, (_, i) => i) }, geometry: null })) });
    expect(validateDataCenterGeoJson(collection(3000))).toHaveLength(3000);
    expect(validateDataCenterGeoJson(collection(3000))).toHaveLength(3000);
    expect(() => validateDataCenterGeoJson(collection(4400))).toThrow("IMPORT_STRUCTURE_LIMIT");
    expect(validateDataCenterGeoJson(collection(10))).toHaveLength(10);
  });
  it("extracts XLSX values but rejects formula workbooks", async () => {
    configureDataCenterScanner({ name: "test", scan: async () => "CLEAN" });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Dataset"); sheet.addRow(["City", "Count"]); sheet.addRow(["Riyadh", 123]);
    const bytes = await workbook.xlsx.writeBuffer();
    const parsed = await validateDataCenterUpload(new File([new Uint8Array(bytes)], "data.xlsx", { type: XLSX_MIME_TYPE }));
    expect(parsed.parsed.content).toContain("Riyadh");
    sheet.getCell("B2").value = { formula: "1+1", result: 2 };
    const formulas = await workbook.xlsx.writeBuffer();
    await expect(validateDataCenterUpload(new File([new Uint8Array(formulas)], "data.xlsx", { type: XLSX_MIME_TYPE }))).rejects.toThrow("SPREADSHEET_FORMULA_UNSUPPORTED");
  });
  it("extracts DOCX text through the supported adapter and labels PDF originals honestly", async () => {
    configureDataCenterScanner({ name: "test", scan: async () => "CLEAN" });
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Approved document text</w:t></w:r></w:p></w:body></w:document>');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const parsed = await validateDataCenterUpload(new File([new Uint8Array(bytes)], "source.docx", { type: DOCX_MIME_TYPE }));
    expect(parsed.parsed.content).toContain("Approved document text");
    const pdf = await validateDataCenterUpload(new File(["%PDF-1.7\n%%EOF"], "source.pdf", { type: "application/pdf" }));
    expect(pdf.parsed.metadata.extractionAvailable).toBe(false);
    expect(pdf.parsed.content).toContain("Text extraction is unavailable");
  });
});
