import { notFound } from "next/navigation";
import { AcademyPathCinematic } from "@/components/source/academy-path-cinematic";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findPlatformService } from "@/lib/platform/catalog";

const reviewable = new Set(["seminars", "research", "courses"]);
export default async function AcademyPathReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!reviewable.has(slug)) notFound();
  const [{ locale }, detail] = await Promise.all([getRequestDictionary(), findPlatformService("academy", slug)]);
  if (!detail) notFound();
  return <AcademyPathCinematic locale={locale} module={detail.module} service={detail.service} userLabel="Jenan BIZ Review" navigationMode="preview" />;
}
