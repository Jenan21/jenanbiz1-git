import { notFound } from "next/navigation";

import { ServicePage } from "@/components/custom/module-page";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ module: string; slug: string }>;
}) {
  const { module, slug } = await params;
  const detail = await findPlatformService(module, slug);
  if (!detail) notFound();
  return <ServicePage moduleId={module} slug={slug} />;
}
