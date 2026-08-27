import { AdminShell } from "@/components/admin/admin-shell";
import { RobotAdminDashboard } from "@/components/dashboard/robot-admin-dashboard";

export const metadata = {
  title: "لوحة تحكم صائدي الجوائز",
};

export default function AdminDashboard() {
  return (
    <AdminShell>
      <RobotAdminDashboard />
    </AdminShell>
  );
}
