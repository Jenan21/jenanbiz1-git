import { OrganizationMemberStatus, SystemRole } from "@/generated/prisma/client";
import type { PublicUser } from "@/lib/auth/public-user";

interface RoleGrants {
  permissions: Array<{ permission: { key: string } }>;
}

interface AuthorizedUser {
  systemRole: SystemRole;
  memberships: Array<{
    organizationId: string;
    status: OrganizationMemberStatus;
    role: null | RoleGrants;
  }>;
}

/** Permission keys an organization role can carry. Owners hold every one of them without a role. */
export const ORGANIZATION_PERMISSIONS = {
  financeRead: "finance.read",
  financeWrite: "finance.write",
  dataCenterView: "data-center.view",
  dataCenterImport: "data-center.import",
  dataCenterEdit: "data-center.edit",
  dataCenterReview: "data-center.review",
  dataCenterApprove: "data-center.approve",
  dataCenterPublish: "data-center.publish",
  dataCenterArchive: "data-center.archive",
  dataCenterExport: "data-center.export",
  dataCenterManageSources: "data-center.manage-sources",
  dataCenterManageRobotAccess: "data-center.manage-robot-access",
} as const;

export function hasPlatformAdminAccess(role: SystemRole) {
  return role === SystemRole.ADMIN || role === SystemRole.SUPER_ADMIN;
}

function roleGrants(role: null | undefined | RoleGrants, permissionKey: string) {
  return Boolean(role?.permissions.some(({ permission }) => permission.key === permissionKey));
}

export function hasPermission(
  user: AuthorizedUser,
  permissionKey: string,
  organizationId?: string,
) {
  if (hasPlatformAdminAccess(user.systemRole)) return true;
  return user.memberships.some(
    (membership) =>
      membership.status === OrganizationMemberStatus.ACTIVE &&
      (!organizationId || membership.organizationId === organizationId) &&
      roleGrants(membership.role, permissionKey),
  );
}

/**
 * What one member may do inside their own organization: an ACTIVE owner may do everything, any other ACTIVE member
 * only what their role grants. Invited and suspended members may do nothing.
 */
export function memberHasPermission(
  membership: { isOwner: boolean; role: null | RoleGrants; status: OrganizationMemberStatus },
  permissionKey: string,
) {
  if (membership.status !== OrganizationMemberStatus.ACTIVE) return false;
  return membership.isOwner || roleGrants(membership.role, permissionKey);
}

export type MemberUserView = PublicUser & { email?: string };

/**
 * One person as a member list shows them to a given viewer: the name always, the email only to the person themself
 * or to the owner who manages the list. Phone, status and system role are never part of a member list.
 */
export function memberUserView(
  user: { email: string; id: string; profile: null | { displayName: string | null } },
  viewer: { seesEmails: boolean; userId: string },
): MemberUserView {
  return {
    id: user.id,
    profile: user.profile ? { displayName: user.profile.displayName } : null,
    ...(viewer.seesEmails || viewer.userId === user.id ? { email: user.email } : {}),
  };
}
