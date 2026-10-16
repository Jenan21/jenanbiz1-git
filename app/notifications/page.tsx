import { NotificationsPage } from "@/components/notifications/notifications-page";
import { JenanHeader } from "@/components/shell/jenan-header";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function Page() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/notifications")]);
  return (
    <main className="notices" data-notifications-route="/notifications" dir={locale === "ar" ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={user.profile?.displayName ?? user.email} />
      <NotificationsPage locale={locale} />
    </main>
  );
}
