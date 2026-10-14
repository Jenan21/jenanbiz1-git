import { listZipEntryNames } from "@/packages/docs-engine/src/zip-guard";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export type SniffedImageType = "image/gif" | "image/jpeg" | "image/png" | "image/webp";
export type SniffedFileType =
  | SniffedImageType
  | "application/pdf"
  | typeof DOCX_MIME_TYPE
  | typeof PPTX_MIME_TYPE
  | typeof XLSX_MIME_TYPE
  | "text/plain";

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return bytes.byteLength >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  let text = "";
  for (let index = start; index < Math.min(end, bytes.byteLength); index += 1) text += String.fromCharCode(bytes[index]);
  return text;
}

/** The declared type without parameters, lower-cased: `Text/Plain; charset=utf-8` becomes `text/plain`. */
export function normalizeDeclaredMimeType(value: string | null | undefined) {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

/** Browsers send an empty or generic type when they do not recognise a file; the content then decides. */
export function isUnspecifiedMimeType(declared: string) {
  return declared === "" || declared === "application/octet-stream" || declared === "binary/octet-stream";
}

export function isPdf(bytes: Uint8Array) {
  return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) && /^\d\.\d$/.test(ascii(bytes, 5, 8));
}

/** PNG, JPEG, WebP and GIF by their leading structure, not by a declared type. */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  // The PNG signature, then the IHDR chunk every PNG must open with.
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && ascii(bytes, 12, 16) === "IHDR") return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // A RIFF container whose first chunk is a VP8 bitstream (VP8, VP8L or VP8X).
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP" && ascii(bytes, 12, 15) === "VP8") return "image/webp";
  const gifHeader = ascii(bytes, 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") return "image/gif";
  return null;
}

/** Valid UTF-8 without NUL bytes: what a plain-text or CSV file looks like, and what a binary file does not. */
export function isPlainText(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** An OOXML package is a ZIP that holds `[Content_Types].xml` and the main part of its format. */
async function sniffOfficePackage(bytes: Uint8Array): Promise<typeof DOCX_MIME_TYPE | typeof PPTX_MIME_TYPE | typeof XLSX_MIME_TYPE | null> {
  let names: Set<string>;
  try {
    names = new Set(await listZipEntryNames(bytes));
  } catch {
    return null;
  }
  if (!names.has("[Content_Types].xml")) return null;
  if (names.has("word/document.xml")) return DOCX_MIME_TYPE;
  if (names.has("xl/workbook.xml")) return XLSX_MIME_TYPE;
  if (names.has("ppt/presentation.xml")) return PPTX_MIME_TYPE;
  return null;
}

/**
 * What the bytes really are, or null when they are none of the supported kinds. Never trusts a declared type:
 * PDFs, images and Office packages are recognised by their structure, and anything else is accepted only as text.
 */
export async function sniffFileContent(bytes: Uint8Array): Promise<SniffedFileType | null> {
  if (bytes.byteLength === 0) return null;
  if (isPdf(bytes)) return "application/pdf";
  const image = sniffImageType(bytes);
  if (image) return image;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return sniffOfficePackage(bytes);
  return isPlainText(bytes) ? "text/plain" : null;
}
