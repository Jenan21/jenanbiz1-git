import { UserInvestmentDashboard } from "@/components/account/user-investment-dashboard";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getAccountOverview } from "@/services/account/account-overview-service";

export default async function UserInvestmentsPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/investments"),
  ]);
  const overview = await getAccountOverview(user.id);

  return <UserInvestmentDashboard locale={locale} overview={overview} userLabel={user.profile?.displayName ?? user.email} />;
}
