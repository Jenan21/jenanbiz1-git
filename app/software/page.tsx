import { SoftwareWorkspace } from "@/components/software/software-workspace";
import { PlatformShell } from "@/components/source/source-ui";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/software")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/software" userLabel={user.profile?.displayName ?? user.email}><SoftwareWorkspace locale={locale as Locale} /></PlatformShell>;
}
