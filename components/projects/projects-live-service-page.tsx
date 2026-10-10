import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { ProjectFlowNavigation } from "@/components/projects/project-flow-navigation";
import { ProfessionalFeasibilityWorkspace } from "@/components/projects/professional-feasibility-workspace";
import { ProjectAnalysisWorkspace } from "@/components/projects/project-analysis-workspace";
import { ProjectStartWorkspace } from "@/components/projects/project-start-workspace";
import type { ProjectFlowGroup, ProjectFocus } from "@/lib/projects/project-flow-routes";

type BilingualCopy = readonly [string, string];

export async function ProjectsLiveServicePage({ title, description, focus = "workflow", flowGroup, kind = "workspace", route = "/projects" }: { title: BilingualCopy; description: BilingualCopy; focus?: ProjectFocus; flowGroup?: ProjectFlowGroup; kind?: string; route?: string }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/projects")]);
  const ar = locale === "ar";
  const userLabel = user.profile?.displayName ?? user.email;

  if (route.startsWith("/projects/feasibility/pro/")) {
    return (
      <ProfessionalFeasibilityWorkspace
        locale={locale}
        route={route}
        userLabel={userLabel}
      />
    );
  }

  if (route.startsWith("/projects/analysis/")) {
    return (
      <ProjectAnalysisWorkspace
        flow={{
          title,
          description,
          focus,
          group: flowGroup ?? "analysis",
          kind,
          route,
        }}
        locale={locale}
        userLabel={userLabel}
      />
    );
  }

  if (route.startsWith("/projects/start/")) {
    return <ProjectStartWorkspace locale={locale} route={route} userLabel={userLabel} />;
  }

  return (
    <PlatformShell locale={locale} activeRoute="/projects" userLabel={userLabel}>
      <section className="projects-live-service">
        <header className="section-heading">
          <span className="eyebrow eyebrow--small">JENAN PRO PROJECTS</span>
          <h1>{ar ? title[0] : title[1]}</h1>
          <p>{ar ? description[0] : description[1]}</p>
        </header>
        {flowGroup ? <ProjectFlowNavigation activeRoute={route} group={flowGroup} kind={kind} locale={locale} /> : null}
        <ProjectsWorkspace focus={focus} kind={kind} locale={locale} route={route} />
      </section>
    </PlatformShell>
  );
}