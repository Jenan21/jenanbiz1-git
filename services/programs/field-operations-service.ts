import {
  OrganizationMemberStatus,
  OrganizationProgramKey,
  OrganizationProgramStatus,
  Prisma,
  TaskStatus,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

async function requireFieldAccess(organizationId: string, userId: string) {
  const [membership, program] = await Promise.all([
    db.organizationMember.findFirst({ where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE }, select: { id: true, isOwner: true } }),
    db.organizationProgram.findUnique({ where: { organizationId_key: { organizationId, key: OrganizationProgramKey.FIELD_OPERATIONS } }, select: { status: true } }),
  ]);
  if (!membership) throw new Error("Active organization membership required");
  if (program?.status !== OrganizationProgramStatus.ACTIVE) throw new Error("Active field operations program required");
  return membership;
}

export async function listFieldAssignments(organizationId: string, userId: string) {
  await requireFieldAccess(organizationId, userId);
  return db.fieldAssignment.findMany({
    where: { organizationId },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: {
      assigneeMember: {
        select: {
          id: true,
          user: { select: { email: true, profile: { select: { displayName: true } } } },
        },
      },
    },
  });
}

export async function listFieldAssignees(organizationId: string, userId: string) {
  await requireFieldAccess(organizationId, userId);
  return db.organizationMember.findMany({
    where: { organizationId, status: OrganizationMemberStatus.ACTIVE },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    select: { id: true, user: { select: { email: true, profile: { select: { displayName: true } } } } },
  });
}

export async function createFieldAssignment(input: { organizationId: string; title: string; description?: string; dueAt?: Date; assigneeMemberId?: string; userId: string }) {
  const membership = await requireFieldAccess(input.organizationId, input.userId);
  if (!membership.isOwner) throw new Error("Organization owner access required");
  if (input.assigneeMemberId) {
    const assignee = await db.organizationMember.findFirst({
      where: { id: input.assigneeMemberId, organizationId: input.organizationId, status: OrganizationMemberStatus.ACTIVE },
      select: { id: true },
    });
    if (!assignee) throw new Error("Active assignee not found");
  }
  return db.$transaction(async (transaction) => {
    const assignment = await transaction.fieldAssignment.create({
      data: { organizationId: input.organizationId, title: input.title, description: input.description, dueAt: input.dueAt, assigneeMemberId: input.assigneeMemberId, createdById: input.userId, status: TaskStatus.ACTIVE },
    });
    await transaction.auditLog.create({
      data: { actorId: input.userId, organizationId: input.organizationId, action: "field.assignment.created", entityType: "FieldAssignment", entityId: assignment.id, metadata: { assigneeMemberId: input.assigneeMemberId, dueAt: input.dueAt?.toISOString() } as Prisma.InputJsonValue },
    });
    return assignment;
  });
}

export async function updateFieldAssignmentStatus(input: { organizationId: string; assignmentId: string; status: Extract<TaskStatus, "IN_PROGRESS" | "COMPLETED" | "CANCELLED">; userId: string }) {
  const membership = await requireFieldAccess(input.organizationId, input.userId);
  const assignment = await db.fieldAssignment.findFirst({ where: { id: input.assignmentId, organizationId: input.organizationId }, select: { id: true, assigneeMemberId: true } });
  if (!assignment) throw new Error("Field assignment not found");
  if (!membership.isOwner && assignment.assigneeMemberId !== membership.id) throw new Error("Assignment access required");
  return db.$transaction(async (transaction) => {
    const updated = await transaction.fieldAssignment.update({ where: { id: assignment.id }, data: { status: input.status } });
    await transaction.auditLog.create({ data: { actorId: input.userId, organizationId: input.organizationId, action: "field.assignment.status.updated", entityType: "FieldAssignment", entityId: updated.id, metadata: { status: input.status } as Prisma.InputJsonValue } });
    return updated;
  });
}