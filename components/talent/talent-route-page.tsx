import { TalentFlowWorkspace } from "@/components/talent/talent-flow-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { TalentFlowRoute } from "@/lib/talent/talent-routes";

export async function TalentRoutePage({ applicationId, jobId, organizationId, route }: { applicationId?: string; jobId?: string; organizationId?: string; route: TalentFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  const userLabel = user.profile?.displayName ?? user.email;
  const workspace = <TalentFlowWorkspace applicationId={applicationId} jobId={jobId} locale={locale} organizationId={organizationId} route={route} userLabel={userLabel} />;
  const seekerRoute = ["dashboard", "jobs", "saved-jobs", "job-detail", "apply", "applications", "application-detail", "profile", "cv", "interviews", "notifications", "messages", "company", "matching"].includes(route.id);

  if (!seekerRoute) {
    return (
      <main className="approved-talent-employer" dir={locale === "ar" ? "rtl" : "ltr"}>
        {workspace}
      </main>
    );
  }

  return (
    <main className="approved-job-seeker" dir={locale === "ar" ? "rtl" : "ltr"}>
      {workspace}
    </main>
  );
}