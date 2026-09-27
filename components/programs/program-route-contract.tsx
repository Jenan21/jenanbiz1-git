"use client";

import { usePathname } from "next/navigation";

import { PROGRAM_ROUTES } from "@/lib/programs/program-routes";

export function ProgramRouteContract({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const definition = PROGRAM_ROUTES.find((item) => item.path === pathname);

  if (!definition) return children;

  return (
    <div
      className="program-route-contract"
      data-program-access="ORGANIZATION_MEMBER"
      data-program-key={definition.program}
      data-program-outputs="NONE"
      data-program-privacy="ORGANIZATION_SCOPED"
      data-program-route={definition.path}
      data-program-screen={definition.id}
      data-program-source={definition.source}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}