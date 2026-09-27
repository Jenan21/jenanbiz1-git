"use client";

import { usePathname } from "next/navigation";

import { USER_CENTER_ROUTES } from "@/lib/account/user-center-routes";

export function UserCenterRouteContract({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const definition = USER_CENTER_ROUTES.find((item) => item.path === pathname);

  if (!definition) return children;

  return (
    <div
      className="user-center-contract"
      data-user-access="AUTHENTICATED"
      data-user-outputs={definition.outputs}
      data-user-privacy="USER_SCOPED"
      data-user-route={definition.path}
      data-user-screen={definition.id}
      data-user-source={definition.source}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}