import { AdminShell } from "@/components/admin/admin-shell";
import { AcademyDashboard } from "@/components/academy/academy-dashboard";

export const metadata = { title: "Jenan Agent Academy" };

export default function AcademyAdminPage() {
  return (
    <AdminShell>
      <AcademyDashboard />
    </AdminShell>
  );
}