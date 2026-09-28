import { NextRequest, NextResponse } from "next/server";
import { deletePdfPages, extractPdfPages, imagesToPdf, mergePdfs, numberPdfPages, optimizePdf, redactPdf, reorderPdfPages, rotatePdfPages, splitPdf, watermarkPdf } from "@/packages/pdf-engine/src";
import { parseDocx } from "@/packages/docs-engine/src";
import { parseXlsx } from "@/packages/sheets-engine/src";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const maxFiles = 8;
const maxFileBytes = 10 * 1024 * 1024;

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

function hasZipSignature(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function imageMimeType(bytes: Uint8Array): "image/jpeg" | "image/png" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

function parseRanges(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",").map((range) => {
    const match = range.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Invalid PDF range");
    const start = Number(match[1]);
    return { start, end: Number(match[2] ?? start) };
  });
}

async function recordToolRun(input: { action: string; fileCount: number; metadata?: Record<string, unknown>; userId: string }) {
  await db.auditLog.create({
    data: {
      actorId: input.userId,
      action: `software.documents.${input.action}`,
      entityType: "SoftwareTool",
      metadata: { fileCount: input.fileCount, ...input.metadata },
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const action = form?.get("action");
  const files = form?.getAll("files").filter((value): value is File => value instanceof File) ?? [];
  if (!form || typeof action !== "string" || !files.length || files.length > maxFiles || files.some((file) => file.size === 0 || file.size > maxFileBytes)) {
    return NextResponse.json({ success: false, message: "Invalid document request" }, { status: 400 });
  }

  try {
    const bytes = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
    if (action === "mergePdf") {
      if (!bytes.every(hasPdfSignature)) return NextResponse.json({ success: false, message: "Only valid PDF files can be merged" }, { status: 400 });
      const output = await mergePdfs(bytes);
      await recordToolRun({ action, fileCount: files.length, metadata: { outputBytes: output.byteLength }, userId: user.id });
      return pdfResponse(output, "jenan-merged.pdf");
    }
    if (action === "splitPdf") {
      if (files.length !== 1 || !hasPdfSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid PDF file" }, { status: 400 });
      const outputs = await splitPdf(bytes[0], parseRanges(form.get("ranges")));
      if (!outputs.length) return NextResponse.json({ success: false, message: "The PDF has no pages to split" }, { status: 422 });
      await recordToolRun({ action, fileCount: files.length, metadata: { outputDocuments: outputs.length }, userId: user.id });
      return NextResponse.json({ success: true, documents: outputs.map((output) => Buffer.from(output).toString("base64")) }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "analyzeDocx") {
      if (files.length !== 1 || !hasZipSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid DOCX file" }, { status: 400 });
      const document = await parseDocx(bytes[0]);
      await recordToolRun({ action, fileCount: files.length, metadata: { paragraphCount: document.paragraphCount, wordCount: document.wordCount }, userId: user.id });
      return NextResponse.json({ success: true, document }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "analyzeXlsx") {
      if (files.length !== 1 || !hasZipSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid XLSX file" }, { status: 400 });
      const workbook = await parseXlsx(bytes[0]);
      await recordToolRun({ action, fileCount: files.length, metadata: { sheetCount: workbook.sheets.length, sheetNames: workbook.sheetNames }, userId: user.id });
      return NextResponse.json({ success: true, workbook }, { headers: { "cache-control": "no-store" } });
    }
    if (["extractPdf", "deletePdfPages", "reorderPdfPages", "rotatePdfPages", "compressPdf", "watermarkPdf", "numberPdfPages", "redactPdf"].includes(action)) {
      if (files.length !== 1 || !hasPdfSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid PDF file" }, { status: 400 });
      if (action === "rotatePdfPages" && ![90, 180, 270].includes(Number(form.get("rotation")))) return NextResponse.json({ success: false, message: "Invalid PDF rotation" }, { status: 400 });
      if (action === "watermarkPdf" && String(form.get("text") ?? "").trim().length < 1) return NextResponse.json({ success: false, message: "Watermark text is required" }, { status: 400 });
      const redaction = action === "redactPdf" ? { page: Number(form.get("page")), x: Number(form.get("x")), y: Number(form.get("y")), width: Number(form.get("width")), height: Number(form.get("height")) } : null;
      if (redaction && (!Number.isInteger(redaction.page) || redaction.page < 1 || ![redaction.x, redaction.y, redaction.width, redaction.height].every(Number.isFinite) || redaction.width <= 0 || redaction.height <= 0)) return NextResponse.json({ success: false, message: "Valid redaction coordinates are required" }, { status: 400 });
      const output = action === "extractPdf"
        ? await extractPdfPages(bytes[0], parsePages(form.get("pages")))
        : action === "deletePdfPages"
          ? await deletePdfPages(bytes[0], parsePages(form.get("pages")))
          : action === "reorderPdfPages"
            ? await reorderPdfPages(bytes[0], parsePages(form.get("pages")))
            : action === "rotatePdfPages"
              ? await rotatePdfPages(bytes[0], Number(form.get("rotation")) as 90 | 180 | 270, typeof form.get("pages") === "string" && String(form.get("pages")).trim() ? parsePages(form.get("pages")) : undefined)
              : action === "compressPdf"
                ? await optimizePdf(bytes[0])
                : action === "watermarkPdf"
                  ? await watermarkPdf(bytes[0], String(form.get("text") ?? "").trim())
                  : action === "redactPdf"
                    ? await redactPdf(bytes[0], [redaction!])
                    : await numberPdfPages(bytes[0]);
      await recordToolRun({ action, fileCount: 1, metadata: { inputBytes: bytes[0].byteLength, outputBytes: output.byteLength }, userId: user.id });
      return pdfResponse(output, `jenan-${action.replace(/Pdf|Pages/g, "").toLowerCase()}.pdf`);
    }
    if (action === "imagesToPdf") {
      const imageTypes = bytes.map(imageMimeType);
      if (imageTypes.some((type) => !type)) return NextResponse.json({ success: false, message: "Only valid PNG or JPEG images can be converted" }, { status: 400 });
      const output = await imagesToPdf(bytes.map((value, index) => ({ bytes: value, mimeType: imageTypes[index]! })));
      await recordToolRun({ action, fileCount: files.length, metadata: { outputBytes: output.byteLength }, userId: user.id });
      return pdfResponse(output, "jenan-images.pdf");
    }
    return NextResponse.json({ success: false, message: "Unknown document action" }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "The document could not be processed" }, { status: 422 });
  }
}

function parsePages(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) throw new Error("PDF pages are required");
  return value.split(",").map((page) => {
    const parsed = Number(page.trim());
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Invalid PDF page selection");
    return parsed;
  });
}

function pdfResponse(output: Uint8Array, fileName: string) {
  const body = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
  return new NextResponse(body, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename=${fileName}`, "cache-control": "no-store" } });
}