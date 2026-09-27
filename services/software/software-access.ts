import { OrganizationMemberStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export async function requireSoftwareMembership(organizationId: string, userId: string, ownerOnly = false) {
  const membership = await db.organizationMember.findFirst({
    where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE, ...(ownerOnly ? { isOwner: true } : {}) },
    select: { id: true, isOwner: true, organizationId: true },
  });
  if (!membership) throw new Error(ownerOnly ? "Organization owner access required" : "Active organization membership required");
  return membership;
}

export async function listSoftwareOrganizations(userId: string) {
  return db.organizationMember.findMany({
    where: { userId, status: OrganizationMemberStatus.ACTIVE },
    select: { isOwner: true, organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSoftwareCompany(organizationId: string, userId: string) {
  const membership = await requireSoftwareMembership(organizationId, userId);
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    include: {
      businessPrograms: { orderBy: { createdAt: "asc" } },
      members: {
        include: { role: { select: { key: true, name: true } }, user: { include: { profile: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!organization) throw new Error("Organization not found");
  return { ...organization, currentUserIsOwner: membership.isOwner };
}