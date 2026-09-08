import { FieldOperationsWorkspace } from "@/components/programs/field-operations-workspace";
import { PlatformShell } from "@/components/source/source-ui";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/programs/field")]);
  return <PlatformShell locale={locale as Locale} activeRoute="/programs" userLabel={user.profile?.displayName ?? user.email}><FieldOperationsWorkspace locale={locale as Locale} /></PlatformShell>;
}