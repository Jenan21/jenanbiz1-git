import { RoboticsRoutePage } from "@/components/robotics/robotics-route-page";
import { ROBOTICS_FLOW_ROUTES } from "@/lib/robotics/robotics-routes";

export default function Page() {
  return <RoboticsRoutePage route={ROBOTICS_FLOW_ROUTES[0]} />;
}