import { SectionShowcase } from "@/components/shell/section-showcase";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { MARKET_SHOWCASE } from "@/lib/navigation/section-showcases";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/market")]);
  return <SectionShowcase locale={locale} userLabel={user.profile?.displayName ?? user.email} {...MARKET_SHOWCASE} />;
}
