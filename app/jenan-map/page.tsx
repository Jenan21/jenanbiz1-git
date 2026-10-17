import { requireUser } from "@/lib/auth/session";
import { JenanMapHarness } from "@/features/jenan-map/jenan-map-harness";

export default async function JenanMapPage() {
  await requireUser("/jenan-map");
  return <JenanMapHarness />;
}
