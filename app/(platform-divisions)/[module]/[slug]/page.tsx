import { notFound } from "next/navigation";

import {
  DivisionWorkspace,
  getDivisionDetail,
} from "@/components/source/division-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ module: string; slug: string }>;
}) {
  const { module, slug } = await params;
  const detail = await getDivisionDetail(module, slug);
  if (!detail) notFound();

  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser(detail.href),
  ]);

  return (
    <DivisionWorkspace
      detail={detail}
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
