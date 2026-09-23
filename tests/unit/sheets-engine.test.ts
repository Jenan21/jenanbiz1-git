import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseXlsx } from "@/packages/sheets-engine/src";

async function makeWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pipeline");
  sheet.addRow(["Name", "Value", "Stage"]);
  sheet.addRow(["Lead A", 1200, "Qualified"]);
  sheet.addRow(["Lead B", 2400, "Converted"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("sheets-engine", () => {
  it("extracts sheet names, dimensions, and preview rows", async () => {
    const parsed = await parseXlsx(await makeWorkbook(), 2);

    expect(parsed.sheetNames).toEqual(["Pipeline"]);
    expect(parsed.sheets[0]).toMatchObject({ columnCount: 3, name: "Pipeline", rowCount: 3 });
    expect(parsed.sheets[0]?.previewRows).toEqual([
      ["Name", "Value", "Stage"],
      ["Lead A", "1200", "Qualified"],
    ]);
  });
});
