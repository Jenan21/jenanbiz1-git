import { AcademyResourceApprovalState, AcademyResourceKind, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export type AcademyReference = { title: string; url?: string; source?: string; publishedAt?: string };

export function academyResourceKindForRoute(route: string) {
  if (route.includes("/webinar")) return AcademyResourceKind.WEBINAR;
  if (route.includes("/study") || route.endsWith("/studies")) return AcademyResourceKind.STUDY;
  if (route.includes("/research")) return AcademyResourceKind.RESEARCH;
  if (route.includes("/path")) return AcademyResourceKind.LEARNING_PATH;
  if (route.includes("/certificate")) return AcademyResourceKind.CERTIFICATE;
  return AcademyResourceKind.COURSE;
}

const includeResource = {
  academy: { select: { id: true, name: true, slug: true } },
  course: { select: { id: true, code: true, title: true } },
  approvedBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
  versions: { orderBy: { version: "desc" as const }, take: 20 },
  attachments: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.AcademyResourceInclude;

export async function listAcademyResources(input: {
  approvalState?: AcademyResourceApprovalState;
  category?: string;
  kind?: AcademyResourceKind;
  query?: string;
}) {
  return db.academyResource.findMany({
    where: {
      approvalState: input.approvalState,
      category: input.category || undefined,
      kind: input.kind,
      OR: input.query ? [
        { title: { contains: input.query, mode: "insensitive" } },
        { summary: { contains: input.query, mode: "insensitive" } },
        { authorName: { contains: input.query, mode: "insensitive" } },
        { sourceName: { contains: input.query, mode: "insensitive" } },
      ] : undefined,
    },
    include: includeResource,
    orderBy: [{ approvedAt: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
}

export async function getApprovedAcademyResources(input: { category?: string; kind: AcademyResourceKind; query?: string }) {
  return listAcademyResources({ ...input, approvalState: AcademyResourceApprovalState.APPROVED });
}

export async function createAcademyResource(input: {
  academyId?: string;
  authorName?: string;
  category?: string;
  content: Prisma.InputJsonValue;
  courseId?: string;
  kind: AcademyResourceKind;
  language?: string;
  references?: AcademyReference[];
  slug: string;
  sourceName?: string;
  sourcePublishedAt?: Date;
  sourceUrl?: string;
  summary?: string;
  title: string;
}, actorId: string) {
  return db.$transaction(async (transaction) => {
    const resource = await transaction.academyResource.create({
      data: {
        academyId: input.academyId,
        authorName: input.authorName,
        category: input.category,
        courseId: input.courseId,
        createdById: actorId,
        kind: input.kind,
        language: input.language ?? "ar",
        slug: input.slug,
        sourceName: input.sourceName,
        sourcePublishedAt: input.sourcePublishedAt,
        sourceUrl: input.sourceUrl,
        summary: input.summary,
        title: input.title,
        versions: {
          create: {
            approvalState: AcademyResourceApprovalState.DRAFT,
            authorName: input.authorName,
            content: input.content,
            createdById: actorId,
            references: input.references as Prisma.InputJsonValue | undefined,
            sourceName: input.sourceName,
            sourcePublishedAt: input.sourcePublishedAt,
            sourceUrl: input.sourceUrl,
            summary: input.summary,
            title: input.title,
            version: 1,
          },
        },
      },
      include: includeResource,
    });
    await transaction.auditLog.create({ data: { actorId, action: "academy.resource.created", entityType: "AcademyResource", entityId: resource.id, metadata: { kind: input.kind, slug: input.slug } } });
    return resource;
  });
}

export async function createAcademyResourceVersion(input: {
  authorName?: string;
  changeSummary: string;
  content: Prisma.InputJsonValue;
  references?: AcademyReference[];
  resourceId: string;
  sourceName?: string;
  sourcePublishedAt?: Date;
  sourceUrl?: string;
  summary?: string;
  title: string;
}, actorId: string) {
  return db.$transaction(async (transaction) => {
    const current = await transaction.academyResource.findUnique({ where: { id: input.resourceId } });
    if (!current) throw new Error("Academy resource not found");
    const nextVersion = current.currentVersion + 1;
    await transaction.academyResourceVersion.create({
      data: {
        approvalState: AcademyResourceApprovalState.DRAFT,
        authorName: input.authorName,
        changeSummary: input.changeSummary,
        content: input.content,
        createdById: actorId,
        references: input.references as Prisma.InputJsonValue | undefined,
        resourceId: current.id,
        sourceName: input.sourceName,
        sourcePublishedAt: input.sourcePublishedAt,
        sourceUrl: input.sourceUrl,
        summary: input.summary,
        title: input.title,
        version: nextVersion,
      },
    });
    const resource = await transaction.academyResource.update({
      where: { id: current.id },
      data: {
        approvalState: AcademyResourceApprovalState.DRAFT,
        approvedAt: null,
        approvedById: null,
        authorName: input.authorName,
        currentVersion: nextVersion,
        sourceName: input.sourceName,
        sourcePublishedAt: input.sourcePublishedAt,
        sourceUrl: input.sourceUrl,
        summary: input.summary,
        title: input.title,
      },
      include: includeResource,
    });
    await transaction.auditLog.create({ data: { actorId, action: "academy.resource.version.created", entityType: "AcademyResource", entityId: current.id, metadata: { version: nextVersion, changeSummary: input.changeSummary } } });
    return resource;
  });
}

export async function reviewAcademyResource(resourceId: string, approvalState: "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED", actorId: string) {
  return db.$transaction(async (transaction) => {
    const resource = await transaction.academyResource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new Error("Academy resource not found");
    if (approvalState === "APPROVED" && (!resource.sourceName || !resource.sourcePublishedAt || !resource.authorName)) {
      throw new Error("Source name, source date, and author are required before approval");
    }
    const updated = await transaction.academyResource.update({
      where: { id: resource.id },
      data: { approvalState, approvedAt: approvalState === "APPROVED" ? new Date() : null, approvedById: approvalState === "APPROVED" ? actorId : null },
      include: includeResource,
    });
    await transaction.academyResourceVersion.updateMany({ where: { resourceId: resource.id, version: resource.currentVersion }, data: { approvalState } });
    await transaction.auditLog.create({ data: { actorId, action: "academy.resource.reviewed", entityType: "AcademyResource", entityId: resource.id, metadata: { approvalState, version: resource.currentVersion } } });
    return updated;
  });
}

export async function addAcademyResourceAttachment(input: {
  checksum?: string;
  externalUrl?: string;
  fileName?: string;
  mimeType?: string;
  resourceId: string;
  sizeBytes?: bigint;
  sourceName?: string;
  sourceUrl?: string;
  storageKey?: string;
  title: string;
  versionId?: string;
}, actorId: string) {
  if (!input.externalUrl && !input.storageKey) throw new Error("Attachment requires a storage key or external URL");
  return db.$transaction(async (transaction) => {
    const resource = await transaction.academyResource.findUnique({ where: { id: input.resourceId } });
    if (!resource) throw new Error("Academy resource not found");
    const attachment = await transaction.academyResourceAttachment.create({ data: input });
    await transaction.auditLog.create({ data: { actorId, action: "academy.resource.attachment.added", entityType: "AcademyResourceAttachment", entityId: attachment.id, metadata: { resourceId: resource.id } } });
    return attachment;
  });
}

export async function createAcademyExamQuestion(input: { examId: string; explanation?: string; options: Array<{ isCorrect: boolean; label: string }>; points?: number; prompt: string }, actorId: string) {
  if (input.options.length < 2 || input.options.filter((option) => option.isCorrect).length !== 1) throw new Error("An exam question requires at least two options and exactly one correct answer");
  return db.$transaction(async (transaction) => {
    const exam = await transaction.academyExam.findUnique({ where: { id: input.examId }, select: { id: true, version: true } });
    if (!exam) throw new Error("Academy exam not found");
    const sequence = (await transaction.academyExamQuestion.count({ where: { examId: exam.id } })) + 1;
    const question = await transaction.academyExamQuestion.create({
      data: {
        examId: exam.id,
        explanation: input.explanation?.trim() || undefined,
        points: input.points ?? 1,
        prompt: input.prompt.trim(),
        sequence,
        options: { create: input.options.map((option, index) => ({ isCorrect: option.isCorrect, label: option.label.trim(), sequence: index + 1 })) },
      },
      include: { options: { orderBy: { sequence: "asc" } } },
    });
    await transaction.auditLog.create({ data: { actorId, action: "academy.exam.question.created", entityType: "AcademyExamQuestion", entityId: question.id, metadata: { examId: exam.id, examVersion: exam.version, points: question.points, sequence } } });
    return question;
  });
}