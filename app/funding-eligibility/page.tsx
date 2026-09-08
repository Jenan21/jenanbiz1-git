import { FundingWorkspace } from "@/components/funding/funding-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/funding-eligibility")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/funding-eligibility" userLabel={user.profile?.displayName ?? user.email}><FundingWorkspace locale={locale as Locale} /></PlatformShell>;
}
