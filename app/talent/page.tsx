import { TalentRoutePage } from "@/components/talent/talent-route-page";
import { TALENT_FLOW_ROUTES } from "@/lib/talent/talent-routes";

export default function Page() {
  return <TalentRoutePage route={TALENT_FLOW_ROUTES[0]} />;
}
