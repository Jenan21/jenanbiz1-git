import { AdminShell } from "@/components/admin/admin-shell";
import { PlatformProfileEditor } from "@/components/admin/platform-profile-editor";
import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole } from "@/lib/auth/session";

export default async function Page() {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  return (
    <AdminShell>
      <PlatformProfileEditor />
    </AdminShell>
  );
}
