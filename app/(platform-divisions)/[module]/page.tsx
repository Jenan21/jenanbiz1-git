import { notFound } from "next/navigation";

import { ProtectedModulePage } from "@/components/source/protected-module-page";
import { findPlatformModule } from "@/lib/platform/catalog";

export default async function GeneratedModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleId } = await params;
  const catalogModule = await findPlatformModule(moduleId);

  if (!catalogModule || catalogModule.id === "dashboard") notFound();

  return <ProtectedModulePage route={catalogModule.route} />;
}
