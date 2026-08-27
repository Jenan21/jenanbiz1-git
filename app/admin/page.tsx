import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverviewDashboard } from "@/components/dashboard/admin-overview-dashboard";
import { requireSystemRole } from "@/lib/auth/session";
import { SystemRole } from "@/generated/prisma/client";

export default async function Page() {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  return (
    <AdminShell>
      <AdminOverviewDashboard />
    </AdminShell>
  );
}
