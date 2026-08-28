import { notFound } from "next/navigation";

import { ServiceToolWorkspace } from "@/components/source/service-tool-workspace";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getServiceToolDetail } from "@/lib/platform/project-academy-tools";

export default async function ServiceToolReviewPage({
  params,
}: {
  params: Promise<{ module: string; slug: string; tool: string }>;
}) {
  const { module, slug, tool } = await params;
  const [{ locale }, detail] = await Promise.all([
    getRequestDictionary(),
    getServiceToolDetail(module, slug, tool),
  ]);
  if (!detail) notFound();

  return (
    <ServiceToolWorkspace
      locale={locale}
      module={detail.module}
      navigationMode="preview"
      service={detail.service}
      suite={detail.suite}
      tool={detail.tool}
      userLabel="Jenan BIZ Review"
    />
  );
}
