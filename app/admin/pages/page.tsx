import { AdminShell } from "@/components/admin/admin-shell";
import { PageSectionGenerator } from "@/components/admin/page-section-generator";
import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole } from "@/lib/auth/session";

export const metadata = {
  title: "Page & Section Generator — Jenan Admin",
};

export default async function AdminPagesPage() {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  return (
    <AdminShell>
      <PageSectionGenerator />
    </AdminShell>
  );
}
