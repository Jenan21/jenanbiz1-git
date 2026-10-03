import { PlatformShell } from "@/components/custom/platform-shell";
import { MarketingFlowWorkspace } from "@/components/marketing/marketing-flow-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { MarketingFlowRoute } from "@/lib/marketing/marketing-routes";

export async function MarketingRoutePage({ campaignId, route }: { campaignId?: string; route: MarketingFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  return <PlatformShell activeRoute="/marketing" locale={locale} userLabel={user.profile?.displayName ?? user.email}><MarketingFlowWorkspace campaignId={campaignId} locale={locale} route={route} /></PlatformShell>;
}