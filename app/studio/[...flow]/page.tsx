import { notFound } from "next/navigation";

import { StudioRoutePage } from "@/components/studio/studio-route-page";
import { resolveStudioFlow } from "@/lib/studio/studio-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ document?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveStudioFlow(flow);
  if (!route) notFound();
  return <StudioRoutePage initialDocumentId={query.document} route={route} />;
}