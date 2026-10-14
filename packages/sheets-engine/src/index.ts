import ExcelJS from "exceljs";
import { assertSafeZipArchive, DocumentLimitError } from "@/packages/docs-engine/src/zip-guard";

/** Ceilings that keep a crafted workbook from turning a small upload into a very large preview. */
export const MAX_XLSX_SHEETS = 100;
export const MAX_XLSX_COLUMNS = 1_000;
export const MAX_XLSX_PREVIEW_ROWS = 1_000;
export const MAX_XLSX_PREVIEW_CELLS = 250_000;

export interface ParsedSheetPreview {
  name: string;
  rowCount: number;
  columnCount: number;
  previewRows: string[][];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: ParsedSheetPreview[];
}

export async function parseXlsx(
  input: Uint8Array | ArrayBuffer,
  previewLimit = 5,
): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await assertSafeZipArchive(bytes);
  const nodeBuffer = Buffer.from(bytes);
  await workbook.xlsx.load(
    nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const limit = Math.min(Math.max(0, previewLimit), MAX_XLSX_PREVIEW_ROWS);
  if (workbook.worksheets.length > MAX_XLSX_SHEETS) {
    throw new DocumentLimitError(`The workbook has more than ${MAX_XLSX_SHEETS} sheets.`);
  }
  let previewCells = 0;
  for (const sheet of workbook.worksheets) {
    if (sheet.columnCount > MAX_XLSX_COLUMNS) {
      throw new DocumentLimitError(`Sheet "${sheet.name}" has more than ${MAX_XLSX_COLUMNS} columns.`);
    }
    previewCells += Math.min(limit, sheet.rowCount) * sheet.columnCount;
    if (previewCells > MAX_XLSX_PREVIEW_CELLS) {
      throw new DocumentLimitError("The workbook is too wide to preview.");
    }
  }

  const sheets: ParsedSheetPreview[] = workbook.worksheets.map((sheet) => {
    const previewRows: string[][] = [];
    for (let rowIndex = 1; rowIndex <= Math.min(limit, sheet.rowCount); rowIndex++) {
      const row = sheet.getRow(rowIndex);
      const values = row.values as Array<string | number | null | undefined>;
      const cells = values
        .slice(1)
        .map((value) => (value == null ? "" : String(value)));
      previewRows.push(cells);
    }

    return {
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      previewRows,
    };
  });

  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}

const sheetsEngine = { parseXlsx };
export default sheetsEngine;
