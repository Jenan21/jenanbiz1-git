import { AccountOverview } from "@/components/account/account-overview";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getAccountOverview } from "@/services/account/account-overview-service";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/account")]);
  const overview = await getAccountOverview(user.id);
  return <PlatformShell locale={locale as Locale} activeRoute="/account" userLabel={user.profile?.displayName ?? user.email}><AccountOverview locale={locale as Locale} overview={overview} /></PlatformShell>;
}
