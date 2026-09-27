import { PlatformShell } from "@/components/custom/platform-shell";
import { TalentFlowWorkspace } from "@/components/talent/talent-flow-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { TalentFlowRoute } from "@/lib/talent/talent-routes";

export async function TalentRoutePage({ applicationId, jobId, route }: { applicationId?: string; jobId?: string; route: TalentFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  return <PlatformShell activeRoute="/talent" locale={locale} userLabel={user.profile?.displayName ?? user.email}><TalentFlowWorkspace applicationId={applicationId} jobId={jobId} locale={locale} route={route} /></PlatformShell>;
}