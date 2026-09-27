import { MarketingRoutePage } from "@/components/marketing/marketing-route-page";
import { MARKETING_FLOW_ROUTES } from "@/lib/marketing/marketing-routes";

export default function Page() {
  return <MarketingRoutePage route={MARKETING_FLOW_ROUTES[0]} />;
}
