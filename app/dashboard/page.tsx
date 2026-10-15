import { AuthenticatedHome } from "@/components/dashboard/authenticated-home";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getHomeStats } from "@/services/platform/home-stats-service";

export default async function Page() {
  const [{ locale }, user, stats] = await Promise.all([
    getRequestDictionary(),
    requireUser("/dashboard"),
    getHomeStats(),
  ]);

  return (
    <AuthenticatedHome
      locale={locale}
      stats={stats}
      systemRole={user.systemRole}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
