import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfText, imagesToPdf, mergePdfs, PDF_LIMITS, PdfLimitError, redactPdf, rotatePdfPages, splitPdf, textToPdf } from "@/packages/pdf-engine/src";

vi.mock("@napi-rs/canvas", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@napi-rs/canvas")>();
  return { ...actual, createCanvas: vi.fn(actual.createCanvas) };
});

async function blankPdf(pageCount: number, size: [number, number] = [595, 842]) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage(size);
  return document.save();
}

/** A PNG header that announces the given size; nothing after the header chunk is needed to be refused. */
function pngAnnouncing(width: number, height: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

beforeEach(() => {
  vi.mocked(createCanvas).mockClear();
});

describe("pdf engine ceilings", () => {
  it("refuses a PDF with more pages than the limit, whichever operation reads it", async () => {
    const tooMany = await blankPdf(PDF_LIMITS.maxPages + 1);
    await expect(rotatePdfPages(tooMany, 90)).rejects.toBeInstanceOf(PdfLimitError);
    await expect(rotatePdfPages(tooMany, 90)).rejects.toThrow(`limit is ${PDF_LIMITS.maxPages}`);
    await expect(splitPdf(tooMany)).rejects.toBeInstanceOf(PdfLimitError);
    await expect(extractPdfText(tooMany)).rejects.toBeInstanceOf(PdfLimitError);
    await expect(redactPdf(tooMany, [{ height: 10, page: 1, width: 10, x: 0, y: 0 }])).rejects.toBeInstanceOf(PdfLimitError);
  });

  it("still handles a PDF at the limit", async () => {
    const atLimit = await blankPdf(PDF_LIMITS.maxPages);
    const rotated = await rotatePdfPages(atLimit, 90, [1]);
    expect((await PDFDocument.load(rotated)).getPageCount()).toBe(PDF_LIMITS.maxPages);
  });

  it("limits what a merge or a split may produce", async () => {
    const part = await blankPdf(300);
    await expect(mergePdfs([part, part])).rejects.toThrow("The merged PDF has 600 pages");
    await expect(splitPdf(part, [{ end: 300, start: 1 }, { end: 300, start: 1 }])).rejects.toThrow("The split output has 600 pages");
    const few = await blankPdf(3);
    const manyRanges = Array.from({ length: PDF_LIMITS.maxPages + 1 }, () => ({ end: 1, start: 1 }));
    await expect(splitPdf(few, manyRanges)).rejects.toThrow(`at most ${PDF_LIMITS.maxPages} parts`);
  });

  it("refuses to redact a page whose declared size would need an enormous canvas, before allocating one", async () => {
    const huge = await blankPdf(1, [20_000, 20_000]);
    await expect(redactPdf(huge, [{ height: 100, page: 1, width: 100, x: 10, y: 10 }])).rejects.toThrow("too large to redact safely");
    await expect(redactPdf(huge, [{ height: 100, page: 1, width: 100, x: 10, y: 10 }])).rejects.toBeInstanceOf(PdfLimitError);
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it("redacts a large page at 1x instead of 2x when 2x would pass the pixel ceiling", async () => {
    // 2,600 x 2,600 points: 27 megapixels at 2x (over the ceiling), 6.8 megapixels at 1x.
    const large = await blankPdf(1, [2_600, 2_600]);
    const output = await redactPdf(large, [{ height: 100, page: 1, width: 100, x: 10, y: 10 }]);
    const loaded = await PDFDocument.load(output);
    expect(loaded.getPage(0).getWidth()).toBeCloseTo(2_600, 0);
    expect(loaded.getPage(0).getHeight()).toBeCloseTo(2_600, 0);
    const sizes = vi.mocked(createCanvas).mock.calls.map(([width, height]) => width * height);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(PDF_LIMITS.maxRenderPixels);
  }, 60_000);

  it("refuses more redaction areas than the limit", async () => {
    const page = await blankPdf(1);
    const areas = Array.from({ length: PDF_LIMITS.maxRedactions + 1 }, () => ({ height: 1, page: 1, width: 1, x: 0, y: 0 }));
    await expect(redactPdf(page, areas)).rejects.toBeInstanceOf(PdfLimitError);
  });

  it("refuses text that would run past the page or character limits", async () => {
    await expect(textToPdf("x".repeat(PDF_LIMITS.maxTextChars + 1))).rejects.toBeInstanceOf(PdfLimitError);
    // 30 lines fit on a page, so this needs a little over 500 of them.
    const lines = Array.from({ length: PDF_LIMITS.maxPages * 30 + 1 }, () => "line").join("\n");
    await expect(textToPdf(lines)).rejects.toThrow(`more than ${PDF_LIMITS.maxPages} pages`);
  });

  it("stops reading text out of a PDF at the character limit", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    // Tiny type packs about 880,000 visible characters onto a page, so three pages pass the limit.
    const line = "a ".repeat(550);
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      const page = document.addPage([595, 842]);
      for (let row = 0; row < 800; row += 1) page.drawText(line, { font, size: 1, x: 2, y: 841 - row });
    }
    await expect(extractPdfText(await document.save())).rejects.toThrow("characters of text");
  }, 60_000);

  it("refuses a PNG that announces more pixels than the decoder may allocate", async () => {
    await expect(imagesToPdf([{ bytes: pngAnnouncing(50_000, 50_000), mimeType: "image/png" }])).rejects.toBeInstanceOf(PdfLimitError);
    await expect(imagesToPdf([{ bytes: pngAnnouncing(0xffffffff, 0xffffffff), mimeType: "image/png" }])).rejects.toBeInstanceOf(PdfLimitError);
    await expect(imagesToPdf([{ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]), mimeType: "image/png" }])).rejects.toThrow("not valid");
  });
});
