import { notFound } from "next/navigation";
import { DataCenterWorkspace } from "@/components/admin/data-center/workspace";
import { findDataCenterSection } from "@/lib/admin/data-center-routes";

export default async function DataCenterSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const definition = findDataCenterSection(section);
  if (!definition) notFound();
  return <DataCenterWorkspace key={definition.key} section={definition.key} />;
}
