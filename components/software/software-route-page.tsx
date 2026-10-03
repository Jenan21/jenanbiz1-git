import { PlatformShell } from "@/components/custom/platform-shell";
import { SoftwareErpWorkspace } from "@/components/software/software-erp-workspace";
import { requireUser } from "@/lib/auth/session";
import type { SoftwareFlowRoute } from "@/lib/software/software-routes";
import { getRequestDictionary } from "@/lib/i18n/server";

export async function SoftwareRoutePage({ route }: { route: SoftwareFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  return (
    <PlatformShell activeRoute="/software" locale={locale} userLabel={user.profile?.displayName ?? user.email}>
      <SoftwareErpWorkspace locale={locale} route={route} />
    </PlatformShell>
  );
}