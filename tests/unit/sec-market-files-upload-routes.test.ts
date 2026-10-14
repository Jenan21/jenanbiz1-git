import { Document, Packer, Paragraph } from "docx";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { setRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const mocks = vi.hoisted(() => ({
  auditLogCreate: vi.fn(),
  deleteUserFile: vi.fn(),
  downloadUserFile: vi.fn(),
  extractPaletteFromBase64: vi.fn(),
  getCurrentUser: vi.fn(),
  listUserFiles: vi.fn(),
  uploadUserFile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ db: { auditLog: { create: mocks.auditLogCreate } } }));
vi.mock("@/services/visual-dna/visual-dna.service", () => ({ extractPaletteFromBase64: mocks.extractPaletteFromBase64 }));
vi.mock("@/services/files/file-asset-service", () => {
  class FileAssetError extends Error {}
  return {
    FILE_LIMITS: { maxBytesPerUser: 500 * 1024 * 1024, maxFileBytes: 10 * 1024 * 1024, maxFilesPerUser: 200 },
    FileAssetError,
    deleteUserFile: mocks.deleteUserFile,
    downloadUserFile: mocks.downloadUserFile,
    listUserFiles: mocks.listUserFiles,
    uploadUserFile: mocks.uploadUserFile,
  };
});

import { GET as downloadGet } from "@/app/api/files/[fileId]/route";
import { POST as filesPost } from "@/app/api/files/route";
import { POST as designPost } from "@/app/api/software/design/route";
import { POST as documentsPost } from "@/app/api/software/documents/route";
import { FileAssetError } from "@/services/files/file-asset-service";

const origin = "http://localhost";
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));

function formRequest(path: string, fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new NextRequest(`${origin}${path}`, { body: form, headers: { origin, ...headers }, method: "POST" });
}

const documentRequest = (fields: Record<string, string | Blob>) => formRequest("/api/software/documents", fields);
const pdfFile = (bytes: Uint8Array, name = "input.pdf") => new File([bytes as BlobPart], name, { type: "application/pdf" });

async function blankPdf(pageCount: number) {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) document.addPage([595, 842]);
  return document.save();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  setRateLimitProvider(new MemoryRateLimitProvider());
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1", systemRole: "USER" });
});

describe("document tools route", () => {
  it("budgets requests per user before it reads anything", async () => {
    const unknown = () => documentRequest({ action: "nothing", files: new File(["x"], "x.txt", { type: "text/plain" }) });
    for (let index = 0; index < 20; index += 1) expect((await documentsPost(unknown())).status).toBe(400);
    const blocked = await documentsPost(unknown());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    mocks.getCurrentUser.mockResolvedValue({ id: "user-2", systemRole: "USER" });
    expect((await documentsPost(unknown())).status).toBe(400);
  });

  it("turns away a request that announces a body larger than any valid one, and oversized form fields", async () => {
    const large = formRequest("/api/software/documents", { action: "mergePdf", files: pdfFile(await blankPdf(1)) }, { "content-length": String(200 * 1024 * 1024) });
    expect((await documentsPost(large)).status).toBe(413);
    const longField = documentRequest({ action: "splitPdf", files: pdfFile(await blankPdf(1)), ranges: "1,".repeat(6_000) });
    expect((await documentsPost(longField)).status).toBe(400);
  });

  it("says why a PDF over the page limit was refused", async () => {
    const response = await documentsPost(documentRequest({ action: "numberPdfPages", files: pdfFile(await blankPdf(501)) }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toBe("The PDF has 501 pages; the limit is 500.");
  });

  it("says why a malformed Office archive was refused and never shows a parser's own words", async () => {
    const notAnArchive = new File([Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])], "broken.docx");
    const refused = await documentsPost(documentRequest({ action: "analyzeDocx", files: notAnArchive }));
    expect(refused.status).toBe(422);
    expect((await refused.json()).message).toBe("The file is not a valid Office document archive.");

    const garbage = new Uint8Array([...new TextEncoder().encode("%PDF-1.7\n"), 0, 1, 2, 3, 4, 5]);
    const failed = await documentsPost(documentRequest({ action: "numberPdfPages", files: pdfFile(garbage) }));
    expect(failed.status).toBe(422);
    const body = await failed.json();
    expect(body.message).toMatch(/^The document could not be processed \(ref [0-9a-f]{8}\)$/);
  });

  it("still converts an ordinary file", async () => {
    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Verified software conversion")] }] }));
    const response = await documentsPost(documentRequest({ action: "docxToPdf", files: new File([docx as BlobPart], "verified.docx") }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.auditLogCreate).toHaveBeenCalledTimes(1);
  });
});

describe("design palette route", () => {
  it("reads the type from the bytes, refuses a disagreeing declaration, and budgets requests", async () => {
    mocks.extractPaletteFromBase64.mockResolvedValue(["#112233"]);
    const designRequest = (type: string, bytes: Uint8Array = png) => formRequest("/api/software/design", { image: new File([bytes as BlobPart], "logo.png", { type }) });

    expect((await designPost(designRequest("image/jpeg"))).status).toBe(400);
    expect((await designPost(designRequest("image/png", new TextEncoder().encode("not an image at all")))).status).toBe(400);
    expect(mocks.extractPaletteFromBase64).not.toHaveBeenCalled();

    const ok = await designPost(designRequest("image/png"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ palette: ["#112233"], success: true });
    expect(mocks.extractPaletteFromBase64).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
    expect(mocks.auditLogCreate.mock.calls[0][0].data.metadata.mimeType).toBe("image/png");

    for (let index = 0; index < 17; index += 1) await designPost(designRequest("image/png"));
    expect((await designPost(designRequest("image/png"))).status).toBe(429);
  });

  it("answers a failed extraction with a reference", async () => {
    mocks.extractPaletteFromBase64.mockRejectedValueOnce(new TypeError("Input buffer contains unsupported image format at /srv/app/node_modules/sharp/lib/x.js:10:3"));
    const response = await designPost(formRequest("/api/software/design", { image: new File([png as BlobPart], "logo.png", { type: "image/png" }) }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toMatch(/^The palette could not be extracted \(ref [0-9a-f]{8}\)$/);
  });
});

describe("file upload and download routes", () => {
  const upload = () => formRequest("/api/files", { file: new File(["Protected market evidence"], "evidence.txt", { type: "text/plain" }) });

  it("budgets uploads per user", async () => {
    mocks.uploadUserFile.mockResolvedValue({ id: "file-1" });
    for (let index = 0; index < 20; index += 1) expect((await filesPost(upload())).status).toBe(201);
    expect((await filesPost(upload())).status).toBe(429);
    expect(mocks.uploadUserFile).toHaveBeenCalledTimes(20);
  });

  it("shows the reason a file was refused, but never a database error", async () => {
    mocks.uploadUserFile.mockRejectedValueOnce(new FileAssetError("The file content does not match its declared type"));
    const mismatch = await filesPost(upload());
    expect(mismatch.status).toBe(422);
    expect((await mismatch.json()).message).toBe("The file content does not match its declared type");

    mocks.uploadUserFile.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Invalid `prisma.fileAsset.create()` invocation", { clientVersion: "7.9.1", code: "P2002" }));
    const failed = await filesPost(upload());
    expect(failed.status).toBe(422);
    const body = await failed.json();
    expect(body.message).toMatch(/^The file could not be stored \(ref [0-9a-f]{8}\)$/);
    expect(JSON.stringify(body)).not.toMatch(/prisma|invocation/i);
  });

  it("turns away an upload that announces a body larger than one file can be", async () => {
    const large = formRequest("/api/files", { file: new File(["x"], "x.txt", { type: "text/plain" }) }, { "content-length": String(50 * 1024 * 1024) });
    expect((await filesPost(large)).status).toBe(413);
    expect(mocks.uploadUserFile).not.toHaveBeenCalled();
  });

  it("serves downloads as attachments under the content-derived type, even for a non-Latin file name", async () => {
    mocks.downloadUserFile.mockResolvedValue({ asset: { fileName: "عقد \"البيع\".pdf" }, bytes: new Uint8Array([1, 2, 3]), contentType: "application/pdf" });
    const response = await downloadGet(new NextRequest(`${origin}/api/files/file-1`), { params: Promise.resolve({ fileId: "file-1" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe("عقد _البيع_.pdf");
    expect(disposition).not.toContain('"البيع"');
  });

  it("serves a file whose bytes do not match its stored type as an opaque download", async () => {
    mocks.downloadUserFile.mockResolvedValue({ asset: { fileName: "claimed.pdf" }, bytes: new Uint8Array([1, 2, 3]), contentType: "application/octet-stream" });
    const response = await downloadGet(new NextRequest(`${origin}/api/files/file-2`), { params: Promise.resolve({ fileId: "file-2" }) });
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment/);
  });
});
