import { notFound } from "next/navigation";

import { TalentRoutePage } from "@/components/talent/talent-route-page";
import { resolveTalentFlow } from "@/lib/talent/talent-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ application?: string; job?: string; organization?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveTalentFlow(flow);
  if (!route) notFound();
  const jobId = query.job ?? (flow[0] === "jobs" && flow[1] !== "saved" ? flow[1] : undefined);
  const applicationId = query.application ?? (flow[0] === "applications" ? flow[1] : undefined);
  const organizationId = query.organization ?? (flow[0] === "companies" ? flow[1] : undefined);
  return <TalentRoutePage applicationId={applicationId} jobId={jobId} organizationId={organizationId} route={route} />;
}