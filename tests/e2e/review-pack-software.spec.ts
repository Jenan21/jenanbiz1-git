import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { queryE2E } from "./identity-fixture";

test("merges and splits PDF files through the software workspace API", async ({ baseURL, page }) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const suffix = Date.now();
  let userId: string | undefined;
  try {
    const registration = await page.request.post("/api/auth/register", { headers: { origin: baseURL }, data: { displayName: "Software Operator", countryCode: "SA", email: `software-${suffix}@example.test`, password: "StrongPass123!", locale: "en", language: "en" } });
    expect(registration.status()).toBe(201);
    userId = (await registration.json()).user.id as string;

    const input = await PDFDocument.create();
    input.addPage([200, 200]);
    input.addPage([200, 200]);
    const merged = await page.request.post("/api/software/documents", {
      headers: { origin: baseURL },
      multipart: { action: "mergePdf", files: { name: "input.pdf", mimeType: "application/pdf", buffer: Buffer.from(await input.save()) } },
    });
    expect(merged.status(), await merged.text()).toBe(200);
    expect((await merged.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const split = await page.request.post("/api/software/documents", {
      headers: { origin: baseURL },
      multipart: { action: "splitPdf", ranges: "1, 2", files: { name: "input.pdf", mimeType: "application/pdf", buffer: Buffer.from(await input.save()) } },
    });
    expect(split.status(), await split.text()).toBe(200);
    const splitPayload = await split.json() as { documents: string[] };
    expect(splitPayload.documents).toHaveLength(2);
    expect(Buffer.from(splitPayload.documents[0], "base64").subarray(0, 5).toString()).toBe("%PDF-");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sales");
    sheet.addRow(["Month", "Revenue"]);
    sheet.addRow(["September", 1200]);
    const inspected = await page.request.post("/api/software/documents", {
      headers: { origin: baseURL },
      multipart: { action: "analyzeXlsx", files: { name: "sales.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } },
    });
    expect(inspected.status(), await inspected.text()).toBe(200);
    const spreadsheetPayload = await inspected.json() as { workbook: { sheets: { name: string; rowCount: number; columnCount: number; previewRows: string[][] }[] } };
    expect(spreadsheetPayload.workbook.sheets[0]).toMatchObject({ name: "Sales", rowCount: 2, columnCount: 2, previewRows: [["Month", "Revenue"], ["September", "1200"]] });

    const palette = await page.request.post("/api/software/design", {
      headers: { origin: baseURL },
      multipart: { image: { name: "brand.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9OwAAAABJRU5ErkJggg==", "base64") } },
    });
    expect(palette.status(), await palette.text()).toBe(200);
    expect((await palette.json()).success).toBe(true);

    await page.goto("/software", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /دمج ملفات PDF|Merge PDF files/ })).toBeVisible();
  } finally {
    if (userId) await queryE2E('DELETE FROM "User" WHERE id = $1', [userId]);
  }
});