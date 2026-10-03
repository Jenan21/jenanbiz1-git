import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { localDocumentStorage } from "@/lib/storage/local-document-storage";
import { validateFileContent, validateFileName } from "./file-validation";
import { ownedOrganizationRecordWhere } from "@/lib/auth/organization-scope";

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
  projectId: string | null;
  marketListingId: string | null;
  marketVisibility: "PUBLIC" | "NDA_REQUIRED" | null;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string | null;
  createdAt: Date;
}) {
  return {
    id: asset.id,
    projectId: asset.projectId,
    marketListingId: asset.marketListingId,
    marketVisibility: asset.marketVisibility,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    checksum: asset.checksum,
    createdAt: asset.createdAt.toISOString(),
  };
}

function uploadedFileAccessWhere(userId: string) {
  return {
    uploadedById: userId,
    OR: [{ marketListingId: null }, { marketListing: ownedOrganizationRecordWhere(userId) }],
  };
}

export async function uploadUserFile(userId: string, file: File, projectId?: string, marketListingId?: string, marketVisibility: "PUBLIC" | "NDA_REQUIRED" = "NDA_REQUIRED") {
  if (!allowedMimeTypes.has(file.type))
    throw new FileAssetError("This file type is not supported");
  if (file.size <= 0 || file.size > maxFileBytes)
    throw new FileAssetError("The file must be between 1 byte and 10 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > maxFileBytes)
    throw new FileAssetError("The file must be between 1 byte and 10 MB");
  try {
    validateFileName(file.name);
    await validateFileContent(bytes, file.type);
  } catch {
    throw new FileAssetError("The file name or content does not match a supported format");
  }
  if (projectId) {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { createdById: userId },
          { members: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } },
        ],
      },
      select: { id: true },
    });
    if (!project) throw new FileAssetError("Project not found");
  }
  if (marketListingId) {
    const listing = await db.marketListing.findFirst({ where: { id: marketListingId, ...ownedOrganizationRecordWhere(userId) }, select: { id: true } });
    if (!listing) throw new FileAssetError("Market listing not found");
  }
  const storageKey = `users/${userId}/${randomUUID()}`;
  await localDocumentStorage.upload(storageKey, bytes, file.type);
  try {
    const asset = await db.fileAsset.create({
      data: {
        uploadedById: userId,
        projectId,
        marketListingId,
        marketVisibility: marketListingId ? marketVisibility : undefined,
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
        metadata: { mimeType: asset.mimeType, sizeBytes: file.size, projectId: projectId ?? null, marketListingId: marketListingId ?? null, marketVisibility: marketListingId ? marketVisibility : null },
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
    where: uploadedFileAccessWhere(userId),
    orderBy: { createdAt: "desc" },
  });
  return assets.map(serializeFileAsset);
}

async function findUserDownloadFile(userId: string, fileId: string) {
  return db.fileAsset.findFirst({
    where: {
      id: fileId,
      OR: [
        uploadedFileAccessWhere(userId),
        {
          project: {
            OR: [
              { createdById: userId },
              { members: { some: { userId } } },
            ],
          },
        },
        {
          marketListing: {
            OR: [
              ownedOrganizationRecordWhere(userId),
              { status: "PUBLISHED", files: { some: { id: fileId, marketVisibility: "PUBLIC" } } },
              { status: "PUBLISHED", requiresNda: false },
              { status: "PUBLISHED", ndaAcceptances: { some: { userId } } },
            ],
          },
        },
      ],
    },
  });
}

async function findUserManagedFile(userId: string, fileId: string) {
  return db.fileAsset.findFirst({
    where: {
      id: fileId,
      OR: [
        { uploadedById: userId, projectId: null, marketListingId: null },
        { project: { OR: [{ createdById: userId }, { members: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } }] } },
        { marketListing: ownedOrganizationRecordWhere(userId) },
      ],
    },
  });
}

export async function downloadUserFile(userId: string, fileId: string) {
  const asset = await findUserDownloadFile(userId, fileId);
  if (!asset) return null;
  try {
    return { asset, bytes: await localDocumentStorage.download(asset.storageKey) };
  } catch {
    throw new FileAssetError("The stored file is unavailable");
  }
}

export async function deleteUserFile(userId: string, fileId: string) {
  const asset = await findUserManagedFile(userId, fileId);
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