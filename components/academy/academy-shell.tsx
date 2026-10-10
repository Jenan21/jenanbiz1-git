import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

const platformNavigation: ReadonlyArray<{
  href: string;
  icon: IconName;
  label: Copy;
}> = [
  { href: "/dashboard", icon: "dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", icon: "briefcase", label: ["المشاريع", "Projects"] },
  { href: "/academy", icon: "graduation", label: ["الأكاديمية", "Academy"] },
  { href: "/studio", icon: "grid", label: ["الأدوات", "Tools"] },
  { href: "/talent", icon: "people", label: ["التوظيف", "Talent"] },
  { href: "/market", icon: "barChart", label: ["سوق جنان", "Jenan Market"] },
  { href: "/marketing", icon: "megaphone", label: ["التسويق", "Marketing"] },
  { href: "/user", icon: "user", label: ["حسابي", "Account"] },
];

function pick(copy: Copy, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

export function AcademyShell({
  activeRoute,
  children,
  locale,
  userLabel,
}: {
  activeRoute: string;
  children: ReactNode;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const initial = userLabel.trim().charAt(0).toLocaleUpperCase() || "J";

  return (
    <div className="academy-portal" dir={ar ? "rtl" : "ltr"}>
      <aside className="academy-portal__sidebar">
        <Link className="academy-portal__brand" href="/dashboard" aria-label="Jenan Pro">
          <span><Icon name="barChart" /></span>
          <strong>Jenan <b>PRO</b></strong>
          <small>{ar ? "جنان برو" : "Business platform"}</small>
        </Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {platformNavigation.map((item) => (
            <Link
              className={item.href === "/academy" ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              <Icon name={item.icon} />
              <span>{pick(item.label, locale)}</span>
            </Link>
          ))}
        </nav>
        <div className="academy-portal__sidebar-note">
          <Icon name="shield" />
          <div>
            <strong>{ar ? "محتوى موثوق" : "Trusted content"}</strong>
            <small>{ar ? "تعرض المنصة السجلات المعتمدة فقط" : "Only approved records are shown"}</small>
          </div>
        </div>
      </aside>

      <header className="academy-portal__topbar">
        <form action="/academy/search" className="academy-portal__search" method="get">
          <Icon name="search" />
          <input
            aria-label={ar ? "البحث في الأكاديمية" : "Search the academy"}
            name="query"
            placeholder={ar ? "ابحث في الأكاديمية..." : "Search the academy..."}
            type="search"
          />
        </form>
        <div className="academy-portal__tools">
          <Link href="/academy/downloads" aria-label={ar ? "المكتبة والتنزيلات" : "Library and downloads"}>
            <Icon name="grid" />
          </Link>
          <button disabled type="button" aria-label={ar ? "لا توجد تنبيهات جديدة" : "No new notifications"}>
            <Icon name="bell" />
          </button>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <Link className="academy-portal__identity" href="/academy/profile">
            <span>{initial}</span>
            <div>
              <strong>{userLabel}</strong>
              <small>{ar ? "متعلم" : "Learner"}</small>
            </div>
          </Link>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>

      <main className="academy-portal__main">
        <AcademySectionNav activeRoute={activeRoute} locale={locale} />
        {children}
      </main>
    </div>
  );
}
