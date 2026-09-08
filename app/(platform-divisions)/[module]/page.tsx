import { notFound } from "next/navigation";

import { ModulePage } from "@/components/custom/module-page";
import { findPlatformModule } from "@/lib/platform/catalog";

export default async function GeneratedModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleId } = await params;
  const catalogModule = await findPlatformModule(moduleId);

  if (!catalogModule || catalogModule.id === "dashboard") notFound();

  return <ModulePage route={catalogModule.route} />;
}
