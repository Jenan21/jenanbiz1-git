import { AcademyRoleScope, SystemRole } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";

export async function hasAcademyScope(input: {
  userId: string;
  systemRole: SystemRole;
  academyId: string;
  scope: AcademyRoleScope;
}) {
  if (hasPlatformAdminAccess(input.systemRole)) return true;
  const assignment = await db.academyStaffAssignment.findFirst({
    where: {
      userId: input.userId,
      academyRole: {
        academyId: input.academyId,
        scope: { in: [AcademyRoleScope.ADMIN, input.scope] },
      },
    },
  });
  return Boolean(assignment);
}

export async function requireAcademyScope(input: {
  userId: string;
  systemRole: SystemRole;
  academyId: string;
  scope: AcademyRoleScope;
}) {
  if (!(await hasAcademyScope(input))) throw new Error("Academy role does not allow this command");
}