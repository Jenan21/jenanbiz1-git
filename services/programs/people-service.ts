import {
  OrganizationMemberStatus,
  OrganizationProgramKey,
  OrganizationProgramStatus,
  Prisma,
} from "@/generated/prisma/client";
import { db } from "@/lib/db";

async function requirePeopleOwner(organizationId: string, userId: string) {
  const [membership, program] = await Promise.all([
    db.organizationMember.findFirst({
      where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE, isOwner: true },
      select: { id: true },
    }),
    db.organizationProgram.findUnique({
      where: { organizationId_key: { organizationId, key: OrganizationProgramKey.PEOPLE } },
      select: { status: true },
    }),
  ]);
  if (!membership) throw new Error("Organization owner access required");
  if (program?.status !== OrganizationProgramStatus.ACTIVE) throw new Error("Active people program required");
}

export async function listOrganizationMembers(organizationId: string, userId: string) {
  await requirePeopleOwner(organizationId, userId);
  return db.organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      status: true,
      isOwner: true,
      joinedAt: true,
      user: { select: { email: true, profile: { select: { displayName: true } } } },
    },
  });
}

export async function inviteOrganizationMember(input: {
  organizationId: string;
  email: string;
  userId: string;
}) {
  await requirePeopleOwner(input.organizationId, input.userId);
  const invitee = await db.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true },
  });
  if (!invitee) throw new Error("Registered user not found");
  if (invitee.id === input.userId) throw new Error("Owner is already a member");
  const membership = await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: invitee.id } },
    create: { organizationId: input.organizationId, userId: invitee.id, status: OrganizationMemberStatus.INVITED },
    update: { status: OrganizationMemberStatus.INVITED, joinedAt: null },
  });
  await db.auditLog.create({
    data: {
      actorId: input.userId,
      organizationId: input.organizationId,
      action: "organization.member.invited",
      entityType: "OrganizationMember",
      entityId: membership.id,
      metadata: { email: input.email.toLowerCase() } as Prisma.InputJsonValue,
    },
  });
  return membership;
}

export async function acceptOrganizationInvitation(membershipId: string, userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { id: membershipId, userId, status: OrganizationMemberStatus.INVITED },
    select: { id: true, organizationId: true },
  });
  if (!membership) throw new Error("Organization invitation not found");
  return db.$transaction(async (transaction) => {
    const accepted = await transaction.organizationMember.update({
      where: { id: membership.id },
      data: { status: OrganizationMemberStatus.ACTIVE, joinedAt: new Date() },
    });
    await transaction.auditLog.create({
      data: {
        actorId: userId,
        organizationId: membership.organizationId,
        action: "organization.member.invitation.accepted",
        entityType: "OrganizationMember",
        entityId: membership.id,
      },
    });
    return accepted;
  });
}

export async function listPendingOrganizationInvitations(userId: string) {
  return db.organizationMember.findMany({
    where: { userId, status: OrganizationMemberStatus.INVITED },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      organization: { select: { id: true, name: true } },
    },
  });
}