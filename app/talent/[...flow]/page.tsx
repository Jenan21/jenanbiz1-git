import { notFound } from "next/navigation";

import { TalentRoutePage } from "@/components/talent/talent-route-page";
import { resolveTalentFlow } from "@/lib/talent/talent-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ application?: string; job?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveTalentFlow(flow);
  if (!route) notFound();
  return <TalentRoutePage applicationId={query.application} jobId={query.job} route={route} />;
}