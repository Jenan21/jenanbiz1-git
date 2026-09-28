import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { generateStudioExport } from "@/services/studio/studio-export-service";

describe("Studio native exports", () => {
  it("generates a DOCX containing structured document text", async () => {
    const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const output = await generateStudioExport({ kind: "DOCS", title: "Decision Memo", content: { body: "# Direction\n\nVerified operating evidence\n\n| Owner | Status |\n| Jenan | Ready |", footer: "Verified footer", header: "Verified header", imageData, imageHeight: 1, imageWidth: 1 } });
    expect(output.extension).toBe("docx");
    const archive = await JSZip.loadAsync(output.bytes);
    const documentXml = await archive.file("word/document.xml")!.async("text");
    expect(documentXml).toContain("Decision Memo");
    expect(documentXml).toContain("Verified operating evidence");
    expect(documentXml).toContain("w:tbl");
    expect(await archive.file("word/header1.xml")!.async("text")).toContain("Verified header");
    expect(await archive.file("word/footer1.xml")!.async("text")).toContain("Verified footer");
    expect(Object.keys(archive.files).some((path) => path.startsWith("word/media/") && path !== "word/media/")).toBe(true);
  });

  it("generates an XLSX preserving formulas", async () => {
    const output = await generateStudioExport({ kind: "SHEETS", title: "Forecast", content: { rows: [["Item", "Value"], ["Base", "10"], ["Double", "=B2*2"]] } });
    expect(output.extension).toBe("xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets[0]?.getCell("B3").value).toMatchObject({ formula: "B2*2" });
  });

  it("generates a PPTX with slide content and selected layout", async () => {
    const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const output = await generateStudioExport({ kind: "PRESENTATION", title: "Operations", content: { accent: "#16d9c5", theme: "paper", slides: [{ title: "Verified direction", body: "Evidence and outcomes", chartData: "Q1:20,Q2:35", imageData, layout: "statement" }] } });
    expect(output.extension).toBe("pptx");
    const archive = await JSZip.loadAsync(output.bytes);
    const slideXml = await archive.file("ppt/slides/slide1.xml")!.async("text");
    expect(slideXml).toContain("Verified direction");
    expect(slideXml).toContain("Evidence and outcomes");
    expect(slideXml).toContain("F5F1E8");
    expect(archive.file("ppt/charts/chart1.xml")).not.toBeNull();
    expect(Object.keys(archive.files).some((path) => path.startsWith("ppt/media/image"))).toBe(true);
  });

  it("generates a Letterhead DOCX with company metadata", async () => {
    const output = await generateStudioExport({ kind: "LETTERHEAD", title: "Official Letter", content: { company: "Jenan PRO", contact: "contact@example.test", address: "Riyadh", footer: "Verified correspondence", pageSize: "A4" } });
    const archive = await JSZip.loadAsync(output.bytes);
    const headerXml = await archive.file("word/header1.xml")!.async("text");
    const footerXml = await archive.file("word/footer1.xml")!.async("text");
    expect(headerXml).toContain("Jenan PRO");
    expect(footerXml).toContain("Verified correspondence");
  });
});