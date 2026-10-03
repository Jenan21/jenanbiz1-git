import { PeopleWorkspace } from "@/components/programs/people-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/programs/people")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/programs" userLabel={user.profile?.displayName ?? user.email}><PeopleWorkspace locale={locale as Locale} /></PlatformShell>;
}