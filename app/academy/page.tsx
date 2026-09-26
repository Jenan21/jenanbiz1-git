import { AcademyLibrary } from "@/components/academy/academy-library";
import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/academy"),
  ]);
  return (
    <PlatformShell locale={locale as Locale} activeRoute="/academy" userLabel={user.profile?.displayName ?? user.email}>
      <AcademySectionNav activeRoute="/academy" locale={locale as Locale} />
      <AcademyLibrary locale={locale as Locale} />
    </PlatformShell>
  );
}
