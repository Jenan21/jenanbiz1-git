import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseDocx } from "@/packages/docs-engine/src";
import { assertSafeZipArchive, DocumentLimitError, listZipEntryNames } from "@/packages/docs-engine/src/zip-guard";
import { MAX_XLSX_COLUMNS, MAX_XLSX_SHEETS, parseXlsx } from "@/packages/sheets-engine/src";

const CENTRAL_FILE_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

async function zipOf(entries: Record<string, string | Uint8Array>, compression: "DEFLATE" | "STORE" = "DEFLATE") {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(entries)) archive.file(name, content);
  return archive.generateAsync({ compression, type: "uint8array" });
}

/** Rewrites a number in a record of the ZIP directory, to forge the sizes or counts an archive announces. */
function forge(bytes: Uint8Array, signature: number, field: { offset: number; size: 2 | 4; value: number }, occurrence = 0) {
  const copy = Uint8Array.from(bytes);
  const view = new DataView(copy.buffer);
  let seen = -1;
  for (let offset = copy.length - 4; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) !== signature) continue;
    seen += 1;
    if (seen !== occurrence) continue;
    if (field.size === 4) view.setUint32(offset + field.offset, field.value, true);
    else view.setUint16(offset + field.offset, field.value, true);
    return copy;
  }
  throw new Error("record not found");
}

// Offsets inside a central directory file header and the end-of-central-directory record.
const declareUncompressedSize = (bytes: Uint8Array, value: number) => forge(bytes, CENTRAL_FILE_HEADER, { offset: 24, size: 4, value });
const announceEntryCount = (bytes: Uint8Array, value: number) => forge(forge(bytes, END_OF_CENTRAL_DIRECTORY, { offset: 8, size: 2, value }), END_OF_CENTRAL_DIRECTORY, { offset: 10, size: 2, value });

describe("zip guard", () => {
  it("accepts an ordinary Office package and reports what it holds", async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Verified conversion")] }] }));
    const inspection = await assertSafeZipArchive(docx);
    expect(inspection.entryNames).toContain("word/document.xml");
    expect(inspection.uncompressedBytes).toBeGreaterThan(0);
    expect(await listZipEntryNames(docx)).toContain("[Content_Types].xml");
  });

  it("refuses an archive whose central directory declares an enormous entry, before any parser sees it", async () => {
    const forged = declareUncompressedSize(await zipOf({ "word/document.xml": "<w:document/>" }), 0xc0000000);
    await expect(assertSafeZipArchive(forged)).rejects.toThrow(DocumentLimitError);
    await expect(assertSafeZipArchive(forged)).rejects.toThrow(/expands to more than/);
    await expect(parseDocx(forged)).rejects.toBeInstanceOf(DocumentLimitError);
    await expect(parseXlsx(forged)).rejects.toBeInstanceOf(DocumentLimitError);
  });

  it("refuses an archive whose declared sizes add up past the total", async () => {
    const archive = await zipOf({ "a.xml": "<a/>", "b.xml": "<b/>" });
    await expect(assertSafeZipArchive(archive, { maxEntryBytes: 1024, maxUncompressedBytes: 6 })).rejects.toThrow(/archive expands to more than/);
  });

  it("catches an entry that produces more data than the directory says it does", async () => {
    // The directory claims 10 bytes; the entry really inflates to 1 MiB. Declared sizes alone would let this through.
    const bomb = declareUncompressedSize(await zipOf({ "word/document.xml": new Uint8Array(1024 * 1024) }), 10);
    await expect(assertSafeZipArchive(bomb)).rejects.toThrow(DocumentLimitError);
    await expect(parseDocx(bomb)).rejects.toBeInstanceOf(DocumentLimitError);
  });

  it("refuses an archive with too many entries, even when it understates their number", async () => {
    const entries = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`part-${index}.xml`, "<p/>"]));
    const archive = await zipOf(entries);
    await expect(assertSafeZipArchive(archive, { maxEntries: 5 })).rejects.toThrow(/more than 5 entries/);
    await expect(listZipEntryNames(archive, { maxEntries: 5 })).rejects.toThrow(/more than 5 entries/);
    // The end-of-central-directory record is rewritten to announce a single entry; the real count still decides.
    await expect(assertSafeZipArchive(announceEntryCount(archive, 1), { maxEntries: 5 })).rejects.toThrow(/more than 5 entries/);
  });

  it("refuses an implausible compression ratio only once the archive is large enough to matter", async () => {
    const zeros = await zipOf({ "xl/sheet.xml": new Uint8Array(2 * 1024 * 1024) });
    expect(zeros.byteLength).toBeLessThan(10_000);
    await expect(assertSafeZipArchive(zeros, { maxCompressionRatio: 100, ratioFloorBytes: 1024 * 1024 })).rejects.toThrow(/compressed implausibly well/);
    // Below the floor the same ratio is harmless.
    await expect(assertSafeZipArchive(zeros, { maxCompressionRatio: 100, ratioFloorBytes: 8 * 1024 * 1024 })).resolves.toMatchObject({ uncompressedBytes: 2 * 1024 * 1024 });
  });

  it("refuses bytes that are not an archive", async () => {
    await expect(assertSafeZipArchive(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(DocumentLimitError);
    await expect(listZipEntryNames(new Uint8Array(64))).rejects.toThrow(/not a valid Office document archive/);
  });
});

describe("office engines behind the guard", () => {
  it("still read ordinary files", async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Verified software conversion")] }] }));
    expect((await parseDocx(docx)).text).toContain("Verified software conversion");

    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Pipeline").addRow(["Name", "Value"]);
    const parsed = await parseXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()));
    expect(parsed.sheetNames).toEqual(["Pipeline"]);
  });

  it("refuse a workbook with more sheets than a preview allows", async () => {
    const workbook = new ExcelJS.Workbook();
    for (let index = 0; index <= MAX_XLSX_SHEETS; index += 1) workbook.addWorksheet(`Sheet ${index}`).addRow(["x"]);
    await expect(parseXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()))).rejects.toThrow(`more than ${MAX_XLSX_SHEETS} sheets`);
  });

  it("refuse a sheet so wide that its preview would dwarf the upload", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Wide").getCell(1, MAX_XLSX_COLUMNS + 1).value = "far right";
    await expect(parseXlsx(new Uint8Array(await workbook.xlsx.writeBuffer()))).rejects.toThrow(`more than ${MAX_XLSX_COLUMNS} columns`);
  });
});
