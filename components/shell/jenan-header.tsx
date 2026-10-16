"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { hasPlatformHistory } from "@/lib/navigation/history-depth";
import { MAIN_NAV, activeNavHref, roleLabel } from "@/lib/navigation/main-nav";
import { backFallback } from "@/lib/navigation/page-shortcuts";
import type { Locale } from "@/types/i18n";

/**
 * The one header of the platform: the same brand, navigation, language switch, profile and sign-out on every page
 * after sign-in. A page may pass the role it already knows; otherwise the header asks the server once.
 */
export function JenanHeader({
  locale,
  systemRole,
  userLabel,
}: {
  locale: Locale;
  systemRole?: string;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const pathname = usePathname();
  const router = useRouter();
  const [fetchedRole, setFetchedRole] = useState<string | undefined>(undefined);
  const role = systemRole ?? fetchedRole;

  useEffect(() => {
    if (systemRole) return;
    const controller = new AbortController();
    fetch("/api/auth/admin-access", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ role?: string }>) : null))
      .then((payload) => { if (payload?.role) setFetchedRole(payload.role); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [systemRole]);

  const active = activeNavHref(pathname);
  const canAdminister = role === "ADMIN" || role === "SUPER_ADMIN";
  const initial = Array.from(userLabel.trim())[0]?.toUpperCase() ?? "";

  return (
    <header className="jenan-header" data-testid="jenan-header" dir="ltr">
      <Link className="jenan-header__brand" href="/dashboard" aria-label="Jenan PRO">
        <span aria-hidden="true"><i /><i /></span>
        <strong>Jenan <b>PRO</b></strong>
      </Link>
      <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"} dir={ar ? "rtl" : "ltr"}>
        {MAIN_NAV.map((item) => (
          <Link
            aria-current={item.href === active ? "page" : undefined}
            className={item.href === active ? "is-active" : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label[ar ? 0 : 1]}
          </Link>
        ))}
        {canAdminister ? (
          <Link className="is-admin" data-testid="home-admin-link" href="/admin">
            <Icon name="shield" />
            {ar ? "الإدارة" : "Admin"}
          </Link>
        ) : null}
      </nav>
      <div className="jenan-header__tools">
        {pathname === "/dashboard" ? null : (
          <button
            className="jenan-header__back"
            data-testid="header-back"
            onClick={() => (hasPlatformHistory() ? router.back() : router.push(backFallback(pathname, true)))}
            type="button"
          >
            <Icon name="arrow" />
            <span>{ar ? "رجوع" : "Back"}</span>
          </button>
        )}
        <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
        <button
          aria-label={ar ? "الإشعارات غير متاحة حاليًا" : "Notifications are currently unavailable"}
          className="jenan-header__bell"
          disabled
          type="button"
        >
          <Icon name="bell" />
        </button>
        <Link className="jenan-header__profile" href="/user" aria-label={ar ? "حسابي" : "My account"}>
          <span aria-hidden="true" className="jenan-header__avatar">{initial}</span>
          <span className="jenan-header__identity" dir={ar ? "rtl" : "ltr"}>
            <span className="user-chip" title={userLabel}>{userLabel}</span>
            <small data-testid="home-role-label">{roleLabel(role, ar ? 0 : 1)}</small>
          </span>
        </Link>
        <LogoutButton label={ar ? "خروج" : "Logout"} />
      </div>
    </header>
  );
}
