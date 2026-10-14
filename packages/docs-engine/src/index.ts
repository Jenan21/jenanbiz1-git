import mammoth from "mammoth";
import { assertSafeZipArchive, DocumentLimitError } from "./zip-guard";

export { assertSafeZipArchive, DEFAULT_ZIP_LIMITS, DocumentLimitError, listZipEntryNames } from "./zip-guard";
export type { ZipInspection, ZipLimits } from "./zip-guard";

/** Most characters of text a document may yield; past this a request is refused rather than silently truncated. */
export const MAX_DOCX_TEXT_CHARS = 5_000_000;

export interface ParsedDocx {
  text: string;
  paragraphCount: number;
  wordCount: number;
}

export async function parseDocx(
  input: Uint8Array | ArrayBuffer,
): Promise<ParsedDocx> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  await assertSafeZipArchive(bytes);
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = result.value.trim();
  if (text.length > MAX_DOCX_TEXT_CHARS) {
    throw new DocumentLimitError(`The document holds more than ${MAX_DOCX_TEXT_CHARS.toLocaleString("en-US")} characters of text.`);
  }
  const paragraphCount = text ? text.split(/\n+/).length : 0;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    text,
    paragraphCount,
    wordCount,
  };
}

const docsEngine = { parseDocx };
export default docsEngine;
