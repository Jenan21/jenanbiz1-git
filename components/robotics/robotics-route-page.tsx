import { PlatformShell } from "@/components/custom/platform-shell";
import { RoboticsWorkspace } from "@/components/robotics/robotics-workspace";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import type { RoboticsFlowRoute } from "@/lib/robotics/robotics-routes";

export async function RoboticsRoutePage({ criteria, robotId, route }: { criteria?: { environment?: string; location?: string; query?: string; sector?: string; budget?: string }; robotId?: string; route: RoboticsFlowRoute }) {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser(route.route)]);
  return <PlatformShell activeRoute="/software" locale={locale} userLabel={user.profile?.displayName ?? user.email}><RoboticsWorkspace criteria={criteria} locale={locale} robotId={robotId} route={route} /></PlatformShell>;
}