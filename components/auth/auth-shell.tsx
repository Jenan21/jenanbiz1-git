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
import { Icon } from "@/components/ui/icons";
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
          <AuthServiceCarousel locale={props.locale} />
          <div className="auth-card glass">
            <div className="auth-brand">
              <span className="eyebrow">
                <Icon name="sparkles" />
                {props.eyebrow}
              </span>
              <h1>{props.title}</h1>
              <p>{props.subtitle}</p>
            </div>
            {props.children}
            <p className="auth-alternate">
              {props.alternateText}{" "}
              <Link href={props.alternateHref}>{props.alternateLabel}</Link>
            </p>
          </div>
          <aside className="activity-panel glass card">
            <div className="card-title">
              {ar ? "خريطة النشاط العالمي" : "Global activity map"}
            </div>
            <div className="mini-map">
              <WorldNetwork />
            </div>
            <div className="notice">
              <strong>
                {ar ? "غير متاح حاليًا" : "Currently unavailable"}
              </strong>
              <br />
              {ar
                ? "تظهر البيانات بعد ربط مزود التحليلات الحقيقي."
                : "Data appears after a real analytics provider is connected."}
            </div>
          </aside>
        </section>
        <MarketUnavailable locale={props.locale} />
      </div>
    </main>
  );
}
