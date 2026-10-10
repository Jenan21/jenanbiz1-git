import { SoftwareExperienceWorkspace } from "@/components/software/software-experience-workspace";
import { SoftwareSuiteShell } from "@/components/software/software-suite-shell";
import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { requireUser } from "@/lib/auth/session";
import type { SoftwareExperienceRoute } from "@/lib/software/software-experience-routes";
import { STUDIO_FLOW_ROUTES } from "@/lib/studio/studio-routes";
import { getRequestDictionary } from "@/lib/i18n/server";

const softwareStudioKindRoutes = {
  DOCS: "/software/design/docs",
  SHEETS: "/software/design/sheets",
  PRESENTATION: "/software/design/presentations",
  LOGO: "/software/design/logo",
  LETTERHEAD: "/software/design/letterhead",
  CV: "/software/design/cv",
} as const;

export async function SoftwareExperiencePage({
  initialDocumentId,
  route,
}: {
  initialDocumentId?: string;
  route: SoftwareExperienceRoute;
}) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  const studioId = "studioId" in route ? route.studioId : null;
  const studioRoute = studioId ? STUDIO_FLOW_ROUTES.find((candidate) => candidate.id === studioId) : null;
  return (
    <SoftwareSuiteShell locale={locale} userLabel={user.profile?.displayName ?? user.email}>
      {studioRoute ? (
        <StudioWorkspace
          historyHref="/software/design/history"
          initialDocumentId={initialDocumentId}
          kindRoutes={softwareStudioKindRoutes}
          locale={locale}
          routeHref={route.route}
          routeId={studioRoute.id}
          showNav={false}
        />
      ) : (
        <SoftwareExperienceWorkspace locale={locale} route={route} />
      )}
    </SoftwareSuiteShell>
  );
}
