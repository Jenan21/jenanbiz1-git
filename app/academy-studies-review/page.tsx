import { notFound } from "next/navigation";

import { AcademyStudiesCinematic } from "@/components/source/academy-studies-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

export default async function AcademyStudiesReviewPage() {
  const [{ locale }, detail] = await Promise.all([
    getRequestDictionary(),
    findPlatformService("academy", "studies"),
  ]);
  if (!detail) notFound();

  return (
    <AcademyStudiesCinematic
      locale={locale}
      module={detail.module}
      service={detail.service}
      userLabel="Jenan BIZ Review"
      navigationMode="preview"
    />
  );
}
