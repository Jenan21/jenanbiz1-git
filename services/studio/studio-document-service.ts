import { Prisma, StudioDocumentKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const documentInclude = {
  versions: { orderBy: { version: "desc" as const }, take: 20 },
} satisfies Prisma.StudioDocumentInclude;

export type StudioDocumentInput = {
  content: Record<string, unknown>;
  kind: StudioDocumentKind;
  title: string;
};

function normalizeInput(input: StudioDocumentInput) {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 160) throw new Error("Document title is invalid");
  const serialized = JSON.stringify(input.content);
  if (serialized.length > 150_000) throw new Error("Document content is too large");
  return { content: input.content as Prisma.InputJsonValue, kind: input.kind, title };
}

export async function listStudioDocuments(userId: string, kind?: StudioDocumentKind) {
  return db.studioDocument.findMany({
    where: { ownerId: userId, kind },
    include: documentInclude,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function listStudioActivity(userId: string) {
  return db.auditLog.findMany({
    where: {
      actorId: userId,
      OR: [
        { entityType: "StudioDocument" },
        { action: { startsWith: "software.documents." } },
      ],
    },
    select: { id: true, action: true, entityId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getStudioDocument(documentId: string, userId: string) {
  return db.studioDocument.findFirst({
    where: { id: documentId, ownerId: userId },
    include: documentInclude,
  });
}

export async function createStudioDocument(input: StudioDocumentInput, userId: string) {
  const normalized = normalizeInput(input);
  return db.$transaction(async (transaction) => {
    const document = await transaction.studioDocument.create({
      data: {
        ...normalized,
        ownerId: userId,
        versions: { create: { content: normalized.content, title: normalized.title, version: 1 } },
      },
      include: documentInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "studio.document.created", entityType: "StudioDocument", entityId: document.id, metadata: { kind: document.kind, version: 1 } },
    });
    return document;
  });
}

export async function updateStudioDocument(documentId: string, input: StudioDocumentInput, userId: string) {
  const normalized = normalizeInput(input);
  return db.$transaction(async (transaction) => {
    const current = await transaction.studioDocument.findFirst({ where: { id: documentId, ownerId: userId } });
    if (!current) throw new Error("Studio document not found");
    if (current.kind !== normalized.kind) throw new Error("Document kind cannot be changed");
    const version = current.currentVersion + 1;
    const document = await transaction.studioDocument.update({
      where: { id: current.id },
      data: {
        content: normalized.content,
        currentVersion: version,
        title: normalized.title,
        versions: { create: { content: normalized.content, title: normalized.title, version } },
      },
      include: documentInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "studio.document.updated", entityType: "StudioDocument", entityId: document.id, metadata: { kind: document.kind, version } },
    });
    return document;
  });
}

export async function restoreStudioDocument(documentId: string, sourceVersion: number, userId: string) {
  return db.$transaction(async (transaction) => {
    const current = await transaction.studioDocument.findFirst({
      where: { id: documentId, ownerId: userId },
      include: { versions: { where: { version: sourceVersion }, take: 1 } },
    });
    const source = current?.versions[0];
    if (!current || !source) throw new Error("Studio document version not found");
    const version = current.currentVersion + 1;
    const content = source.content as Prisma.InputJsonValue;
    const document = await transaction.studioDocument.update({
      where: { id: current.id },
      data: {
        content,
        currentVersion: version,
        title: source.title,
        versions: { create: { content, title: source.title, version } },
      },
      include: documentInclude,
    });
    await transaction.auditLog.create({
      data: { actorId: userId, action: "studio.document.restored", entityType: "StudioDocument", entityId: document.id, metadata: { sourceVersion, version } },
    });
    return document;
  });
}