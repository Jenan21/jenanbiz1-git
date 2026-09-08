"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  GatewayWorldMap,
  type GatewayActivityLocation,
} from "@/components/auth/gateway-world-map";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

interface ActivityPayload {
  activeUsers: number;
  generatedAt: string;
  locations: GatewayActivityLocation[];
  windowMinutes: number;
}

function copy(value: readonly [string, string], locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function GlobalCommandHome({
  locale,
  modules,
}: {
  locale: Locale;
  modules: readonly PlatformModuleDefinition[];
}) {
  const ar = locale === "ar";
  const [activity, setActivity] = useState<ActivityPayload>({
    activeUsers: 0,
    generatedAt: "",
    locations: [],
    windowMinutes: 15,
  });
  const serviceCount = modules.reduce(
    (total, module) => total + module.services.length,
    0,
  );

  useEffect(() => {
    const controller = new AbortController();
    async function refreshActivity() {
      try {
        const response = await fetch("/api/platform/activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) setActivity((await response.json()) as ActivityPayload);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to refresh public activity");
        }
      }
    }
    void refreshActivity();
    const interval = window.setInterval(refreshActivity, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="global-home">
      <header className="global-home__header">
        <Link className="global-home__brand" href="/" aria-label="Jenan BIZ">
          <span aria-hidden="true" />
          <strong>Jenan BIZ</strong>
        </Link>
        <div className="global-home__headline">
          <b>{ar ? "منصة جنان بيز" : "Jenan BIZ Platform"}</b>
          <span>{ar ? "مركز الأعمال الذكي" : "Intelligent business command"}</span>
        </div>
        <div className="global-home__tools">
          <span className="global-home__live"><i />{ar ? "المنصة متصلة" : "Platform online"}</span>
          <LanguageSwitcher locale={locale} label={ar ? "English" : "العربية"} showChevron />
        </div>
      </header>

      <section className="global-home__command">
        <aside className="global-home__opportunities">
          <header>
            <span>{ar ? "فرص اليوم" : "Today’s pathways"}</span>
            <Icon name="sparkles" />
          </header>
          {modules.slice(0, 3).map((module, index) => (
            <Link href={module.route} key={module.id}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span><strong>{copy(module.title, locale)}</strong><small>{copy(module.signature, locale)}</small></span>
              <Icon name="arrow" />
            </Link>
          ))}
          <blockquote>{ar ? "كل قرار أوضح يبدأ برؤية أشمل." : "Every clearer decision starts with a wider view."}</blockquote>
        </aside>

        <section className="global-home__map" aria-label={ar ? "انتشار المنصة العالمي" : "Global platform activity"}>
          <GatewayWorldMap activity={activity.locations} locale={locale} />
          <div className="global-home__hero-copy">
            <span>{ar ? "منصة واحدة · أثر بلا حدود" : "One platform · Borderless impact"}</span>
            <h1>{ar ? "مركز أعمالك العالمي" : "Your global business command"}</h1>
            <p>{ar ? "إدارة، معرفة، فرص وخدمات مترابطة في تجربة تشغيل واحدة." : "Operations, knowledge, opportunities, and services in one connected experience."}</p>
          </div>
          <div className="global-home__actions">
            <Link href="/login"><Icon name="user" />{ar ? "تسجيل الدخول" : "Sign in"}</Link>
            <Link href="/register"><Icon name="plus" />{ar ? "إنشاء حساب" : "Create account"}</Link>
          </div>
        </section>

        <aside className="global-home__pulse">
          <header><span><i />{ar ? "نبض المنصة" : "Platform pulse"}</span><small>{ar ? "مباشر" : "Live"}</small></header>
          <div className="global-home__pulse-main">
            <div className="global-home__pulse-ring" style={{ "--pulse-value": `${Math.min(100, activity.activeUsers * 4)}%` } as React.CSSProperties}>
              <strong>{activity.activeUsers}</strong><small>{ar ? "نشط" : "active"}</small>
            </div>
            <dl>
              <div><dt>{ar ? "الأقسام" : "Divisions"}</dt><dd>{modules.length}</dd></div>
              <div><dt>{ar ? "الخدمات" : "Services"}</dt><dd>{serviceCount}</dd></div>
              <div><dt>{ar ? "دول نشطة" : "Active countries"}</dt><dd>{activity.locations.length}</dd></div>
            </dl>
          </div>
          <div className="global-home__pulse-note">
            <Icon name="shield" />
            <span><strong>{ar ? "بيانات تشغيل حقيقية" : "Real operational data"}</strong><small>{ar ? `نشاط آخر ${activity.windowMinutes} دقيقة دون كشف الهوية` : `Last ${activity.windowMinutes} minutes, identity protected`}</small></span>
          </div>
        </aside>
      </section>

      <section className="global-home__modules" aria-label={ar ? "أقسام المنصة" : "Platform divisions"}>
        {modules.map((module) => (
          <Link href={module.route} key={module.id} className="global-home__module">
            <span className="global-home__module-icon"><Icon name={module.icon} /></span>
            <span><small>{module.code}</small><strong>{copy(module.title, locale)}</strong><em>{copy(module.signature, locale)}</em></span>
            <Icon name="arrow" />
          </Link>
        ))}
      </section>

      <footer className="global-home__footer">
        <span><i />{ar ? "Jenan BIZ · منظومة أعمال متصلة" : "Jenan BIZ · Connected business ecosystem"}</span>
        <nav><Link href="/pricing">{ar ? "الباقات" : "Plans"}</Link><Link href="/benefits">{ar ? "المزايا" : "Benefits"}</Link><Link href="/login">{ar ? "الدخول" : "Access"}</Link></nav>
      </footer>
    </main>
  );
}
