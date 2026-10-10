import { PlatformShell } from "@/components/custom/platform-shell";
import { TalentFlowWorkspace } from "@/components/talent/talent-flow-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { TalentFlowRoute } from "@/lib/talent/talent-routes";

export async function TalentRoutePage({ applicationId, jobId, route }: { applicationId?: string; jobId?: string; route: TalentFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  const userLabel = user.profile?.displayName ?? user.email;
  const workspace = <TalentFlowWorkspace applicationId={applicationId} jobId={jobId} locale={locale} route={route} />;
  const seekerRoute = ["dashboard", "jobs", "job-detail", "apply", "profile", "matching"].includes(route.id);

  if (!seekerRoute) {
    return (
      <PlatformShell activeRoute="/talent" locale={locale} userLabel={userLabel}>
        {workspace}
      </PlatformShell>
    );
  }

  return (
    <main className="approved-job-seeker" dir={locale === "ar" ? "rtl" : "ltr"}>
      {workspace}
    </main>
  );
}