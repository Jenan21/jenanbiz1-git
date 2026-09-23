import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";

type BilingualCopy = readonly [string, string];

export async function ProjectsLiveServicePage({ title, description }: { title: BilingualCopy; description: BilingualCopy }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/projects")]);
  const ar = locale === "ar";

  return (
    <PlatformShell locale={locale} activeRoute="/projects" userLabel={user.profile?.displayName ?? user.email}>
      <section className="projects-live-service">
        <header className="section-heading">
          <span className="eyebrow eyebrow--small">JENAN PROJECTS</span>
          <h1>{ar ? title[0] : title[1]}</h1>
          <p>{ar ? description[0] : description[1]}</p>
        </header>
        <ProjectsWorkspace locale={locale} />
      </section>
    </PlatformShell>
  );
}