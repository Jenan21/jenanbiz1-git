import { notFound } from "next/navigation";

import { AcademyCinematic } from "@/components/source/academy-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformModule } from "@/lib/platform/catalog";

export default async function AcademyShowcaseReviewPage() {
  const [{ locale }, catalogModule] = await Promise.all([
    getRequestDictionary(),
    findPlatformModule("/academy"),
  ]);
  if (!catalogModule) notFound();
  return <AcademyCinematic locale={locale} module={catalogModule} userLabel="Jenan BIZ Review" reviewMode />;
}
