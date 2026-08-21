import mammoth from "mammoth";

export interface ParsedDocx {
  text: string;
  paragraphCount: number;
  wordCount: number;
}

export async function parseDocx(
  input: Uint8Array | ArrayBuffer,
): Promise<ParsedDocx> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  const text = result.value.trim();
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
