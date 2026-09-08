import { GrowthWorkspace } from "@/components/marketing/growth-workspace";
import { PlatformShell } from "@/components/source/source-ui";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/marketing")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/marketing" userLabel={user.profile?.displayName ?? user.email}><GrowthWorkspace locale={locale as Locale} /></PlatformShell>;
}
