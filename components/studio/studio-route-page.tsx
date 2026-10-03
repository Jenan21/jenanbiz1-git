import { PlatformShell } from "@/components/custom/platform-shell";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { requireUser } from "@/lib/auth/session";
import type { StudioFlowRoute } from "@/lib/studio/studio-routes";
import { getRequestDictionary } from "@/lib/i18n/server";

export async function StudioRoutePage({ initialDocumentId, route }: { initialDocumentId?: string; route: StudioFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.href)]);
  return (
    <PlatformShell activeRoute="/studio" locale={locale} userLabel={user.profile?.displayName ?? user.email}>
      <StudioWorkspace initialDocumentId={initialDocumentId} locale={locale} routeId={route.id} />
    </PlatformShell>
  );
}