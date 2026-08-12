import Link from "next/link";
import type { ReactNode } from "react";
import {
  AuthServiceCarousel,
  ThemeToggle,
} from "@/components/source/source-controls";
import {
  JenanLogo,
  MarketUnavailable,
  WorldNetwork,
} from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

interface AuthShellProps {
  locale: Locale;
  languageLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  alternateText: string;
  alternateLabel: string;
  alternateHref: string;
  children: ReactNode;
}

export function AuthShell(props: AuthShellProps) {
  const ar = props.locale === "ar";
  const loginActive = props.alternateHref === "/register";
  const activityItems: Array<[IconName, string]> = [
    ["globe", ar ? "الدول المتصلة" : "Connected countries"],
    ["people", ar ? "المشاريع النشطة" : "Active projects"],
    ["briefcase", ar ? "الشركات المسجلة" : "Registered companies"],
  ];

  return (
    <main className="auth-page source-app">
      <div className="shell auth-shell">
        <header className="auth-top">
          <JenanLogo />
          <div className="top-tools">
            <ThemeToggle label={ar ? "المظهر" : "Theme"} />
            <LanguageSwitcher
              locale={props.locale}
              label={props.languageLabel}
            />
          </div>
        </header>
        <div className="world-layer">
          <WorldNetwork />
        </div>
        <section className="auth-stage">
          <div className="auth-services-panel glass">
            <h2>
              {ar
                ? "جميع خدماتك في منصة واحدة"
                : "All your services in one platform"}
            </h2>
            <AuthServiceCarousel locale={props.locale} />
          </div>
          <div className="auth-card glass">
            <div className="auth-brand">
              <span className="eyebrow">
                <Icon name="sparkles" />
                {props.eyebrow}
              </span>
              <h1>{props.title}</h1>
              <p>{props.subtitle}</p>
            </div>
            <nav
              className="auth-tabs"
              aria-label={ar ? "الدخول والتسجيل" : "Sign in and registration"}
            >
              <Link
                className={`auth-tab ${loginActive ? "active" : ""}`}
                href="/login"
              >
                {ar ? "تسجيل الدخول" : "Sign in"}
              </Link>
              <Link
                className={`auth-tab ${!loginActive ? "active" : ""}`}
                href="/register"
              >
                {ar ? "إنشاء حساب" : "Create account"}
              </Link>
            </nav>
            {props.children}
            <p className="auth-alternate">
              {props.alternateText}{" "}
              <Link href={props.alternateHref}>{props.alternateLabel}</Link>
            </p>
          </div>
          <aside className="activity-panel glass card">
            <div className="auth-panel-heading">
              <div className="card-title">
                {ar ? "نشاط عالمي مباشر" : "Live global activity"}
              </div>
              <span className="availability-dot">
                {ar ? "غير متاح" : "Unavailable"}
              </span>
            </div>
            <div className="mini-map">
              <WorldNetwork />
            </div>
            <div className="activity-locations">
              {[
                ar ? "نيويورك" : "New York",
                ar ? "الرياض" : "Riyadh",
                ar ? "لندن" : "London",
                ar ? "طوكيو" : "Tokyo",
              ].map((city) => (
                <div key={city}>
                  <b>{city}</b>
                  <span>{ar ? "غير متاح" : "Unavailable"}</span>
                </div>
              ))}
            </div>
            <div className="activity-empty-grid">
              {activityItems.map(([icon, label]) => (
                <div key={label}>
                  <Icon name={icon} />
                  <span>{label}</span>
                  <strong>—</strong>
                </div>
              ))}
            </div>
          </aside>
        </section>
        <MarketUnavailable locale={props.locale} />
      </div>
    </main>
  );
}
