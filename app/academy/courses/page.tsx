import { AcademyLibrary } from "@/components/academy/academy-library";
import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function AcademyCoursesPage() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/academy/courses")]);
  return <PlatformShell locale={locale} activeRoute="/academy" userLabel={user.profile?.displayName ?? user.email}><AcademySectionNav activeRoute="/academy/courses" locale={locale} /><AcademyLibrary locale={locale} route="/academy/courses" /></PlatformShell>;
}