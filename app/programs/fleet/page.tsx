import { FleetWorkspace } from "@/components/programs/fleet-workspace";
import { PlatformShell } from "@/components/source/source-ui";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/programs/fleet")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/programs" userLabel={user.profile?.displayName ?? user.email}><FleetWorkspace locale={locale as Locale} /></PlatformShell>;
}