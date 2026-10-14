import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { documentStorage } from "@/lib/storage/document-storage";
import { deleteUserFile, downloadUserFile, FILE_LIMITS, FileAssetError, listUserFiles, uploadUserFile } from "@/services/files/file-asset-service";

const suffix = crypto.randomUUID().slice(0, 8);
const userIds: string[] = [];
let userCounter = 0;

const text = (value: string) => new TextEncoder().encode(value);
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

async function createUser() {
  userCounter += 1;
  const user = await db.user.create({ data: { email: `sec-files-${userCounter}-${suffix}@example.test`, status: "ACTIVE" } });
  userIds.push(user.id);
  return user;
}

async function filesOf(userId: string) {
  return db.fileAsset.count({ where: { uploadedById: userId } });
}

/** Rows that count toward a user's quota without needing real stored objects. */
async function fillQuota(userId: string, count: number, sizeBytes = BigInt(1)) {
  await db.fileAsset.createMany({
    data: Array.from({ length: count }, (_, index) => ({ fileName: `filler-${index}.txt`, mimeType: "text/plain", sizeBytes, storageKey: `users/${userId}/filler-${suffix}-${index}`, uploadedById: userId })),
  });
}

afterAll(async () => {
  if (userIds.length) {
    const assets = await db.fileAsset.findMany({ where: { uploadedById: { in: userIds } }, select: { storageKey: true } });
    for (const asset of assets) await documentStorage.delete(asset.storageKey);
    await db.fileAsset.deleteMany({ where: { uploadedById: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await db.$disconnect();
});

describe("uploads are typed by their content", () => {
  it("stores the type of the bytes, whatever the browser declared", async () => {
    const user = await createUser();
    const declared = [
      [png, "logo.png", "image/png", "image/png"],
      [png, "logo-unknown.png", "", "image/png"],
      [png, "logo-generic.bin", "application/octet-stream", "image/png"],
      [text("Verified evidence\nsecond line"), "evidence.txt", "text/plain; charset=utf-8", "text/plain"],
      [text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF"), "contract.pdf", "application/pdf", "application/pdf"],
    ] as const;
    for (const [bytes, name, type, expected] of declared) {
      const stored = await uploadUserFile(user.id, file(bytes, name, type));
      expect(stored.mimeType, name).toBe(expected);
    }
    expect((await listUserFiles(user.id)).map((item) => item.mimeType).sort()).toEqual(["application/pdf", "image/png", "image/png", "image/png", "text/plain"]);
  });

  it("accepts an Office document whose structure matches its declared type", async () => {
    const user = await createUser();
    const archive = new JSZip();
    archive.file("[Content_Types].xml", "<Types/>");
    archive.file("word/document.xml", "<w:document/>");
    const docx = await archive.generateAsync({ type: "uint8array" });
    const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    expect((await uploadUserFile(user.id, file(docx, "memo.docx", docxType))).mimeType).toBe(docxType);
    // The same bytes presented as a spreadsheet are refused.
    await expect(uploadUserFile(user.id, file(docx, "memo.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))).rejects.toThrow("does not match its declared type");
  });

  it("refuses a file whose content disagrees with its declared type, and stores nothing", async () => {
    const user = await createUser();
    const refusals: Array<[Uint8Array, string, string, string]> = [
      [png, "fake.pdf", "application/pdf", "does not match its declared type"],
      [text("just some text"), "fake.png", "image/png", "does not match its declared type"],
      [text("<script>alert(1)</script>"), "fake.jpg", "image/jpeg", "does not match its declared type"],
      [Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0xff]), "blob.pdf", "application/pdf", "not a supported document"],
      [Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]), "broken.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "not a supported document"],
      [text("MZ executable"), "tool.exe", "application/x-msdownload", "not supported"],
      [text("a,b\n1,2"), "table.csv", "text/csv", "not supported"],
    ];
    for (const [bytes, name, type, reason] of refusals) {
      await expect(uploadUserFile(user.id, file(bytes, name, type)), name).rejects.toThrow(reason);
    }
    await expect(uploadUserFile(user.id, file(new Uint8Array(), "empty.txt", "text/plain"))).rejects.toThrow("between 1 byte and 10 MB");
    expect(await filesOf(user.id)).toBe(0);
  });

  it("refuses a market file whose bytes are not what it claims, so nobody downloads it under a trusted type", async () => {
    const owner = await createUser();
    const listing = await db.marketListing.create({ data: { createdById: owner.id, kind: "BUSINESS", slug: `sec-files-${suffix}`, summary: "Listing used to attach files in a security test.", title: "Security test listing" } });
    try {
      await expect(uploadUserFile(owner.id, file(text("not a pdf"), "brochure.pdf", "application/pdf"), undefined, listing.id, "PUBLIC")).rejects.toBeInstanceOf(FileAssetError);
      const accepted = await uploadUserFile(owner.id, file(png, "photo.png", "image/png"), undefined, listing.id, "PUBLIC");
      expect(accepted).toMatchObject({ marketListingId: listing.id, marketVisibility: "PUBLIC", mimeType: "image/png" });
    } finally {
      const rows = await db.fileAsset.findMany({ where: { marketListingId: listing.id }, select: { storageKey: true } });
      for (const row of rows) await documentStorage.delete(row.storageKey);
      await db.fileAsset.deleteMany({ where: { marketListingId: listing.id } });
      await db.marketListing.delete({ where: { id: listing.id } });
    }
  });
});

describe("downloads are served under a type the bytes agree with", () => {
  it("serves an honest file under its type and a mismatched legacy file as an opaque download", async () => {
    const user = await createUser();
    const stored = await uploadUserFile(user.id, file(png, "logo.png", "image/png"));
    const honest = await downloadUserFile(user.id, stored.id);
    expect(honest?.contentType).toBe("image/png");
    expect(Buffer.from(honest!.bytes).equals(Buffer.from(png))).toBe(true);

    // A row written before content checks existed: stored as a PDF, but the bytes are text.
    const legacyKey = `users/${user.id}/legacy-${suffix}`;
    await documentStorage.upload(legacyKey, text("<html><script>alert(document.domain)</script></html>"), "application/pdf");
    const legacy = await db.fileAsset.create({ data: { fileName: "legacy.pdf", mimeType: "application/pdf", sizeBytes: BigInt(52), storageKey: legacyKey, uploadedById: user.id } });
    const served = await downloadUserFile(user.id, legacy.id);
    expect(served?.contentType).toBe("application/octet-stream");

    expect(await downloadUserFile((await createUser()).id, stored.id)).toBeNull();
    expect(await deleteUserFile(user.id, stored.id)).toBe(true);
  });
});

describe("storage quota per user", () => {
  it("stops uploading at the file-count limit and frees room when a file is deleted", async () => {
    const user = await createUser();
    await fillQuota(user.id, FILE_LIMITS.maxFilesPerUser - 1);
    const last = await uploadUserFile(user.id, file(text("the last one"), "last.txt", "text/plain"));
    await expect(uploadUserFile(user.id, file(text("one too many"), "extra.txt", "text/plain"))).rejects.toThrow(`at most ${FILE_LIMITS.maxFilesPerUser} files`);
    expect(await filesOf(user.id)).toBe(FILE_LIMITS.maxFilesPerUser);

    expect(await deleteUserFile(user.id, last.id)).toBe(true);
    await expect(uploadUserFile(user.id, file(text("fits again"), "again.txt", "text/plain"))).resolves.toMatchObject({ mimeType: "text/plain" });
  });

  it("stops uploading at the byte limit, counting the file being added", async () => {
    const user = await createUser();
    await fillQuota(user.id, 1, BigInt(FILE_LIMITS.maxBytesPerUser - 10));
    await expect(uploadUserFile(user.id, file(text("this is more than ten bytes long"), "big.txt", "text/plain"))).rejects.toThrow("storage limit");
    await expect(uploadUserFile(user.id, file(text("0123456789"), "exact.txt", "text/plain"))).resolves.toMatchObject({ sizeBytes: "10" });
    await expect(uploadUserFile(user.id, file(text("x"), "over.txt", "text/plain"))).rejects.toThrow("storage limit");
  });

  it("lets only one of several simultaneous uploads take the last slot, and leaves no orphan behind", async () => {
    const user = await createUser();
    await fillQuota(user.id, FILE_LIMITS.maxFilesPerUser - 1);
    const results = await Promise.allSettled(["a", "b", "c", "d"].map((name) => uploadUserFile(user.id, file(text(`upload ${name}`), `${name}.txt`, "text/plain"))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toBeInstanceOf(FileAssetError);
    expect(await filesOf(user.id)).toBe(FILE_LIMITS.maxFilesPerUser);
    const stored = await db.fileAsset.findMany({ where: { uploadedById: user.id, NOT: { storageKey: { contains: "filler-" } } }, select: { storageKey: true } });
    expect(stored).toHaveLength(1);
  });
});
