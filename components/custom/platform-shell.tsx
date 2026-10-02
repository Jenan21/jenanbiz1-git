"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

export function JenanLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brandmark" aria-label="Jenan Pro home">
      <Image className="brandmark__logo brandmark__logo--image" src="/assets/jenan-pro-logo.jpg" alt="" width={160} height={98} />
      <span className="brandmark__text">
        <strong>Jenan Pro</strong>
        {!compact && <small>Global business platform</small>}
      </span>
    </Link>
  );
}

export function ThemeToggle({ label, switchStyle = false }: { label: string; switchStyle?: boolean }) {
  const [theme, setTheme] = useState<"balanced-dark" | "light">(() => {
    if (typeof window === "undefined") return "balanced-dark";
    return localStorage.getItem("jenan-theme") === "light" ? "light" : "balanced-dark";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggle() {
    const next = theme === "light" ? "balanced-dark" : "light";
    setTheme(next);
    localStorage.setItem("jenan-theme", next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <button type="button" onClick={toggle} className={`btn small ghost ${switchStyle ? "theme-switch" : ""}`} aria-label={label} aria-pressed={theme === "light"}>
      <Icon name={theme === "light" ? "moon" : "sparkles"} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

const platformNav = [
  ["/dashboard", "الرئيسية", "Home"],
  ["/projects", "المشاريع", "Projects"],
  ["/academy", "الأكاديمية", "Academy"],
  ["/market", "السوق", "Market"],
  ["/studio", "الأدوات", "Tools"],
  ["/software", "البرمجيات", "Software"],
  ["/robotics", "الروبوتات", "Robotics"],
  ["/programs", "البرامج", "Programs"],
  ["/talent", "المواهب", "Talent"],
  ["/marketing", "التسويق", "Marketing"],
] as const;

const adminNav = [
  ["/admin", "القيادة", "Command"],
  ["/admin/dashboard", "لوحة التحكم", "Dashboard"],
  ["/admin/data-center", "مركز البيانات", "Data Center"],
  ["/admin/global-health", "الصحة العامة", "Global Health"],
  ["/admin/users", "المستخدمون", "Users"],
] as const;

export function PlatformShell({
  locale,
  activeRoute,
  userLabel,
  admin = false,
  children,
}: {
  locale: Locale;
  activeRoute: string;
  userLabel: string;
  admin?: boolean;
  children: ReactNode;
}) {
  const ar = locale === "ar";
  const navigation = admin ? adminNav : platformNav;

  return (
    <div className="custom-platform">
      <div className="shell custom-shell">
        <header className="platform-header glass">
          <JenanLogo />

          <nav className="main-nav" aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
            {navigation.map(([href, arabic, english]) => (
              <Link
                href={href}
                key={href}
                className={`nav-link ${activeRoute === href ? "active" : ""}`}
                aria-current={activeRoute === href ? "page" : undefined}
              >
                {ar ? arabic : english}
              </Link>
            ))}
          </nav>

          <div className="top-tools">
            <ThemeToggle label={ar ? "المظهر" : "Theme"} />
            <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
            <span className="user-chip">{userLabel}</span>
            <LogoutButton
              label={ar ? "خروج" : "Logout"}
              errorMessage={
                ar
                  ? "تعذر تسجيل الخروج. تحقق من اتصالك وحاول مجددًا."
                  : "Could not log out. Check your connection and try again."
              }
            />
          </div>
        </header>

        <main className="platform-body">{children}</main>

        <div className="bottom-ticker glass market-unavailable">
          <div className="ticker-label">
            {ar ? "المنصة" : "Platform"}
            <span>{ar ? "واجهة مخصصة" : "Custom interface"}</span>
          </div>
          <div className="ticker-track">
            {["Jenan Pro", "Operations", "AI", "Growth", "Finance"].map((item) => (
              <div className="ticker-item" key={item}>
                <strong>{item}</strong>
                <span>•</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketUnavailable({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <div className="bottom-ticker glass market-unavailable">
      <div className="ticker-label">
        {ar ? "الأسواق" : "Markets"}
        <span>{ar ? "مخطط حقيقي" : "Real data"}</span>
      </div>
      <div className="ticker-track">
        {"Jenan Pro • Operations • AI • Growth • Finance".split(" • ").map((item) => (
          <div className="ticker-item" key={item}>
            <strong>{item}</strong>
            <span>—</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyMetric({ label, note }: { label: string; note: string }) {
  return (
    <div className="card stat-card">
      <div className="metric-label">{label}</div>
      <div className="placeholder-value">
        <b>—</b> {note}
      </div>
      <div className="spark-line" aria-hidden="true" />
    </div>
  );
}

export function FeatureCard({
  icon,
  title,
  description,
  status,
}: {
  icon: IconName;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <article className="card feature-card">
      <div className="feature-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="badge">{status}</span>
    </article>
  );
}

export function EmptyPanel({
  title,
  message,
  icon = "activity",
}: {
  title: string;
  message: string;
  icon?: IconName;
}) {
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <Icon name={icon} />
          </span>
          <p>{message}</p>
        </div>
      </div>
    </section>
  );
}
