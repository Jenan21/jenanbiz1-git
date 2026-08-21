import ExcelJS from "exceljs";

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
  const nodeBuffer = Buffer.from(bytes);
  await workbook.xlsx.load(
    nodeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );

  const sheets: ParsedSheetPreview[] = workbook.worksheets.map((sheet) => {
    const previewRows: string[][] = [];
    const limit = Math.max(0, previewLimit);
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
