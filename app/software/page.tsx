import { SoftwareRoutePage } from "@/components/software/software-route-page";
import { SOFTWARE_FLOW_ROUTES } from "@/lib/software/software-routes";

export default function Page() {
  return <SoftwareRoutePage route={SOFTWARE_FLOW_ROUTES[0]} />;
}
