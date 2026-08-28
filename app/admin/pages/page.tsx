import { AdminShell } from "@/components/admin/admin-shell";
import { PageSectionGenerator } from "@/components/admin/page-section-generator";
import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export const metadata = {
  title: "Page & Section Generator — Jenan Admin",
};

export default async function AdminPagesPage() {
  const [{ locale }] = await Promise.all([
    getRequestDictionary(),
    requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]),
  ]);
  return (
    <AdminShell>
      <PageSectionGenerator lang={locale} />
    </AdminShell>
  );
}
