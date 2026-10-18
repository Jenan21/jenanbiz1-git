import { notFound } from "next/navigation";
import { ProjectsLiveServicePage } from "@/components/projects/projects-live-service-page";
import { findProjectFlow } from "@/lib/projects/project-flow-routes";

export default async function ProjectFlowPage({ params, searchParams }: { params: Promise<{ flow: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ flow }, query] = await Promise.all([params, searchParams]);
  const route = `/projects/${flow.join("/")}`;
  const definition = findProjectFlow(route);
  if (!definition) notFound();
  return <ProjectsLiveServicePage description={definition.description} focus={definition.focus} flowGroup={definition.group} kind={definition.kind} route={definition.route} searchParams={query} title={definition.title} />;
}