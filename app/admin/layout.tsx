import { SystemRole } from "@/generated/prisma/client";
import { requireSystemRole } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  return children;
}
