import { InterfaceVisibilityManager } from "@/components/account/interface-visibility-manager";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";
import { getHiddenInterfacePaths } from "@/services/account/interface-visibility-service";

export default async function InterfaceVisibilityPage() {
  const [{ locale }, user] = await Promise.all([
    getRequestDictionary(),
    requireUser("/user/interface"),
  ]);
  const hiddenPaths = await getHiddenInterfacePaths(user.id);
  return (
    <PlatformShell
      activeRoute="/account"
      locale={locale}
      userLabel={user.profile?.displayName ?? user.email}
    >
      <UserCenterNav activeRoute="/user/interface" locale={locale} />
      <InterfaceVisibilityManager initialHiddenPaths={hiddenPaths} locale={locale} />
    </PlatformShell>
  );
}
