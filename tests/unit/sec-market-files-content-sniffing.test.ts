import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  DOCX_MIME_TYPE,
  isPdf,
  isPlainText,
  isUnspecifiedMimeType,
  normalizeDeclaredMimeType,
  PPTX_MIME_TYPE,
  sniffFileContent,
  sniffImageType,
  XLSX_MIME_TYPE,
} from "@/services/files/content-sniffing";

const text = (value: string) => new TextEncoder().encode(value);
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const webp = Uint8Array.from([...text("RIFF"), 0x1a, 0x00, 0x00, 0x00, ...text("WEBPVP8 "), 0x0e, 0x00, 0x00, 0x00]);
const gif = Uint8Array.from([...text("GIF89a"), 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);

async function zipOf(entries: Record<string, string>) {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(entries)) archive.file(name, content);
  return archive.generateAsync({ type: "uint8array" });
}

describe("content sniffing", () => {
  it("recognises PDFs, images and text by their bytes", async () => {
    expect(await sniffFileContent(text("%PDF-1.7\n1 0 obj\n%%EOF"))).toBe("application/pdf");
    expect(await sniffFileContent(png)).toBe("image/png");
    expect(await sniffFileContent(jpeg)).toBe("image/jpeg");
    expect(await sniffFileContent(webp)).toBe("image/webp");
    expect(await sniffFileContent(gif)).toBe("image/gif");
    expect(await sniffFileContent(text("Plain notes, with Arabic: مرحبا بالعالم\nsecond line"))).toBe("text/plain");
    expect(await sniffFileContent(text("name,amount\nAcme,10\n"))).toBe("text/plain");
  });

  it("recognises Office packages by the parts they hold, not by the file name", async () => {
    const docx = await zipOf({ "[Content_Types].xml": "<Types/>", "word/document.xml": "<w:document/>" });
    const xlsx = await zipOf({ "[Content_Types].xml": "<Types/>", "xl/workbook.xml": "<workbook/>" });
    const pptx = await zipOf({ "[Content_Types].xml": "<Types/>", "ppt/presentation.xml": "<p:presentation/>" });
    expect(await sniffFileContent(docx)).toBe(DOCX_MIME_TYPE);
    expect(await sniffFileContent(xlsx)).toBe(XLSX_MIME_TYPE);
    expect(await sniffFileContent(pptx)).toBe(PPTX_MIME_TYPE);
  });

  it("refuses a ZIP that is not an Office package", async () => {
    expect(await sniffFileContent(await zipOf({ "readme.txt": "hello" }))).toBeNull();
    // A main part without the content-types manifest is not a package either.
    expect(await sniffFileContent(await zipOf({ "word/document.xml": "<w:document/>" }))).toBeNull();
    // A ZIP signature followed by nothing valid.
    expect(await sniffFileContent(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03, 0x04]))).toBeNull();
  });

  it("does not take binary data for text, and rejects empty input", async () => {
    expect(await sniffFileContent(new Uint8Array())).toBeNull();
    expect(await sniffFileContent(Uint8Array.from([0x68, 0x69, 0x00, 0x21]))).toBeNull();
    expect(await sniffFileContent(Uint8Array.from([0xff, 0xfe, 0xfa, 0xfb]))).toBeNull();
    expect(isPlainText(Uint8Array.from([0xc3, 0x28]))).toBe(false);
    expect(isPlainText(text("ok"))).toBe(true);
  });

  it("requires the full structure, not only the first bytes", () => {
    expect(isPdf(text("%PDF-1.4"))).toBe(true);
    expect(isPdf(text("%PDF-x.y"))).toBe(false);
    expect(isPdf(text("%PDF"))).toBe(false);
    // The PNG signature alone, without the IHDR chunk, is not a PNG.
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBeNull();
    expect(sniffImageType(png)).toBe("image/png");
    // A RIFF file that is not WebP (for example WAVE audio).
    expect(sniffImageType(Uint8Array.from([...text("RIFF"), 0x1a, 0, 0, 0, ...text("WAVEfmt ")]))).toBeNull();
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });

  it("is not fooled by content that merely claims to be something else", async () => {
    // Script and HTML are only ever text; they are never recognised as an image or a document.
    expect(await sniffFileContent(text("<html><script>alert(1)</script></html>"))).toBe("text/plain");
    // A PDF header hidden behind other bytes does not count.
    expect(await sniffFileContent(Uint8Array.from([0x20, ...text("%PDF-1.7")]))).toBe("text/plain");
    expect(await sniffFileContent(Uint8Array.from([0x00, ...text("%PDF-1.7")]))).toBeNull();
  });
});

describe("declared types", () => {
  it("normalises a declared type and spots the ones a browser sends when it does not know the file", () => {
    expect(normalizeDeclaredMimeType("Text/Plain; charset=UTF-8")).toBe("text/plain");
    expect(normalizeDeclaredMimeType("  image/PNG ")).toBe("image/png");
    expect(normalizeDeclaredMimeType(undefined)).toBe("");
    expect(isUnspecifiedMimeType("")).toBe(true);
    expect(isUnspecifiedMimeType("application/octet-stream")).toBe(true);
    expect(isUnspecifiedMimeType("application/pdf")).toBe(false);
  });
});
