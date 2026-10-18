import { notFound } from "next/navigation";
import { JenanMapAdmin } from "@/components/admin/jenan-map/jenan-map-admin";
import { isMapAdminSection } from "@/components/admin/jenan-map/sections";

export default async function JenanMapSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isMapAdminSection(section)) notFound();
  return <JenanMapAdmin section={section} />;
}
