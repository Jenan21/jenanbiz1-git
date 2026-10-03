import { notFound } from "next/navigation";

import { SystemRole } from "@/generated/prisma/client";
import { AdminOperationPage } from "@/components/admin/admin-operation-page";
import { AdminShell } from "@/components/admin/admin-shell";
import { findAdminOperationRoute } from "@/lib/admin/admin-operations-routes";
import { requireSystemRole } from "@/lib/auth/session";
import { getAdminOperationSnapshot } from "@/services/admin/admin-operations-service";

export async function renderAdminOperationRoute(path: string, shell = true) {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  const definition = findAdminOperationRoute(path);
  if (!definition) notFound();
  const content = <AdminOperationPage snapshot={await getAdminOperationSnapshot(definition)} />;
  return shell ? <AdminShell>{content}</AdminShell> : content;
}