import { notFound } from "next/navigation";

import { MarketingRoutePage } from "@/components/marketing/marketing-route-page";
import { resolveMarketingFlow } from "@/lib/marketing/marketing-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ campaign?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveMarketingFlow(flow);
  if (!route) notFound();
  return <MarketingRoutePage campaignId={query.campaign} route={route} />;
}