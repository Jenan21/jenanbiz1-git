import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { deletePdfPages, extractPdfPages, imagesToPdf, mergePdfs, numberPdfPages, optimizePdf, redactPdf, reorderPdfPages, rotatePdfPages, splitPdf, watermarkPdf } from "@/packages/pdf-engine/src";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]);
  }
  return await doc.save();
}

describe("pdf-engine", () => {
  it("merges multiple pdfs", async () => {
    const a = await makePdf(1);
    const b = await makePdf(2);

    const merged = await mergePdfs([a, b]);
    const mergedDoc = await PDFDocument.load(merged);

    expect(mergedDoc.getPageCount()).toBe(3);
  });

  it("splits a pdf by page ranges", async () => {
    const source = await makePdf(4);

    const parts = await splitPdf(source, [
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);

    expect(parts).toHaveLength(2);

    const first = await PDFDocument.load(parts[0]);
    const second = await PDFDocument.load(parts[1]);
    expect(first.getPageCount()).toBe(2);
    expect(second.getPageCount()).toBe(2);
  });

  it("extracts, deletes, reorders, and rotates pages without corrupting the PDF", async () => {
    const source = await makePdf(4);
    expect((await PDFDocument.load(await extractPdfPages(source, [1, 3]))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await deletePdfPages(source, [2, 4]))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await reorderPdfPages(source, [4, 3, 2, 1]))).getPageCount()).toBe(4);
    const rotated = await PDFDocument.load(await rotatePdfPages(source, 90, [2]));
    expect(rotated.getPage(0).getRotation().angle).toBe(0);
    expect(rotated.getPage(1).getRotation().angle).toBe(90);
  });

  it("optimizes, watermarks, numbers, and converts images to PDF", async () => {
    const source = await makePdf(2);
    expect((await PDFDocument.load(await optimizePdf(source))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await watermarkPdf(source, "CONFIDENTIAL"))).getPageCount()).toBe(2);
    expect((await PDFDocument.load(await numberPdfPages(source))).getPageCount()).toBe(2);
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
    expect((await PDFDocument.load(await imagesToPdf([{ bytes: png, mimeType: "image/png" }]))).getPageCount()).toBe(1);
  });

  it("permanently redacts text instead of drawing a visual overlay", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([420, 240]);
    const font = await source.embedFont(StandardFonts.Helvetica);
    page.drawText("TOP SECRET", { x: 40, y: 130, font, size: 18 });
    const output = await redactPdf(await source.save(), [{ page: 1, x: 25, y: 75, width: 190, height: 70 }]);
    const loadingTask = getDocument({ data: Uint8Array.from(output), useSystemFonts: true });
    const redacted = await loadingTask.promise;
    try {
      const text = await (await redacted.getPage(1)).getTextContent();
      expect(text.items.map((item) => "str" in item ? item.str : "").join(" ")).not.toContain("TOP SECRET");
    } finally {
      await loadingTask.destroy();
    }
  });
});
