import { notFound } from "next/navigation";

import { SoftwareExperiencePage } from "@/components/software/software-experience-page";
import { SoftwareRoutePage } from "@/components/software/software-route-page";
import { resolveSoftwareExperienceFlow } from "@/lib/software/software-experience-routes";
import { resolveSoftwareFlow } from "@/lib/software/software-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ document?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const experienceRoute = resolveSoftwareExperienceFlow(flow);
  if (experienceRoute) return <SoftwareExperiencePage initialDocumentId={query.document} route={experienceRoute} />;
  const route = resolveSoftwareFlow(flow);
  if (!route) notFound();
  return <SoftwareRoutePage route={route} />;
}