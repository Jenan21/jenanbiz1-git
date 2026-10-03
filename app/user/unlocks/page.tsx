import { CommunityAccessWorkspace } from "@/components/account/community-access-workspace";
import { UserCenterNav } from "@/components/account/user-center-nav";
import { UserSectionHeader } from "@/components/account/user-section-header";
import { PlatformShell } from "@/components/custom/platform-shell";
import { requireUser } from "@/lib/auth/session";
import { getRequestDictionary } from "@/lib/i18n/server";

export default async function UserUnlocksPage() {
  const [{ locale }, user] = await Promise.all([getRequestDictionary(), requireUser("/user/unlocks")]);
  const ar = locale === "ar";
  return <PlatformShell locale={locale} activeRoute="/account" userLabel={user.profile?.displayName ?? user.email}><UserCenterNav activeRoute="/user/unlocks" locale={locale} /><section className="user-center-page"><UserSectionHeader eyebrow={ar ? "وصول المجتمع" : "COMMUNITY ACCESS"} title={ar ? "تابع وافتح خدمات محددة" : "Follow and unlock assigned services"} description={ar ? "متابعة طوعية وإقرار يدوي فقط؛ لا تستخدم المنصة Bots أو تحققاً غير مصرح به." : "Voluntary following and manual acknowledgement only; the platform does not use bots or unauthorized verification."} /><CommunityAccessWorkspace locale={locale} /></section></PlatformShell>;
}