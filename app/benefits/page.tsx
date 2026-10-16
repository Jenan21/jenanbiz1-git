import { AboutPage } from "@/components/shell/about-page";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { emptyPlatformProfile } from "@/lib/platform/platform-profile-empty";
import { getPlatformProfile } from "@/services/platform/platform-profile-service";

export default async function Page() {
  const [{ locale }, user, stored] = await Promise.all([getRequestDictionary(), requireUser("/benefits"), getPlatformProfile()]);
  return (
    <AboutPage
      canEdit={hasPlatformAdminAccess(user.systemRole)}
      locale={locale}
      profile={stored?.profile ?? emptyPlatformProfile}
      unavailable={stored === null}
      updatedAt={stored?.updatedAt ?? null}
      userLabel={user.profile?.displayName ?? user.email}
    />
  );
}
