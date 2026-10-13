import { notFound } from "next/navigation";

import { StudioRoutePage } from "@/components/studio/studio-route-page";
import { resolveStudioFlow } from "@/lib/studio/studio-routes";

export default async function Page({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<{ document?: string; tool?: string }> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = resolveStudioFlow(flow);
  if (!route) notFound();
  // a guest sent to sign-in comes back with the requested PDF tool (e.g. `?tool=convert`)
  const signInQuery = query.tool && /^[a-z]{2,16}$/.test(query.tool) ? `?tool=${query.tool}` : "";
  return <StudioRoutePage initialDocumentId={query.document} route={route} signInQuery={signInQuery} />;
}