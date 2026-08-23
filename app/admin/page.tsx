import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverviewDashboard } from "@/components/dashboard/admin-overview-dashboard";

export default function Page() {
  return (
    <AdminShell>
      <AdminOverviewDashboard />
    </AdminShell>
  );
}
