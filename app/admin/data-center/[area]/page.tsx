import { notFound } from "next/navigation";
import { DataCenterWorkspace } from "@/components/admin/data-center/workspace";
import { isDataCenterArea } from "@/lib/admin/data-center-routes";

export default async function DataCenterAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isDataCenterArea(area) || area === "overview") notFound();
  return <DataCenterWorkspace area={area} />;
}
