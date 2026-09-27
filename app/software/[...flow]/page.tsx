import { notFound } from "next/navigation";

import { SoftwareRoutePage } from "@/components/software/software-route-page";
import { resolveSoftwareFlow } from "@/lib/software/software-routes";

export default async function Page({ params }: { params: Promise<{ flow: string[] }> }) {
  const { flow } = await params;
  const route = resolveSoftwareFlow(flow);
  if (!route) notFound();
  return <SoftwareRoutePage route={route} />;
}