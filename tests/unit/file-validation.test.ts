import JSZip from "jszip";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  validateFileContent,
  validateFileName,
} from "@/services/files/file-validation";
import { uploadUserFile } from "@/services/files/file-asset-service";
import { db } from "@/lib/db";
import { localDocumentStorage } from "@/lib/storage/local-document-storage";

vi.mock("@/lib/db", () => ({ db: { fileAsset: { create: vi.fn() } } }));
vi.mock("@/lib/storage/local-document-storage", () => ({
  localDocumentStorage: { upload: vi.fn(), delete: vi.fn() },
}));

const docx =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const xlsx =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function officeFile(kind: "word" | "xl", macro = false) {
  const zip = new JSZip();
  zip.file(
    kind === "word" ? "word/document.xml" : "xl/workbook.xml",
    "<document/>",
  );
  zip.file(
    "[Content_Types].xml",
    `<Types><Override ContentType="${
      kind === "word"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
    }"/>${macro ? "macroEnabled" : ""}</Types>`,
  );
  return zip.generateAsync({ type: "uint8array" });
}

describe("uploaded file validation", () => {
  it.each([
    "../file.pdf",
    "dir\\file.pdf",
    "..",
    ".",
    "",
    "file\n.pdf",
    "file\u202e.pdf",
    "a".repeat(256),
  ])("rejects unsafe filename %j", (name) => {
    expect(() => validateFileName(name)).toThrow("Invalid file name");
  });
  it("preserves Arabic and ordinary filenames", () => {
    expect(() => validateFileName("تقرير مالي.pdf")).not.toThrow();
  });
  it("checks text encoding and binary content", async () => {
    await expect(
      validateFileContent(new TextEncoder().encode("نص آمن"), "text/plain"),
    ).resolves.toBeUndefined();
    await expect(
      validateFileContent(new Uint8Array([0xff]), "text/plain"),
    ).rejects.toThrow();
    await expect(
      validateFileContent(new Uint8Array([0]), "text/plain"),
    ).rejects.toThrow();
  });
  it("accepts valid PDF containers but not spoofed or truncated PDFs", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await expect(
      validateFileContent(await pdf.save(), "application/pdf"),
    ).resolves.toBeUndefined();
    await expect(
      validateFileContent(
        new TextEncoder().encode("<html>fake</html>"),
        "application/pdf",
      ),
    ).rejects.toThrow();
    await expect(
      validateFileContent(
        new TextEncoder().encode("%PDF-1.7"),
        "application/pdf",
      ),
    ).rejects.toThrow();
  });
  it("does not inflate attacker-controlled PDF object streams", async () => {
    const compressed = deflateSync(Buffer.from("a".repeat(2_000_000)));
    const body = Buffer.concat([
      Buffer.from(
        `%PDF-1.7\n1 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      ),
      compressed,
      Buffer.from("\nendstream\nendobj\n"),
    ]);
    const bytes = Buffer.concat([
      body,
      Buffer.from(
        `xref\n0 1\n0000000000 65535 f\ntrailer\n<< /Size 1 >>\nstartxref\n${body.length}\n%%EOF\n`,
      ),
    ]);
    const parser = vi.spyOn(PDFDocument, "load");
    try {
      await expect(
        validateFileContent(bytes, "application/pdf"),
      ).resolves.toBeUndefined();
      expect(parser).not.toHaveBeenCalled();
    } finally {
      parser.mockRestore();
    }
  });
  it.each([
    ["png", "image/png"],
    ["jpeg", "image/jpeg"],
    ["webp", "image/webp"],
  ] as const)(
    "accepts decoded %s images and rejects mismatched types",
    async (format, mime) => {
      const bytes = await sharp({
        create: { width: 2, height: 2, channels: 3, background: "#fff" },
      })
        .toFormat(format)
        .toBuffer();
      await expect(validateFileContent(bytes, mime)).resolves.toBeUndefined();
      await expect(
        validateFileContent(
          bytes,
          mime === "image/png" ? "image/jpeg" : "image/png",
        ),
      ).rejects.toThrow();
      await expect(
        validateFileContent(bytes.subarray(0, 12), mime),
      ).rejects.toThrow();
    },
  );
  it("distinguishes Office formats and rejects generic ZIPs and macros", async () => {
    await expect(
      validateFileContent(await officeFile("word"), docx),
    ).resolves.toBeUndefined();
    await expect(
      validateFileContent(await officeFile("xl"), xlsx),
    ).resolves.toBeUndefined();
    await expect(
      validateFileContent(await officeFile("word"), xlsx),
    ).rejects.toThrow();
    await expect(
      validateFileContent(await officeFile("word", true), docx),
    ).rejects.toThrow();
    await expect(
      validateFileContent(
        await new JSZip().generateAsync({ type: "uint8array" }),
        docx,
      ),
    ).rejects.toThrow();
  });
  it("bounds decompression of Office content type metadata", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<document/>");
    zip.file("[Content_Types].xml", "a".repeat(65 * 1024));
    await expect(
      validateFileContent(
        await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
        docx,
      ),
    ).rejects.toThrow();
  });
  it("rejects invalid uploads before storage or database writes", async () => {
    for (const file of [
      new File(["fake"], "fake.pdf", { type: "application/pdf" }),
      new File(["safe"], "../unsafe.txt", { type: "text/plain" }),
      new File([], "empty.txt", { type: "text/plain" }),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt", {
        type: "text/plain",
      }),
    ]) {
      await expect(uploadUserFile("owner", file)).rejects.toThrow();
    }
    expect(localDocumentStorage.upload).not.toHaveBeenCalled();
    expect(db.fileAsset.create).not.toHaveBeenCalled();
  });
  it("rejects dual-resource uploads before storage or database writes", async () => {
    await expect(uploadUserFile("owner", new File(["safe"], "safe.txt", { type: "text/plain" }), "project", "listing")).rejects.toThrow("only one resource");
    expect(localDocumentStorage.upload).not.toHaveBeenCalled();
    expect(db.fileAsset.create).not.toHaveBeenCalled();
  });
});
