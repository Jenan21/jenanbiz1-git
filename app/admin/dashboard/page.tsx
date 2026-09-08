import { AdminShell } from "@/components/admin/admin-shell";
import { AdminOverviewDashboard } from "@/components/dashboard/admin-overview-dashboard";

export const metadata = {
  title: "لوحة تحكم صائدي الجوائز",
};

export default function AdminDashboard() {
  return (
    <AdminShell>
      <AdminOverviewDashboard />
    </AdminShell>
  );
}
