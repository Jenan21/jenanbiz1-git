import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfs, splitPdf } from "@/packages/pdf-engine/src";

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
});
