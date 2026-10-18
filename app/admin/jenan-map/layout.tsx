import { forbidden, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import "./jenan-map-admin.css";

export default async function JenanMapAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth?next=%2Fadmin%2Fjenan-map");
  if (!hasPlatformAdminAccess(user.systemRole)) forbidden();
  return <AdminShell>{children}</AdminShell>;
}
