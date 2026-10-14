import { OrganizationMemberStatus } from "@/generated/prisma/client";
import { memberHasPermission, memberUserView } from "@/lib/auth/authorization";
import { db } from "@/lib/db";

export async function requireSoftwareMembership(organizationId: string, userId: string, ownerOnly = false) {
  const membership = await db.organizationMember.findFirst({
    where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE, ...(ownerOnly ? { isOwner: true } : {}) },
    select: { id: true, isOwner: true, organizationId: true },
  });
  if (!membership) throw new Error(ownerOnly ? "Organization owner access required" : "Active organization membership required");
  return membership;
}

/** An ACTIVE member who is the owner or whose role carries the permission; everyone else, including invited members, is refused. */
export async function requireOrganizationPermission(organizationId: string, userId: string, permissionKey: string) {
  const membership = await db.organizationMember.findFirst({
    where: { organizationId, userId, status: OrganizationMemberStatus.ACTIVE },
    select: {
      id: true,
      isOwner: true,
      organizationId: true,
      status: true,
      role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });
  if (!membership) throw new Error("Active organization membership required");
  if (!memberHasPermission(membership, permissionKey)) throw new Error(`Organization permission required: ${permissionKey}`);
  return membership;
}

export async function listSoftwareOrganizations(userId: string) {
  return db.organizationMember.findMany({
    where: { userId, status: OrganizationMemberStatus.ACTIVE },
    select: {
      isOwner: true,
      organization: {
        select: {
          id: true,
          name: true,
          description: true,
          industry: true,
          website: true,
          countryCode: true,
          city: true,
          employeeRange: true,
          hiringSettings: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSoftwareCompany(organizationId: string, userId: string) {
  const membership = await requireSoftwareMembership(organizationId, userId);
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    include: {
      businessPrograms: { orderBy: { createdAt: "asc" } },
      softwareBranches: { orderBy: [{ status: "asc" }, { name: "asc" }] },
      softwareSettings: true,
      members: {
        include: { role: { select: { key: true, name: true } }, user: { select: { id: true, email: true, profile: { select: { displayName: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!organization) throw new Error("Organization not found");
  // Colleagues see each other's names; only the owner (and each person for themself) sees an email address.
  const { members, ...details } = organization;
  return {
    ...details,
    members: members.map(({ user, ...member }) => ({ ...member, user: memberUserView(user, { seesEmails: membership.isOwner, userId }) })),
    currentUserIsOwner: membership.isOwner,
  };
}