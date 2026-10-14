import { createHash, randomUUID } from "node:crypto";
import { db, type DbExecutor } from "@/lib/db";
import { documentStorage } from "@/lib/storage/document-storage";
import { DOCX_MIME_TYPE, isUnspecifiedMimeType, normalizeDeclaredMimeType, sniffFileContent, XLSX_MIME_TYPE } from "@/services/files/content-sniffing";

export const FILE_LIMITS = {
  /** Largest single file. */
  maxFileBytes: 10 * 1024 * 1024,
  /** Most files one user may keep stored at a time. */
  maxFilesPerUser: 200,
  /** Most bytes one user may keep stored at a time. */
  maxBytesPerUser: 500 * 1024 * 1024,
} as const;
const allowedMimeTypes = new Set<string>([
  "application/pdf",
  DOCX_MIME_TYPE,
  XLSX_MIME_TYPE,
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);
// Content that browsers cannot classify is served as an opaque download rather than under a trusted type.
const OPAQUE_MIME_TYPE = "application/octet-stream";

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

async function assertWithinQuota(executor: DbExecutor, userId: string, incomingBytes: number) {
  const usage = await executor.fileAsset.aggregate({
    where: { uploadedById: userId },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  });
  if (usage._count._all >= FILE_LIMITS.maxFilesPerUser)
    throw new FileAssetError(`You can store at most ${FILE_LIMITS.maxFilesPerUser} files; delete files you no longer need first`);
  if ((usage._sum.sizeBytes ?? BigInt(0)) + BigInt(incomingBytes) > BigInt(FILE_LIMITS.maxBytesPerUser))
    throw new FileAssetError(`Your storage limit of ${FILE_LIMITS.maxBytesPerUser / (1024 * 1024)} MB would be exceeded; delete files you no longer need first`);
}

export async function uploadUserFile(userId: string, file: File, projectId?: string, marketListingId?: string, marketVisibility: "PUBLIC" | "NDA_REQUIRED" = "NDA_REQUIRED") {
  const declaredType = normalizeDeclaredMimeType(file.type);
  if (!isUnspecifiedMimeType(declaredType) && !allowedMimeTypes.has(declaredType))
    throw new FileAssetError("This file type is not supported");
  if (file.size <= 0 || file.size > FILE_LIMITS.maxFileBytes)
    throw new FileAssetError("The file must be between 1 byte and 10 MB");
  await assertWithinQuota(db, userId, file.size);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > FILE_LIMITS.maxFileBytes)
    throw new FileAssetError("The file must be between 1 byte and 10 MB");
  // The stored type comes from the bytes themselves; a declared type that disagrees with them is refused.
  const contentType = await sniffFileContent(bytes);
  if (!contentType || !allowedMimeTypes.has(contentType))
    throw new FileAssetError("The file content is not a supported document, image, or text file");
  if (!isUnspecifiedMimeType(declaredType) && declaredType !== contentType)
    throw new FileAssetError("The file content does not match its declared type");

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
    const listing = await db.marketListing.findFirst({ where: { id: marketListingId, createdById: userId }, select: { id: true } });
    if (!listing) throw new FileAssetError("Market listing not found");
  }
  const storageKey = `users/${userId}/${randomUUID()}`;
  await documentStorage.upload(storageKey, bytes, contentType);
  try {
    const asset = await db.$transaction(async (transaction) => {
      // One upload at a time per user, so two concurrent uploads cannot both pass the quota check.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`file-quota:${userId}`}))`;
      await assertWithinQuota(transaction, userId, bytes.byteLength);
      const created = await transaction.fileAsset.create({
        data: {
          uploadedById: userId,
          projectId,
          marketListingId,
          marketVisibility: marketListingId ? marketVisibility : undefined,
          storageKey,
          fileName: file.name.slice(0, 255) || "upload",
          mimeType: contentType,
          sizeBytes: BigInt(bytes.byteLength),
          checksum: createHash("sha256").update(bytes).digest("hex"),
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: userId,
          action: "file.uploaded",
          entityType: "FileAsset",
          entityId: created.id,
          metadata: { mimeType: created.mimeType, sizeBytes: bytes.byteLength, projectId: projectId ?? null, marketListingId: marketListingId ?? null, marketVisibility: marketListingId ? marketVisibility : null },
        },
      });
      return created;
    });
    return serializeFileAsset(asset);
  } catch (error) {
    await documentStorage.delete(storageKey);
    throw error;
  }
}

export async function listUserFiles(userId: string) {
  const assets = await db.fileAsset.findMany({
    where: { uploadedById: userId },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return assets.map(serializeFileAsset);
}

async function findUserDownloadFile(userId: string, fileId: string) {
  return db.fileAsset.findFirst({
    where: {
      id: fileId,
      OR: [
        { uploadedById: userId },
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
              { createdById: userId },
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
        { uploadedById: userId },
        { project: { OR: [{ createdById: userId }, { members: { some: { userId, role: { in: ["OWNER", "EDITOR"] } } } }] } },
        { marketListing: { createdById: userId } },
      ],
    },
  });
}

export async function downloadUserFile(userId: string, fileId: string) {
  const asset = await findUserDownloadFile(userId, fileId);
  if (!asset) return null;
  let bytes: Uint8Array;
  try {
    bytes = await documentStorage.download(asset.storageKey);
  } catch {
    throw new FileAssetError("The stored file is unavailable");
  }
  // A file stored before content checks existed may carry a type its bytes do not match; serve it as an opaque download.
  const contentType = (await sniffFileContent(bytes)) === asset.mimeType ? asset.mimeType : OPAQUE_MIME_TYPE;
  return { asset, bytes, contentType };
}

export async function deleteUserFile(userId: string, fileId: string) {
  const asset = await findUserManagedFile(userId, fileId);
  if (!asset) return false;
  await db.fileAsset.delete({ where: { id: asset.id } });
  await documentStorage.delete(asset.storageKey);
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