import { SectionShowcase } from "@/components/shell/section-showcase";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { BUSINESS_SHOWCASE } from "@/lib/navigation/section-showcases";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/business")]);
  return <SectionShowcase locale={locale} userLabel={user.profile?.displayName ?? user.email} {...BUSINESS_SHOWCASE} />;
}
