import { SystemRole } from "@/generated/prisma/client";

interface AuthorizedUser {
  systemRole: SystemRole;
  memberships: Array<{
    organizationId: string;
    role: null | { permissions: Array<{ permission: { key: string } }> };
  }>;
}

export function hasPlatformAdminAccess(role: SystemRole) {
  return role === SystemRole.ADMIN || role === SystemRole.SUPER_ADMIN;
}

export function hasPermission(
  user: AuthorizedUser,
  permissionKey: string,
  organizationId?: string,
) {
  if (hasPlatformAdminAccess(user.systemRole)) return true;
  return user.memberships.some(
    (membership) =>
      (!organizationId || membership.organizationId === organizationId) &&
      membership.role?.permissions.some(
        ({ permission }) => permission.key === permissionKey,
      ),
  );
}
