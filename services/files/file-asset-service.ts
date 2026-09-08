import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { localDocumentStorage } from "@/lib/storage/local-document-storage";

const maxFileBytes = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export class FileAssetError extends Error {}

function serializeFileAsset(asset: {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string | null;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    checksum: asset.checksum,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function uploadUserFile(userId: string, file: File) {
  if (!allowedMimeTypes.has(file.type))
    throw new FileAssetError("This file type is not supported");
  if (file.size <= 0 || file.size > maxFileBytes)
    throw new FileAssetError("The file must be between 1 byte and 10 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const storageKey = `users/${userId}/${randomUUID()}`;
  await localDocumentStorage.upload(storageKey, bytes, file.type);
  try {
    const asset = await db.fileAsset.create({
      data: {
        uploadedById: userId,
        storageKey,
        fileName: file.name.slice(0, 255) || "upload",
        mimeType: file.type,
        sizeBytes: BigInt(file.size),
        checksum: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: "file.uploaded",
        entityType: "FileAsset",
        entityId: asset.id,
        metadata: { mimeType: asset.mimeType, sizeBytes: file.size },
      },
    });
    return serializeFileAsset(asset);
  } catch (error) {
    await localDocumentStorage.delete(storageKey);
    throw error;
  }
}

export async function listUserFiles(userId: string) {
  const assets = await db.fileAsset.findMany({
    where: { uploadedById: userId },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(serializeFileAsset);
}

async function findUserFile(userId: string, fileId: string) {
  return db.fileAsset.findFirst({ where: { id: fileId, uploadedById: userId } });
}

export async function downloadUserFile(userId: string, fileId: string) {
  const asset = await findUserFile(userId, fileId);
  if (!asset) return null;
  try {
    return { asset, bytes: await localDocumentStorage.download(asset.storageKey) };
  } catch {
    throw new FileAssetError("The stored file is unavailable");
  }
}

export async function deleteUserFile(userId: string, fileId: string) {
  const asset = await findUserFile(userId, fileId);
  if (!asset) return false;
  await db.fileAsset.delete({ where: { id: asset.id } });
  await localDocumentStorage.delete(asset.storageKey);
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: "file.deleted",
      entityType: "FileAsset",
      entityId: asset.id,
    },
  });
  return true;
}