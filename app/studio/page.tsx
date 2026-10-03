import { StudioRoutePage } from "@/components/studio/studio-route-page";
import { STUDIO_FLOW_ROUTES } from "@/lib/studio/studio-routes";

export default function Page() {
  return <StudioRoutePage route={STUDIO_FLOW_ROUTES[0]} />;
}
