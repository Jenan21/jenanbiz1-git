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
import { GlowLines } from "@/components/ui/glow-lines";
import { MarketTicker } from "@/components/ui/market-ticker";
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
    <main className="auth-page source-app" dir={ar ? "rtl" : "ltr"}>
      {/* Ambient background layers */}
      <div className="auth-bg-glow auth-bg-glow--a" aria-hidden="true" />
      <div className="auth-bg-glow auth-bg-glow--b" aria-hidden="true" />
      <div className="grid-plane" aria-hidden="true" />

      <div className="shell auth-shell">
        {/* ── Header ── */}
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

        {/* ── World network background ── */}
        <div className="world-layer" aria-hidden="true">
          <WorldNetwork />
        </div>

        {/* ── Glow connector lines (decorative) ── */}
        <div className="auth-glow-overlay" aria-hidden="true">
          <GlowLines idPrefix="auth" />
        </div>

        {/* ── Three-zone stage ── */}
        <section className="auth-stage">
          {/* Left — service carousel */}
          <aside
            className="auth-zone auth-zone--left"
            aria-label={ar ? "خدمات المنصة" : "Platform services"}
          >
            <AuthServiceCarousel locale={props.locale} />
          </aside>

          {/* Center — auth card */}
          <div className="auth-zone auth-zone--center">
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
          </div>

          {/* Right — analytics + market panel */}
          <aside
            className="auth-zone auth-zone--right"
            aria-label={ar ? "لوحة الأسواق" : "Market panel"}
          >
            {/* Activity map mini panel */}
            <div className="activity-panel glass card">
              <div className="ds-panel__header">
                <span className="ds-panel__title">
                  {ar ? "خريطة النشاط العالمي" : "Global activity map"}
                </span>
                <span className="ds-pill ds-pill--live">
                  {ar ? "مباشر" : "Live"}
                </span>
              </div>
              <div className="mini-map">
                <WorldNetwork />
              </div>
              <div className="notice">
                <strong>
                  {ar ? "يتطلب مزود بيانات" : "Provider required"}
                </strong>
                <br />
                {ar
                  ? "تظهر البيانات بعد ربط مزود التحليلات الحقيقي."
                  : "Data appears after connecting a real analytics provider."}
              </div>
            </div>

            {/* Market ticker panel */}
            <div className="auth-market-panel glass">
              <div
                className="ds-panel__header"
                style={{ padding: "12px 12px 0" }}
              >
                <span className="ds-panel__title">
                  {ar ? "مؤشرات السوق" : "Market indicators"}
                </span>
                <span className="ds-pill ds-pill--brand">
                  {ar ? "بيانات تأشيرية" : "Indicative"}
                </span>
              </div>
              <MarketTicker locale={props.locale} />
            </div>
          </aside>
        </section>

        <MarketUnavailable locale={props.locale} />
      </div>
    </main>
  );
}
