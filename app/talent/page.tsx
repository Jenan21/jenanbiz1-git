import { TalentWorkspace } from "@/components/talent/talent-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/talent")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/talent" userLabel={user.profile?.displayName ?? user.email}><TalentWorkspace locale={locale as Locale} /></PlatformShell>;
}
