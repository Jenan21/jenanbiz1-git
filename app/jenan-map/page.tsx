import { requireUser } from "@/lib/auth/session";
import { JenanMapHarness } from "@/features/jenan-map/jenan-map-harness";
import { idSchema } from "@/services/jenan-map/contracts";

export default async function JenanMapPage({
  searchParams,
}: { searchParams: Promise<{ preview?: string | string[] }> }) {
  const { preview } = await searchParams;
  const validPreview = idSchema.safeParse(preview);
  const returnPath = typeof preview === "string"
    ? `/jenan-map?preview=${encodeURIComponent(validPreview.success ? validPreview.data : "invalid")}`
    : "/jenan-map";
  await requireUser(returnPath);
  return <JenanMapHarness />;
}
