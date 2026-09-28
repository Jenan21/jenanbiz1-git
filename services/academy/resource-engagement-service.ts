import { AcademyEngagementStatus, AcademyResourceApprovalState, AcademyResourceKind, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const allowedByKind: Record<AcademyResourceKind, readonly AcademyEngagementStatus[]> = {
  COURSE: [AcademyEngagementStatus.SAVED, AcademyEngagementStatus.IN_PROGRESS, AcademyEngagementStatus.COMPLETED],
  WEBINAR: [AcademyEngagementStatus.REGISTERED, AcademyEngagementStatus.IN_PROGRESS, AcademyEngagementStatus.COMPLETED],
  STUDY: [AcademyEngagementStatus.SAVED, AcademyEngagementStatus.IN_PROGRESS, AcademyEngagementStatus.COMPLETED],
  RESEARCH: [AcademyEngagementStatus.SAVED, AcademyEngagementStatus.IN_PROGRESS, AcademyEngagementStatus.COMPLETED],
  LEARNING_PATH: [AcademyEngagementStatus.SAVED, AcademyEngagementStatus.IN_PROGRESS, AcademyEngagementStatus.COMPLETED],
  CERTIFICATE: [AcademyEngagementStatus.SAVED],
};

export async function setAcademyResourceEngagement(input: { progressPercent?: number; resourceId: string; status: AcademyEngagementStatus; userId: string }) {
  const resource = await db.academyResource.findFirst({ where: { id: input.resourceId, approvalState: AcademyResourceApprovalState.APPROVED }, select: { id: true, kind: true } });
  if (!resource) throw new Error("Approved academy resource not found");
  if (!allowedByKind[resource.kind].includes(input.status)) throw new Error("Engagement status is not valid for this resource kind");
  const progressPercent = input.status === AcademyEngagementStatus.COMPLETED ? 100 : input.status === AcademyEngagementStatus.IN_PROGRESS ? Math.min(Math.max(input.progressPercent ?? 1, 1), 99) : 0;

  return db.$transaction(async (transaction) => {
    const current = await transaction.academyResourceEngagement.findUnique({ where: { userId_resourceId: { userId: input.userId, resourceId: resource.id } } });
    if (current?.status === AcademyEngagementStatus.COMPLETED && input.status !== AcademyEngagementStatus.COMPLETED) throw new Error("Completed academy engagement cannot be reopened");
    const engagement = await transaction.academyResourceEngagement.upsert({
      where: { userId_resourceId: { userId: input.userId, resourceId: resource.id } },
      create: { userId: input.userId, resourceId: resource.id, status: input.status, progressPercent, startedAt: input.status === AcademyEngagementStatus.IN_PROGRESS || input.status === AcademyEngagementStatus.COMPLETED ? new Date() : undefined, completedAt: input.status === AcademyEngagementStatus.COMPLETED ? new Date() : undefined },
      update: { status: input.status, progressPercent, startedAt: current?.startedAt ?? (input.status === AcademyEngagementStatus.IN_PROGRESS || input.status === AcademyEngagementStatus.COMPLETED ? new Date() : undefined), completedAt: input.status === AcademyEngagementStatus.COMPLETED ? new Date() : null },
    });
    await transaction.auditLog.create({ data: { actorId: input.userId, action: "academy.resource.engagement.updated", entityType: "AcademyResourceEngagement", entityId: engagement.id, metadata: { progressPercent, resourceId: resource.id, resourceKind: resource.kind, status: input.status } as Prisma.InputJsonValue } });
    return engagement;
  });
}

export async function listAcademyResourceEngagements(userId: string, resourceIds?: string[]) {
  return db.academyResourceEngagement.findMany({
    where: { userId, resourceId: resourceIds?.length ? { in: resourceIds } : undefined },
    select: { id: true, resourceId: true, status: true, progressPercent: true, startedAt: true, completedAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}