import { notFound } from "next/navigation";

import { RoboticsRoutePage } from "@/components/robotics/robotics-route-page";
import { resolveRoboticsFlow } from "@/lib/robotics/robotics-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ environment?: string; location?: string; query?: string; robot?: string; sector?: string; budget?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveRoboticsFlow(flow);
  if (!route) notFound();
  return <RoboticsRoutePage criteria={{ environment: query.environment, location: query.location, query: query.query, sector: query.sector, budget: query.budget }} robotId={query.robot} route={route} />;
}