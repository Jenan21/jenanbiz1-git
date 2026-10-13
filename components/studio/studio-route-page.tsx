import { PlatformShell } from "@/components/custom/platform-shell";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { requireUser } from "@/lib/auth/session";
import type { StudioFlowRoute } from "@/lib/studio/studio-routes";
import { getRequestDictionary } from "@/lib/i18n/server";

export async function StudioRoutePage({ initialDocumentId, route, signInQuery = "" }: { initialDocumentId?: string; route: StudioFlowRoute; signInQuery?: string }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(`${route.href}${signInQuery}`)]);
  return (
    <PlatformShell activeRoute="/studio" locale={locale} userLabel={user.profile?.displayName ?? user.email}>
      <StudioWorkspace initialDocumentId={initialDocumentId} locale={locale} routeId={route.id} />
    </PlatformShell>
  );
}