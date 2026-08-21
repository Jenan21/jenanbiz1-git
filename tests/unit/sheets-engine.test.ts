import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseXlsx } from "@/packages/sheets-engine/src";

async function makeWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("KPIs");
  sheet.addRow(["Metric", "Value"]);
  sheet.addRow(["Revenue", 45890]);
  sheet.addRow(["Users", 3247]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("sheets-engine", () => {
  it("parses xlsx and returns workbook metadata", async () => {
    const file = await makeWorkbook();
    const parsed = await parseXlsx(file, 3);

    expect(parsed.sheetNames).toEqual(["KPIs"]);
    expect(parsed.sheets[0].rowCount).toBe(3);
    expect(parsed.sheets[0].previewRows[0]).toEqual(["Metric", "Value"]);
  });
});
