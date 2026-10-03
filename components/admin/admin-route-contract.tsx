"use client";

import { usePathname } from "next/navigation";

import { ADMIN_OPERATION_ROUTES } from "@/lib/admin/admin-operations-routes";

export function AdminRouteContract({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const definition = ADMIN_OPERATION_ROUTES.find((item) => item.path === pathname);

  return (
    <div
      data-admin-access="ADMIN"
      data-admin-group={definition?.group}
      data-admin-kind={definition?.kind}
      data-admin-operation={definition?.path}
      data-admin-source="PLATFORM_RECORDS"
    >
      {children}
    </div>
  );
}