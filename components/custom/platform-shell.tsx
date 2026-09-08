"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

export function JenanLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brandmark" aria-label="Jenan BIZ home">
      <span className="brandmark__logo">J</span>
      <span className="brandmark__text">
        <strong>Jenan BIZ</strong>
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

export function WorldNetwork() {
  const points = [[173, 151], [254, 257], [459, 150], [489, 240], [625, 153], [714, 273]];

  return (
    <svg viewBox="0 0 900 420" aria-hidden="true" className="world-svg">
      <g fill="none" stroke="currentColor">
        <ellipse cx="450" cy="210" rx="390" ry="150" opacity=".16" />
        <ellipse cx="450" cy="210" rx="390" ry="75" opacity=".1" />
        <path d="M63 210h774" opacity=".1" />
      </g>
      <g fill="currentColor" opacity=".18">
        <path d="M105 142 150 105l58 9 34 28-17 35-40 7-25 48-50-17-20-34z" />
        <path d="M238 226 277 217l30 21-7 36-23 36-13 60-29 20-19-31 12-44-18-36z" />
        <path d="M380 128 430 105l55 11 36 35-28 24-35-7-17 20-43-10-26-24z" />
        <path d="M433 190 481 188l38 34 7 47-36 52-35-24-21-46-30-27z" />
        <path d="M520 113 620 94l90 27 35 35-27 25-55-11-28 22-49-9-21-33-53-11z" />
        <path d="M666 246 714 231l42 17 19 31-25 30-44-4-30-24z" />
      </g>
      <g fill="var(--brand)">
        {points.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />)}
      </g>
      <g fill="none" stroke="var(--brand)" opacity=".55">
        <path d="M173 151 Q330 35 459 150" />
        <path d="M459 150 Q560 80 625 153" />
        <path d="M625 153 Q735 178 714 273" />
        <path d="M254 257 Q352 175 459 150" />
        <path d="M489 240 Q585 175 714 273" />
      </g>
    </svg>
  );
}

const services = [
  ["activity", "تحليل المشاريع", "Project intelligence"],
  ["briefcase", "دراسة الجدوى", "Feasibility studies"],
  ["people", "أكاديمية جنان", "Jenan Academy"],
  ["wallet", "سوق جنان", "Jenan Market"],
  ["settings", "Jenan Studio", "Creative studio"],
  ["user", "Jenan Talent", "Talent intelligence"],
  ["grid", "Jenan Software", "Business software"],
  ["sparkles", "الإعلان والتسويق", "Marketing & growth"],
] as const;

export function AuthServiceCarousel({ locale }: { locale: "ar" | "en" }) {
  return (
    <aside className="auth-services" aria-label="Jenan BIZ services">
      {services.slice(0, 4).map(([icon, arLabel, enLabel]) => (
        <div className="service-card card" key={icon}>
          <div className="service-orb">
            <Icon name={icon} />
          </div>
          <div>
            <h3>{locale === "ar" ? arLabel : enLabel}</h3>
            <p>
              {locale === "ar"
                ? "واجهة مخصصة لمنصة Jenan BIZ مع تجربة أعمال متكاملة."
                : "Custom interface for the Jenan BIZ platform with a unified business experience."}
            </p>
          </div>
        </div>
      ))}
    </aside>
  );
}

const platformNav = [
  ["/dashboard", "الرئيسية", "Home"],
  ["/projects", "المشاريع", "Projects"],
  ["/academy", "الأكاديمية", "Academy"],
  ["/market", "السوق", "Market"],
  ["/software", "البرمجيات", "Software"],
  ["/programs", "البرامج", "Programs"],
  ["/talent", "المواهب", "Talent"],
  ["/marketing", "التسويق", "Marketing"],
  ["/funding-eligibility", "برامج جنان", "Jenan Programs"],
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
            <Link href="/login" className="btn small secondary">
              {ar ? "خروج" : "Logout"}
            </Link>
          </div>
        </header>

        <main className="platform-body">{children}</main>

        <div className="bottom-ticker glass market-unavailable">
          <div className="ticker-label">
            {ar ? "المنصة" : "Platform"}
            <span>{ar ? "واجهة مخصصة" : "Custom interface"}</span>
          </div>
          <div className="ticker-track">
            {["Jenan BIZ", "Operations", "AI", "Growth", "Finance"].map((item) => (
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
        {"Jenan BIZ • Operations • AI • Growth • Finance".split(" • ").map((item) => (
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
