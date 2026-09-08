import { ProjectsWorkspace } from "@/components/source/projects-workspace";
import { PlatformShell } from "@/components/source/source-ui";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { Locale } from "@/types/i18n";

export async function ProjectsLiveServicePage({
  title,
  description,
}: {
  title: readonly [string, string];
  description: readonly [string, string];
}) {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/projects"),
  ]);
  const language = locale as Locale;
  const ar = language === "ar";

  return (
    <PlatformShell
      locale={language}
      activeRoute="/projects"
      userLabel={user.profile?.displayName ?? user.email}
    >
      <section className="projects-live-service" aria-labelledby="projects-live-title">
        <div className="section-heading">
          <span className="eyebrow eyebrow--small">{ar ? title[0] : title[1]}</span>
          <h1 id="projects-live-title">{ar ? title[0] : title[1]}</h1>
          <p>{ar ? description[0] : description[1]}</p>
        </div>
        <ProjectsWorkspace locale={language} />
      </section>
    </PlatformShell>
  );
}
