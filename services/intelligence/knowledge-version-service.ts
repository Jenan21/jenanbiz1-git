import { KnowledgeApprovalState, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const includeKnowledge = {
  approvedBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
  versions: { orderBy: { version: "desc" as const }, include: { evidenceLinks: { include: { evidence: true } }, reviews: { orderBy: { createdAt: "desc" as const } } } },
  reviews: { orderBy: { createdAt: "desc" as const } },
  evidenceLinks: { include: { evidence: true }, orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.SharedKnowledgeInclude;

export function diffKnowledgeText(previous: string, current: string) {
  const left = previous.split(/\r?\n/);
  const right = current.split(/\r?\n/);
  const size = Math.max(left.length, right.length);
  return Array.from({ length: size }, (_, index) => ({ line: index + 1, before: left[index] ?? null, after: right[index] ?? null, changed: left[index] !== right[index] })).filter((item) => item.changed);
}

export function getKnowledgeSnapshot(knowledgeId: string) {
  return db.sharedKnowledge.findUnique({ where: { id: knowledgeId }, include: includeKnowledge });
}

export async function createVersionedKnowledge(input: { confidence?: number; content: string; missionId?: string; references?: Prisma.InputJsonValue; source: string; sourcePublishedAt?: Date; sourceUrl?: string; title: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const knowledge = await transaction.sharedKnowledge.create({
      data: {
        confidence: input.confidence ?? 0,
        content: input.content,
        missionId: input.missionId,
        source: input.source,
        sourcePublishedAt: input.sourcePublishedAt,
        sourceUrl: input.sourceUrl,
        title: input.title,
        versions: { create: { authorId: actorId, confidence: input.confidence ?? 0, content: input.content, references: input.references, source: input.source, sourcePublishedAt: input.sourcePublishedAt, sourceUrl: input.sourceUrl, title: input.title, version: 1 } },
      },
      include: includeKnowledge,
    });
    await transaction.auditLog.create({ data: { actorId, action: "knowledge.created", entityType: "SharedKnowledge", entityId: knowledge.id, metadata: { version: 1 } } });
    return knowledge;
  });
}

export async function createKnowledgeVersion(input: { changeSummary: string; confidence: number; content: string; knowledgeId: string; references?: Prisma.InputJsonValue; source: string; sourcePublishedAt?: Date; sourceUrl?: string; title: string }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const current = await transaction.sharedKnowledge.findUnique({ where: { id: input.knowledgeId } });
    if (!current) throw new Error("Knowledge entry not found");
    const version = current.currentVersion + 1;
    await transaction.knowledgeVersion.create({ data: { authorId: actorId, changeSummary: input.changeSummary, confidence: input.confidence, content: input.content, knowledgeId: current.id, references: input.references, source: input.source, sourcePublishedAt: input.sourcePublishedAt, sourceUrl: input.sourceUrl, title: input.title, version } });
    const updated = await transaction.sharedKnowledge.update({ where: { id: current.id }, data: { approvalState: KnowledgeApprovalState.DRAFT, approvedAt: null, approvedById: null, confidence: input.confidence, content: input.content, currentVersion: version, source: input.source, sourcePublishedAt: input.sourcePublishedAt, sourceUrl: input.sourceUrl, title: input.title }, include: includeKnowledge });
    await transaction.auditLog.create({ data: { actorId, action: "knowledge.version.created", entityType: "SharedKnowledge", entityId: current.id, metadata: { changeSummary: input.changeSummary, version } } });
    return updated;
  });
}

export async function reviewKnowledgeVersion(input: { knowledgeId: string; notes: string; state: "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED" }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const knowledge = await transaction.sharedKnowledge.findUnique({ where: { id: input.knowledgeId } });
    if (!knowledge) throw new Error("Knowledge entry not found");
    const version = await transaction.knowledgeVersion.findUnique({ where: { knowledgeId_version: { knowledgeId: knowledge.id, version: knowledge.currentVersion } } });
    if (!version) throw new Error("Knowledge version not found");
    if (input.state === "APPROVED" && (!version.source || !version.sourcePublishedAt)) throw new Error("Source and source date are required before knowledge approval");
    await transaction.knowledgeReview.create({ data: { knowledgeId: knowledge.id, notes: input.notes, reviewerId: actorId, state: input.state, versionId: version.id } });
    await transaction.knowledgeVersion.update({ where: { id: version.id }, data: { approvalState: input.state } });
    const updated = await transaction.sharedKnowledge.update({ where: { id: knowledge.id }, data: { approvalState: input.state, approvedAt: input.state === "APPROVED" ? new Date() : null, approvedById: input.state === "APPROVED" ? actorId : null }, include: includeKnowledge });
    await transaction.auditLog.create({ data: { actorId, action: "knowledge.reviewed", entityType: "SharedKnowledge", entityId: knowledge.id, metadata: { state: input.state, version: version.version } } });
    return updated;
  });
}

export async function linkKnowledgeEvidence(input: { evidenceId: string; knowledgeId: string; note?: string; version?: number }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const knowledge = await transaction.sharedKnowledge.findUnique({ where: { id: input.knowledgeId } });
    if (!knowledge) throw new Error("Knowledge entry not found");
    const versionNumber = input.version ?? knowledge.currentVersion;
    const version = await transaction.knowledgeVersion.findUnique({ where: { knowledgeId_version: { knowledgeId: knowledge.id, version: versionNumber } } });
    if (!version) throw new Error("Knowledge version not found");
    const evidence = await transaction.evidence.findUnique({ where: { id: input.evidenceId } });
    if (!evidence) throw new Error("Evidence not found");
    const link = await transaction.knowledgeEvidenceLink.create({ data: { evidenceId: evidence.id, knowledgeId: knowledge.id, note: input.note, versionId: version.id } });
    await transaction.auditLog.create({ data: { actorId, action: "knowledge.evidence.linked", entityType: "SharedKnowledge", entityId: knowledge.id, metadata: { evidenceId: evidence.id, version: versionNumber } } });
    return link;
  });
}

export async function rollbackKnowledge(input: { knowledgeId: string; reason: string; targetVersion: number }, actorId: string) {
  return db.$transaction(async (transaction) => {
    const knowledge = await transaction.sharedKnowledge.findUnique({ where: { id: input.knowledgeId } });
    if (!knowledge) throw new Error("Knowledge entry not found");
    const target = await transaction.knowledgeVersion.findUnique({ where: { knowledgeId_version: { knowledgeId: knowledge.id, version: input.targetVersion } } });
    if (!target) throw new Error("Knowledge version not found");
    const version = knowledge.currentVersion + 1;
    await transaction.knowledgeVersion.create({ data: { authorId: actorId, changeSummary: input.reason, confidence: target.confidence, content: target.content, knowledgeId: knowledge.id, references: target.references ?? undefined, rollbackFrom: target.version, source: target.source, sourcePublishedAt: target.sourcePublishedAt, sourceUrl: target.sourceUrl, title: target.title, version } });
    const updated = await transaction.sharedKnowledge.update({ where: { id: knowledge.id }, data: { approvalState: KnowledgeApprovalState.DRAFT, approvedAt: null, approvedById: null, confidence: target.confidence, content: target.content, currentVersion: version, source: target.source, sourcePublishedAt: target.sourcePublishedAt, sourceUrl: target.sourceUrl, title: target.title }, include: includeKnowledge });
    await transaction.auditLog.create({ data: { actorId, action: "knowledge.rolled_back", entityType: "SharedKnowledge", entityId: knowledge.id, metadata: { newVersion: version, reason: input.reason, targetVersion: target.version } } });
    return updated;
  });
}

export async function compareKnowledgeVersions(knowledgeId: string, fromVersion: number, toVersion: number) {
  const versions = await db.knowledgeVersion.findMany({ where: { knowledgeId, version: { in: [fromVersion, toVersion] } } });
  const from = versions.find((item) => item.version === fromVersion);
  const to = versions.find((item) => item.version === toVersion);
  if (!from || !to) throw new Error("Knowledge version not found");
  return { fromVersion, toVersion, titleChanged: from.title !== to.title, sourceChanged: from.source !== to.source || from.sourceUrl !== to.sourceUrl, confidence: { before: from.confidence, after: to.confidence }, lines: diffKnowledgeText(from.content, to.content) };
}