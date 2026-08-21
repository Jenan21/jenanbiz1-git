import { PDFDocument } from "pdf-lib";

export type PdfBytes = Uint8Array | ArrayBuffer;

function toUint8Array(input: PdfBytes): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

export async function mergePdfs(inputs: PdfBytes[]): Promise<Uint8Array> {
  if (!inputs.length) {
    throw new Error("mergePdfs requires at least one PDF input");
  }

  const merged = await PDFDocument.create();
  for (const source of inputs) {
    const srcDoc = await PDFDocument.load(toUint8Array(source));
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
  const source = await PDFDocument.load(toUint8Array(input));
  const pageCount = source.getPageCount();
  if (pageCount === 0) return [];

  const normalizedRanges =
    ranges && ranges.length
      ? ranges
      : Array.from({ length: pageCount }, (_, index) => ({
          start: index + 1,
          end: index + 1,
        }));

  const outputs: Uint8Array[] = [];
  for (const range of normalizedRanges) {
    if (range.start < 1 || range.end < range.start || range.end > pageCount) {
      throw new Error("Invalid PDF split range");
    }

    const out = await PDFDocument.create();
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_, offset) => range.start - 1 + offset,
    );
    const copied = await out.copyPages(source, indices);
    for (const page of copied) out.addPage(page);
    outputs.push(await out.save());
  }

  return outputs;
}

const pdfEngine = { mergePdfs, splitPdf };
export default pdfEngine;
