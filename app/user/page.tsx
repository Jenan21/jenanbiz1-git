import { AccountOverview } from "@/components/account/account-overview";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getAccountOverview } from "@/services/account/account-overview-service";

export default async function UserCenterPage() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/user")]);
  const overview = await getAccountOverview(user.id);
  return <PlatformShell locale={locale} activeRoute="/account" userLabel={user.profile?.displayName ?? user.email}><UserCenterNav activeRoute="/user" locale={locale} /><AccountOverview locale={locale} overview={overview} /></PlatformShell>;
}