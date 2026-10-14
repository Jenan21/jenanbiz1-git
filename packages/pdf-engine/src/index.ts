import { createCanvas } from "@napi-rs/canvas";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type PdfBytes = Uint8Array | ArrayBuffer;

/** Ceilings that stop a crafted file from turning a small upload into an unbounded amount of work or memory. */
export const PDF_LIMITS = {
  /** Most pages a PDF may have, whether it is read or produced. */
  maxPages: 500,
  /** Most bytes a split may produce in total: every part carries its own copy of the resources it shares with the others. */
  maxSplitOutputBytes: 50 * 1024 * 1024,
  /** Most pixels of any canvas this engine allocates (width x height). */
  maxRenderPixels: 25_000_000,
  /** Longest side of any canvas, in pixels. */
  maxCanvasSide: 16_384,
  /** Most characters of text read out of a PDF or laid out into one. */
  maxTextChars: 2_000_000,
  /** Most pixels in a PNG that is embedded; the decoder allocates width x height x 4 bytes. */
  maxImagePixels: 40_000_000,
  /** Most redaction areas per request. */
  maxRedactions: 200,
} as const;

/** Raised for a PDF or image input the engine refuses because it is malformed or exceeds a ceiling in `PDF_LIMITS`. The message is safe to show to users. */
export class PdfLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfLimitError";
  }
}

function toUint8Array(input: PdfBytes): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function assertPageCount(pageCount: number, subject = "The PDF") {
  if (pageCount > PDF_LIMITS.maxPages) throw new PdfLimitError(`${subject} has ${pageCount} pages; the limit is ${PDF_LIMITS.maxPages}.`);
}

async function loadPdf(input: PdfBytes) {
  const document = await PDFDocument.load(toUint8Array(input));
  assertPageCount(document.getPageCount());
  return document;
}

export async function mergePdfs(inputs: PdfBytes[]): Promise<Uint8Array> {
  if (!inputs.length) {
    throw new Error("mergePdfs requires at least one PDF input");
  }

  const merged = await PDFDocument.create();
  for (const source of inputs) {
    const srcDoc = await loadPdf(source);
    assertPageCount(merged.getPageCount() + srcDoc.getPageCount(), "The merged PDF");
    const pageIndices = srcDoc.getPageIndices();
    const pages = await merged.copyPages(srcDoc, pageIndices);
    for (const page of pages) merged.addPage(page);
  }

  return await merged.save();
}

export interface PageRange {
  start: number;
  end: number;
}

export async function splitPdf(
  input: PdfBytes,
  ranges?: PageRange[],
): Promise<Uint8Array[]> {
  const source = await loadPdf(input);
  const pageCount = source.getPageCount();
  if (pageCount === 0) return [];

  const normalizedRanges =
    ranges && ranges.length
      ? ranges
      : Array.from({ length: pageCount }, (_, index) => ({
          start: index + 1,
          end: index + 1,
        }));

  if (normalizedRanges.length > PDF_LIMITS.maxPages) {
    throw new PdfLimitError(`A PDF can be split into at most ${PDF_LIMITS.maxPages} parts.`);
  }
  let outputPages = 0;
  let outputBytes = 0;
  const outputs: Uint8Array[] = [];
  for (const range of normalizedRanges) {
    if (range.start < 1 || range.end < range.start || range.end > pageCount) {
      throw new Error("Invalid PDF split range");
    }
    outputPages += range.end - range.start + 1;
    assertPageCount(outputPages, "The split output");

    const out = await PDFDocument.create();
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_, offset) => range.start - 1 + offset,
    );
    const copied = await out.copyPages(source, indices);
    for (const page of copied) out.addPage(page);
    const part = await out.save();
    outputBytes += part.byteLength;
    if (outputBytes > PDF_LIMITS.maxSplitOutputBytes) {
      throw new PdfLimitError(`The split would produce more than ${PDF_LIMITS.maxSplitOutputBytes / (1024 * 1024)} MB.`);
    }
    outputs.push(part);
  }

  return outputs;
}

function normalizePages(pageNumbers: number[], pageCount: number) {
  if (!pageNumbers.length || new Set(pageNumbers).size !== pageNumbers.length || pageNumbers.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) throw new Error("Invalid PDF page selection");
  return pageNumbers.map((page) => page - 1);
}

export async function extractPdfPages(input: PdfBytes, pageNumbers: number[]) {
  const source = await loadPdf(input);
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, normalizePages(pageNumbers, source.getPageCount()));
  pages.forEach((page) => output.addPage(page));
  return output.save();
}

export async function deletePdfPages(input: PdfBytes, pageNumbers: number[]) {
  const document = await loadPdf(input);
  const indices = normalizePages(pageNumbers, document.getPageCount()).sort((left, right) => right - left);
  if (indices.length >= document.getPageCount()) throw new Error("A PDF must retain at least one page");
  indices.forEach((index) => document.removePage(index));
  return document.save();
}

export async function reorderPdfPages(input: PdfBytes, pageNumbers: number[]) {
  const source = await loadPdf(input);
  const indices = normalizePages(pageNumbers, source.getPageCount());
  if (indices.length !== source.getPageCount()) throw new Error("PDF reorder requires every page exactly once");
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  return output.save();
}

export async function rotatePdfPages(input: PdfBytes, rotation: 90 | 180 | 270, pageNumbers?: number[]) {
  const document = await loadPdf(input);
  const indices = pageNumbers?.length ? normalizePages(pageNumbers, document.getPageCount()) : document.getPageIndices();
  indices.forEach((index) => {
    const page = document.getPage(index);
    page.setRotation(degrees((page.getRotation().angle + rotation) % 360));
  });
  return document.save();
}

export async function optimizePdf(input: PdfBytes) {
  const source = toUint8Array(input);
  const document = await loadPdf(source);
  const optimized = await document.save({ addDefaultPage: false, useObjectStreams: true });
  return optimized.byteLength < source.byteLength ? optimized : source;
}

/** Width and height declared by a PNG's IHDR chunk, or null when the bytes are not a PNG. */
function readPngDimensions(bytes: Uint8Array) {
  if (bytes.byteLength < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a || view.getUint32(12) !== 0x49484452) return null;
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

export async function imagesToPdf(
  inputs: Array<{ bytes: PdfBytes; mimeType: "image/jpeg" | "image/png" }>,
  options: { orientation?: "auto" | "landscape" | "portrait"; pageSize?: "A4" | "LETTER" | "ORIGINAL" } = {},
) {
  if (!inputs.length) throw new Error("At least one image is required");
  assertPageCount(inputs.length, "The image PDF");
  const document = await PDFDocument.create();
  for (const input of inputs) {
    const imageBytes = toUint8Array(input.bytes);
    if (input.mimeType === "image/png") {
      const size = readPngDimensions(imageBytes);
      if (!size) throw new PdfLimitError("The PNG image is not valid.");
      if (size.width < 1 || size.height < 1 || size.width * size.height > PDF_LIMITS.maxImagePixels) {
        throw new PdfLimitError(`A PNG image may have at most ${PDF_LIMITS.maxImagePixels.toLocaleString("en-US")} pixels.`);
      }
    }
    const image = input.mimeType === "image/png" ? await document.embedPng(imageBytes) : await document.embedJpg(imageBytes);
    const dimensions = image.scale(1);
    const sourceSize = options.pageSize === "LETTER" ? [612, 792] : options.pageSize === "ORIGINAL" ? [dimensions.width, dimensions.height] : [595, 842];
    const landscape = options.orientation === "landscape" || (options.orientation !== "portrait" && options.orientation !== "auto" ? false : options.orientation === "auto" && dimensions.width > dimensions.height);
    const [maxWidth, maxHeight] = landscape && sourceSize[0] < sourceSize[1] ? [sourceSize[1], sourceSize[0]] : sourceSize;
    const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 1);
    const width = dimensions.width * scale;
    const height = dimensions.height * scale;
    const page = document.addPage([maxWidth, maxHeight]);
    page.drawImage(image, { x: (maxWidth - width) / 2, y: (maxHeight - height) / 2, width, height });
  }
  return document.save();
}

export async function extractPdfText(input: PdfBytes) {
  const source = toUint8Array(input);
  const loadingTask = getDocument({ data: Uint8Array.from(source), useSystemFonts: true });
  const document = await loadingTask.promise;
  try {
    assertPageCount(document.numPages);
    const pages: string[] = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      // Read the page as a stream so that a page full of text stops at the ceiling instead of being built in full first.
      // The stream is not cancelled when the ceiling is hit: pdf.js keeps writing to a cancelled stream and fails
      // asynchronously, so tearing down the whole document in `finally` is what stops the work.
      const reader = page.streamTextContent().getReader();
      const strings: string[] = [];
      for (;;) {
        const { done, value } = (await reader.read()) as ReadableStreamReadResult<{ items: Array<{ str?: string }> }>;
        if (done) break;
        for (const item of value.items) {
          if (!item.str) continue;
          totalChars += item.str.length + 1;
          if (totalChars > PDF_LIMITS.maxTextChars) throw new PdfLimitError(`The PDF holds more than ${PDF_LIMITS.maxTextChars.toLocaleString("en-US")} characters of text.`);
          strings.push(item.str);
        }
      }
      pages.push(strings.join(" ").replace(/\s+/g, " ").trim());
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function textToPdf(text: string, title = "Jenan PRO document") {
  if (text.length > PDF_LIMITS.maxTextChars) throw new PdfLimitError(`The text is longer than ${PDF_LIMITS.maxTextChars.toLocaleString("en-US")} characters.`);
  const document = await PDFDocument.create();
  const pageWidth = 595;
  const pageHeight = 842;
  const scale = 2;
  const padding = 54;
  const fontSize = 15;
  const lineHeight = 23;
  const linesPerPage = Math.max(1, Math.floor((pageHeight - padding * 2 - 34) / lineHeight));
  const maxLines = PDF_LIMITS.maxPages * linesPerPage;
  const lines: string[] = [];
  const addLine = (line: string) => {
    lines.push(line);
    if (lines.length > maxLines) throw new PdfLimitError(`The text needs more than ${PDF_LIMITS.maxPages} pages.`);
  };
  const measureContext = createCanvas(1, 1).getContext("2d");
  measureContext.font = `${fontSize * scale}px Arial`;
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      addLine("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureContext.measureText(candidate).width > (pageWidth - padding * 2) * scale && line) {
        addLine(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    addLine(line);
  }
  const chunks = Array.from({ length: Math.max(1, Math.ceil(lines.length / linesPerPage)) }, (_, index) => lines.slice(index * linesPerPage, (index + 1) * linesPerPage));
  for (const chunk of chunks) {
    if (!/[\u0600-\u06ff]/.test(`${title}${chunk.join("")}`)) {
      const font = await document.embedFont(StandardFonts.Helvetica);
      const bold = await document.embedFont(StandardFonts.HelveticaBold);
      const page = document.addPage([pageWidth, pageHeight]);
      page.drawText(title.slice(0, 80), { x: padding, y: pageHeight - padding, font: bold, size: 18, color: rgb(0.04, 0.12, 0.2) });
      chunk.forEach((line, index) => {
        if (line) page.drawText(line, { x: padding, y: pageHeight - padding - 38 - index * lineHeight, font, size: fontSize, color: rgb(0.04, 0.12, 0.2) });
      });
      continue;
    }
    const canvas = createCanvas(pageWidth * scale, pageHeight * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0b1f33";
    context.font = `bold ${18 * scale}px Arial`;
    context.fillText(title.slice(0, 80), padding * scale, padding * scale);
    context.font = `${fontSize * scale}px Arial`;
    chunk.forEach((line, index) => {
      const y = (padding + 38 + index * lineHeight) * scale;
      const rtl = /[\u0600-\u06ff]/.test(line);
      if (rtl) {
        context.textAlign = "right";
        context.fillText(line, (pageWidth - padding) * scale, y);
      } else {
        context.textAlign = "left";
        context.fillText(line, padding * scale, y);
      }
    });
    const image = await document.embedPng(canvas.toBuffer("image/png"));
    const page = document.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { height: pageHeight, width: pageWidth, x: 0, y: 0 });
  }
  return document.save({ addDefaultPage: false, useObjectStreams: true });
}

export async function watermarkPdf(input: PdfBytes, watermark: string) {
  const document = await loadPdf(input);
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const size = Math.max(24, Math.min(width, height) / 12);
    page.drawText(watermark.slice(0, 120), { x: width * 0.18, y: height * 0.48, size, font, color: rgb(0.35, 0.45, 0.5), opacity: 0.22, rotate: degrees(35) });
  });
  return document.save();
}

export async function numberPdfPages(input: PdfBytes) {
  const document = await loadPdf(input);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  pages.forEach((page, index) => {
    const label = `${index + 1} / ${pages.length}`;
    const size = 10;
    const width = font.widthOfTextAtSize(label, size);
    page.drawText(label, { x: (page.getWidth() - width) / 2, y: 18, size, font, color: rgb(0.25, 0.35, 0.4) });
  });
  return document.save();
}

/** Redaction rasterises a page: render at 2x when the canvas stays inside the ceilings, at 1x otherwise, and refuse beyond that. */
function renderScaleFor(width: number, height: number) {
  for (const scale of [2, 1]) {
    const canvasWidth = Math.ceil(width * scale);
    const canvasHeight = Math.ceil(height * scale);
    if (
      Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight) && canvasWidth > 0 && canvasHeight > 0 &&
      canvasWidth <= PDF_LIMITS.maxCanvasSide && canvasHeight <= PDF_LIMITS.maxCanvasSide &&
      canvasWidth * canvasHeight <= PDF_LIMITS.maxRenderPixels
    ) return scale;
  }
  throw new PdfLimitError("This page is too large to redact safely.");
}

export async function redactPdf(input: PdfBytes, redactions: Array<{ height: number; page: number; width: number; x: number; y: number }>) {
  if (!redactions.length) throw new Error("At least one redaction area is required");
  if (redactions.length > PDF_LIMITS.maxRedactions) throw new PdfLimitError(`A request may hold at most ${PDF_LIMITS.maxRedactions} redaction areas.`);
  const sourceBytes = toUint8Array(input);
  const sourceDocument = await loadPdf(sourceBytes);
  const loadingTask = getDocument({ data: Uint8Array.from(sourceBytes), useSystemFonts: true });
  const renderedDocument = await loadingTask.promise;
  try {
    assertPageCount(renderedDocument.numPages);
    const redactionsByPage = new Map<number, typeof redactions>();
    const renderScales = new Map<number, number>();
    for (const redaction of redactions) {
      if (![redaction.page, redaction.x, redaction.y, redaction.width, redaction.height].every(Number.isFinite) || !Number.isInteger(redaction.page) || redaction.page < 1 || redaction.page > renderedDocument.numPages || redaction.width <= 0 || redaction.height <= 0) throw new Error("Invalid PDF redaction area");
      const page = await renderedDocument.getPage(redaction.page);
      const viewport = page.getViewport({ scale: 1 });
      if (redaction.x < 0 || redaction.y < 0 || redaction.x + redaction.width > viewport.width || redaction.y + redaction.height > viewport.height) throw new Error("PDF redaction area is outside the page");
      // Decide the canvas size from the page's declared size before anything is allocated.
      if (!renderScales.has(redaction.page)) renderScales.set(redaction.page, renderScaleFor(viewport.width, viewport.height));
      redactionsByPage.set(redaction.page, [...(redactionsByPage.get(redaction.page) ?? []), redaction]);
    }

    const output = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= renderedDocument.numPages; pageNumber += 1) {
      const pageRedactions = redactionsByPage.get(pageNumber);
      if (!pageRedactions?.length) {
        const [copied] = await output.copyPages(sourceDocument, [pageNumber - 1]);
        output.addPage(copied);
        continue;
      }
      const scale = renderScales.get(pageNumber) ?? 1;
      const page = await renderedDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({ background: "#ffffff", canvas: null, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
      context.fillStyle = "#000000";
      for (const redaction of pageRedactions) context.fillRect(redaction.x * scale, redaction.y * scale, redaction.width * scale, redaction.height * scale);
      const image = await output.embedPng(canvas.toBuffer("image/png"));
      const outputPage = output.addPage([viewport.width / scale, viewport.height / scale]);
      outputPage.drawImage(image, { height: outputPage.getHeight(), width: outputPage.getWidth(), x: 0, y: 0 });
    }
    return output.save({ addDefaultPage: false, useObjectStreams: true });
  } finally {
    await loadingTask.destroy();
  }
}

const pdfEngine = { deletePdfPages, extractPdfPages, extractPdfText, imagesToPdf, mergePdfs, numberPdfPages, optimizePdf, redactPdf, reorderPdfPages, rotatePdfPages, splitPdf, textToPdf, watermarkPdf };
export default pdfEngine;
