import { notFound } from "next/navigation";

import { ServiceToolWorkspace } from "@/components/source/service-tool-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getServiceToolDetail } from "@/lib/platform/project-academy-tools";

export default async function ServiceToolPage({
  params,
}: {
  params: Promise<{ module: string; slug: string; tool: string }>;
}) {
  const { module, slug, tool } = await params;
  const [detail, { locale }, user] = await Promise.all([
    getServiceToolDetail(module, slug, tool),
    getRequestDictionary(),
    requireUser(`/${module}/${slug}/${tool}`),
  ]);
  if (!detail) notFound();

  return (
    <ServiceToolWorkspace
      locale={locale}
      module={detail.module}
      service={detail.service}
      suite={detail.suite}
      tool={detail.tool}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
