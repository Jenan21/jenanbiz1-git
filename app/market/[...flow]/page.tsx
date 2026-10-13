import { notFound } from "next/navigation";
import { MarketFlowWorkspace } from "@/components/market/market-flow-workspace";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { initialListingFilters, listingFiltersQuery } from "@/lib/market/listing-filters";
import { findMarketFlow } from "@/lib/market/market-flow-routes";

export default async function MarketFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ flow: string[] }>;
  searchParams: Promise<{ kind?: string | string[]; q?: string | string[] }>;
}) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = `/market/${flow.join("/")}`;
  const definition = findMarketFlow(route);
  if (!definition) notFound();
  const filters = initialListingFilters(query);
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(`${route}${listingFiltersQuery(filters)}`)]);
  return <PlatformShell locale={locale} activeRoute="/market" userLabel={user.profile?.displayName ?? user.email}><MarketFlowWorkspace definition={definition} initialFilters={filters} locale={locale} /></PlatformShell>;
}