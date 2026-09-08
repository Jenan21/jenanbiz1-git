import { NextRequest, NextResponse } from "next/server";
import { mergePdfs, splitPdf } from "@/packages/pdf-engine/src";
import { parseDocx } from "@/packages/docs-engine/src";
import { parseXlsx } from "@/packages/sheets-engine/src";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";

export const runtime = "nodejs";

const maxFiles = 8;
const maxFileBytes = 10 * 1024 * 1024;

function hasPdfSignature(bytes: Uint8Array) {
  return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

function hasZipSignature(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
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
      const body = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
      return new NextResponse(body, { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=jenan-merged.pdf", "cache-control": "no-store" } });
    }
    if (action === "splitPdf") {
      if (files.length !== 1 || !hasPdfSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid PDF file" }, { status: 400 });
      const outputs = await splitPdf(bytes[0], parseRanges(form.get("ranges")));
      if (!outputs.length) return NextResponse.json({ success: false, message: "The PDF has no pages to split" }, { status: 422 });
      return NextResponse.json({ success: true, documents: outputs.map((output) => Buffer.from(output).toString("base64")) }, { headers: { "cache-control": "no-store" } });
    }
    if (action === "analyzeDocx") {
      if (files.length !== 1 || !hasZipSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid DOCX file" }, { status: 400 });
      return NextResponse.json({ success: true, document: await parseDocx(bytes[0]) });
    }
    if (action === "analyzeXlsx") {
      if (files.length !== 1 || !hasZipSignature(bytes[0])) return NextResponse.json({ success: false, message: "Provide one valid XLSX file" }, { status: 400 });
      return NextResponse.json({ success: true, workbook: await parseXlsx(bytes[0]) }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ success: false, message: "Unknown document action" }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "The document could not be processed" }, { status: 422 });
  }
}