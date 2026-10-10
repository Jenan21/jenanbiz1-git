import { AcademyLibrary } from "@/components/academy/academy-library";
import { AcademyShell } from "@/components/academy/academy-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function AcademyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [{ locale }, user, filters] = await Promise.all([
    getRequestDictionary(),
    requireUser("/academy/courses"),
    searchParams,
  ]);
  return <AcademyShell locale={locale} activeRoute="/academy/courses" userLabel={user.profile?.displayName ?? user.email}><AcademyLibrary initialCategory={filters.category} locale={locale} route="/academy/courses" /></AcademyShell>;
}