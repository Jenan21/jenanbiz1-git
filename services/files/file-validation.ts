import JSZip from "jszip";
import type { Readable } from "node:stream";
import sharp from "sharp";

export function validateFileName(name: string) {
  if (
    !name.trim() ||
    name === "." ||
    name === ".." ||
    name.length > 255 ||
    /[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(name)
  ) {
    throw new Error("Invalid file name");
  }
}

export async function validateFileContent(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "text/plain") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("Invalid text file");
    return;
  }
  if (mimeType === "application/pdf") {
    const decoder = new TextDecoder();
    const footer = decoder.decode(bytes.subarray(-1024));
    const trailer = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(footer);
    const offset = trailer ? Number(trailer[1]) : NaN;
    if (
      !/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(
        decoder.decode(bytes.subarray(0, 16)),
      ) ||
      !Number.isSafeInteger(offset) ||
      offset < 8 ||
      offset >= bytes.length ||
      !/^(?:xref\s|\d+\s+\d+\s+obj\b)/.test(
        decoder.decode(bytes.subarray(offset, offset + 64)),
      )
    ) {
      throw new Error("Invalid PDF");
    }
    // Inspect the container without inflating attacker-controlled PDF object streams.
    return;
  }
  const imageFormats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
  };
  if (imageFormats[mimeType]) {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 });
    if ((await image.metadata()).format !== imageFormats[mimeType])
      throw new Error("Image type mismatch");
    await image.stats();
    return;
  }
  const office =
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ? {
          path: "word/document.xml",
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
        }
      : mimeType ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ? {
            path: "xl/workbook.xml",
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
          }
        : null;
  if (!office) throw new Error("Unsupported file type");
  const zip = await JSZip.loadAsync(bytes);
  const types = zip.file("[Content_Types].xml");
  if (
    !types ||
    !zip.file(office.path) ||
    Object.keys(zip.files).length > 1000 ||
    Object.keys(zip.files).some((name) => /vbaProject\.bin$/i.test(name))
  ) {
    throw new Error("Invalid Office file");
  }
  const stream = types.nodeStream("nodebuffer") as Readable;
  const chunks: Buffer[] = [];
  let size = 0;
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        stream.destroy();
        reject(new Error("Invalid Office file"));
      } else {
        chunks.push(chunk);
      }
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const contentTypes = Buffer.concat(chunks).toString("utf8");
  if (
    !contentTypes.includes(office.type) ||
    /macroEnabled|vbaProject/i.test(contentTypes)
  ) {
    throw new Error("Office type mismatch");
  }
}
