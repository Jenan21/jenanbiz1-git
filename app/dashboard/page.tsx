import { AuthenticatedHome } from "@/components/dashboard/authenticated-home";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/dashboard"),
  ]);

  return (
    <AuthenticatedHome
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
