import { notFound } from "next/navigation";
import { MarketFlowWorkspace } from "@/components/market/market-flow-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { findMarketFlow } from "@/lib/market/market-flow-routes";

export default async function MarketFlowPage({ params }: { params: Promise<{ flow: string[] }> }) {
  const { flow } = await params;
  const route = `/market/${flow.join("/")}`;
  const definition = findMarketFlow(route);
  if (!definition) notFound();
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route)]);
  return <PlatformShell locale={locale} activeRoute="/market" userLabel={user.profile?.displayName ?? user.email}><MarketFlowWorkspace definition={definition} locale={locale} /></PlatformShell>;
}