import Link from "next/link";
import { projectFlowDefinitions, type ProjectFlowGroup } from "@/lib/projects/project-flow-routes";
import type { Locale } from "@/types/i18n";

const groupRoutes: Record<ProjectFlowGroup, string> = {
  analysis: "/projects/analysis",
  evaluation: "/projects/evaluation",
  feasibility: "/projects/feasibility",
  start: "/projects/start",
};

export function ProjectFlowNavigation({ activeRoute, group, kind, locale }: { activeRoute: string; group: ProjectFlowGroup; kind: string; locale: Locale }) {
  const ar = locale === "ar";
  const routes = projectFlowDefinitions.filter((item) => item.group === group);
  return (
    <nav className="project-flow-navigation" aria-label={ar ? "خطوات رحلة المشروع" : "Project flow steps"}>
      <Link className={activeRoute === groupRoutes[group] ? "is-active" : ""} href={groupRoutes[group]}><span>00</span>{ar ? "مساحة العمل" : "Workspace"}</Link>
      {routes.map((item, index) => <Link className={activeRoute === item.route ? "is-active" : ""} href={item.route} key={item.route}><span>{String(index + 1).padStart(2, "0")}</span>{ar ? item.title[0] : item.title[1]}</Link>)}
      <small>{ar ? `نوع الصفحة: ${kind}` : `Page type: ${kind}`}</small>
    </nav>
  );
}