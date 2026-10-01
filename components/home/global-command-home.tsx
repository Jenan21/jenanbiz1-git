"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  GatewayWorldMap,
  type GatewayActivityLocation,
} from "@/components/auth/gateway-world-map";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

interface ActivityPayload {
  activeUsers: number;
  generatedAt: string;
  locations: GatewayActivityLocation[];
  sourceState?: "LIVE" | "UNAVAILABLE";
  windowMinutes: number;
}

interface HomeServiceCard {
  accent: "blue" | "cyan" | "gold" | "indigo" | "purple" | "teal";
  description: string;
  href: string;
  icon: IconName;
  title: string;
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
  const [activitySource, setActivitySource] = useState<
    "LOADING" | "LIVE_PLATFORM_ACTIVITY" | "UNAVAILABLE"
  >("LOADING");
  const serviceCount = modules.reduce(
    (total, module) => total + module.services.length,
    0,
  );
  const topLocations = activity.locations.slice(0, 4);
  const serviceCards: HomeServiceCard[] = [
    {
      accent: "teal",
      description: ar
        ? "خطط الحملات وتابع نمو أعمالك"
        : "Plan campaigns and track business growth",
      href: "/marketing",
      icon: "megaphone",
      title: ar ? "التسويق" : "Marketing",
    },
    {
      accent: "purple",
      description: ar
        ? "مواهب وفرص عمل في مختلف المجالات"
        : "Talent and opportunities across industries",
      href: "/talent",
      icon: "people",
      title: ar ? "الوظائف" : "Careers",
    },
    {
      accent: "indigo",
      description: ar
        ? "فرص وأسواق عالمية للنمو والاستثمار"
        : "Global markets and growth opportunities",
      href: "/market",
      icon: "trend",
      title: ar ? "السوق" : "Market",
    },
    {
      accent: "gold",
      description: ar
        ? "أدوات تشغيل ونمو للأعمال"
        : "Tools for business operations and growth",
      href: "/software",
      icon: "building",
      title: ar ? "البرمجيات" : "Software",
    },
    {
      accent: "cyan",
      description: ar
        ? "دورات ودراسات وبحوث متخصصة"
        : "Courses, studies, and focused research",
      href: "/academy",
      icon: "graduation",
      title: ar ? "الأكاديمية" : "Academy",
    },
    {
      accent: "blue",
      description: ar
        ? "تحليل وتقييم ودراسة جدوى ودعم مشروع"
        : "Analysis, evaluation, feasibility, and launch support",
      href: "/projects",
      icon: "briefcase",
      title: ar ? "المشاريع" : "Projects",
    },
  ];
  const assurances = [
    {
      icon: "globe" as const,
      note: ar ? "في اقتصاد واحد" : "In one economy",
      title: ar ? "فرص عالمية" : "Global opportunity",
    },
    {
      icon: "rocket" as const,
      note: ar ? "للتطوير والاستثمار" : "For growth and investment",
      title: ar ? "أدوات متقدمة" : "Advanced tools",
    },
    {
      icon: "people" as const,
      note: ar ? "من الخبراء والمستثمرين" : "Experts and investors",
      title: ar ? "مجتمع داعم" : "Supportive community",
    },
    {
      icon: "shield" as const,
      note: ar ? "لقرارات أفضل" : "For better decisions",
      title: ar ? "بيانات دقيقة" : "Trusted data",
    },
  ];
  const liveActivity =
    activitySource === "LIVE_PLATFORM_ACTIVITY" ? activity : null;
  const distributionColors = ["#24c7ff", "#1de0c1", "#f2c84f", "#ff865c"];
  let distributionPosition = 0;
  const distributionGradient =
    liveActivity && liveActivity.activeUsers > 0
      ? `conic-gradient(${liveActivity.locations
          .slice(0, 4)
          .map((location, index) => {
            const start = distributionPosition;
            distributionPosition +=
              (location.activeUsers / liveActivity.activeUsers) * 100;
            return `${distributionColors[index % distributionColors.length]} ${start}% ${distributionPosition}%`;
          })
          .join(", ")})`
      : "conic-gradient(#174055 0 100%)";

  useEffect(() => {
    const controller = new AbortController();
    async function refreshActivity() {
      try {
        const response = await fetch("/api/platform/activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          setActivitySource("UNAVAILABLE");
          return;
        }
        const payload = (await response.json()) as ActivityPayload;
        setActivity(payload);
        setActivitySource(
          payload.sourceState === "UNAVAILABLE"
            ? "UNAVAILABLE"
            : "LIVE_PLATFORM_ACTIVITY",
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActivitySource("UNAVAILABLE");
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
    <main
      className="global-home"
      data-home-access="PUBLIC"
      data-home-catalog="PLATFORM_CATALOG"
      data-home-privacy="PUBLIC_AGGREGATE"
      data-home-route="/"
      data-home-screen="home"
      data-home-source={activitySource}
    >
      <div className="global-home__stage">
        <header className="global-home__header">
          <Link className="global-home__brand" href="/" aria-label="Jenan PRO">
            <span className="global-home__brand-mark" aria-hidden="true">
              <Icon name="grid" />
            </span>
            <strong>
              Jenan <b>PRO</b>
            </strong>
          </Link>

          <nav aria-label={ar ? "التنقل الرئيسي" : "Primary navigation"}>
            <Link href="/account">
              <Icon name="wallet" />
              {ar ? "بياناتي" : "My account"}
            </Link>
            <Link href="/marketing">
              <Icon name="megaphone" />
              {ar ? "التسويق" : "Marketing"}
            </Link>
            <Link href="/talent">
              <Icon name="people" />
              {ar ? "الموظفون" : "Talent"}
            </Link>
            <Link href="/market">
              <Icon name="barChart" />
              {ar ? "السوق" : "Market"}
            </Link>
            <Link href="/academy">
              <Icon name="graduation" />
              {ar ? "الأكاديميات" : "Academy"}
            </Link>
            <Link href="/projects">
              <Icon name="briefcase" />
              {ar ? "المشاريع" : "Projects"}
            </Link>
            <Link className="global-home__nav-active" href="/">
              <Icon name="grid" />
              {ar ? "الرئيسية" : "Home"}
            </Link>
          </nav>

          <div className="global-home__tools">
            <Link className="global-home__search" href="/market">
              <span>{ar ? "ابحث عن محتوى أو فرصة..." : "Search content or opportunity..."}</span>
              <Icon name="search" />
            </Link>
            <LanguageSwitcher
              locale={locale}
              label={ar ? "العربية" : "English"}
              showChevron
            />
            <Link className="global-home__account" href="/auth">
              <span>
                <b>{ar ? "تسجيل الدخول" : "Sign in"}</b>
                <small>{ar ? "وصول آمن" : "Secure access"}</small>
              </span>
              <i aria-hidden="true">
                <Icon name="user" />
              </i>
            </Link>
          </div>
        </header>

        <section className="global-home__hero">
          <div className="global-home__hero-visual" aria-hidden="true">
            <div className="global-home__hero-globe">
              <GatewayWorldMap activity={activity.locations} locale={locale} />
            </div>
            <div className="global-home__hero-routes">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="global-home__hero-locations">
              {topLocations.map((location) => (
                <span key={location.countryCode}>
                  <small>{location.countryName[locale]}</small>
                  <b>+{location.activeUsers}</b>
                </span>
              ))}
            </div>
          </div>

          <div className="global-home__hero-copy">
            <span className="global-home__eyebrow">
              {ar
                ? "منصة عالمية لرواد الأعمال والمستثمرين"
                : "A global platform for business and investment"}
            </span>
            <h1>
              {ar ? (
                <>
                  مستقبل الأعمال <em>يبدأ من هنا</em>
                </>
              ) : (
                <>
                  Your business future <em>starts here</em>
                </>
              )}
            </h1>
            <strong>
              <span>{ar ? "خدمات متكاملة" : "Integrated services"}</span>
              <i />
              <span>{ar ? "تحليلات ذكية" : "Smart analytics"}</span>
              <i />
              <span>{ar ? "فرص عالمية" : "Global opportunity"}</span>
            </strong>
            <p>
              {ar
                ? "منصة Jenan PRO لتمكين الأفراد والشركات من المشاريع والاستثمار والتعليم والبرمجيات، مع بيانات دقيقة وفرص حقيقية للنمو في اقتصاد عالمي مترابط."
                : "Jenan PRO empowers people and companies through projects, investment, learning, and software, backed by trusted data and real global growth opportunities."}
            </p>
            <div className="global-home__hero-actions">
              <Link className="global-home__button global-home__button--primary" href="/benefits">
                <Icon name="grid" />
                {ar ? "استكشف الخدمات" : "Explore services"}
              </Link>
              <Link className="global-home__button" href="/dashboard">
                <Icon name="barChart" />
                {ar ? "لوحة بياناتي" : "My dashboard"}
              </Link>
              <Link className="global-home__button" href="/register">
                <Icon name="rocket" />
                {ar ? "ابدأ الآن" : "Get started"}
              </Link>
            </div>
          </div>

          <aside className="global-home__hero-insights">
            <article>
              <Icon name="trend" />
              <span>
                <small>{ar ? "فرص عالمية" : "Global opportunity"}</small>
                <strong>{serviceCount}</strong>
                <em>{ar ? "خدمة متاحة بالمنصة" : "available services"}</em>
              </span>
            </article>
            <article>
              <Icon name="people" />
              <span>
                <small>{ar ? "مجتمع الأعمال" : "Business community"}</small>
                <strong>
                  {liveActivity ? liveActivity.activeUsers.toLocaleString(locale) : "—"}
                </strong>
                <em>
                  {liveActivity
                    ? ar
                      ? `نشط خلال ${liveActivity.windowMinutes} دقيقة`
                      : `active in ${liveActivity.windowMinutes} minutes`
                    : ar
                      ? "بيانات النشاط غير متاحة"
                      : "Activity unavailable"}
                </em>
              </span>
            </article>
            <article>
              <Icon name="globe" />
              <span>
                <small>{ar ? "شبكة عالمية" : "Global network"}</small>
                <strong>{liveActivity ? liveActivity.locations.length : "—"}</strong>
                <em>{ar ? "مناطق نشطة حالياً" : "active regions"}</em>
              </span>
            </article>
            <p>
              {ar ? (
                <>
                  مستقبل أعمالك
                  <br />
                  يبدأ من هنا
                </>
              ) : (
                <>
                  Build what is next
                  <br />
                  with Jenan PRO
                </>
              )}
            </p>
          </aside>
        </section>

        <section
          className="global-home__services"
          aria-label={ar ? "خدمات Jenan PRO" : "Jenan PRO services"}
        >
          {serviceCards.map((service) => (
            <Link
              className={`global-home__service global-home__service--${service.accent}`}
              href={service.href}
              key={service.href}
            >
              <span className="global-home__service-icon">
                <Icon name={service.icon} />
              </span>
              <strong>{service.title}</strong>
              <p>{service.description}</p>
              <small>
                {ar ? "استكشف المزيد" : "Explore more"}
                <Icon name="arrow" />
              </small>
            </Link>
          ))}
        </section>

        <section className="global-home__dashboard">
          <section
            className="global-home__market-panel"
            data-market-source="UNAVAILABLE"
            aria-label={ar ? "الأسواق العالمية" : "Global markets"}
          >
            <header>
              <h2>{ar ? "الأسواق العالمية" : "Global markets"}</h2>
              <span>{ar ? "الكل" : "All"}</span>
            </header>
            {([
              ["trend", "TASI", ar ? "مؤشر السوق السعودي" : "Saudi market index"],
              ["wallet", "BTC", ar ? "بيتكوين" : "Bitcoin"],
              ["sparkles", "XAU", ar ? "الذهب" : "Gold"],
              ["trend", "DXY", ar ? "مؤشر الدولار" : "US Dollar Index"],
            ] as const).map(([icon, symbol, title]) => (
              <article key={symbol}>
                <Icon name={icon} />
                <span>
                  <b>{symbol}</b>
                  <small>{title}</small>
                </span>
                <strong>—</strong>
                <em>{ar ? "المصدر غير متصل" : "Source unavailable"}</em>
              </article>
            ))}
          </section>

          <section className="global-home__platform-stats">
            <header>
              <h2>{ar ? "إحصائيات المنصة" : "Platform statistics"}</h2>
              <Link href="/benefits">{ar ? "عرض الكل" : "Explore"}</Link>
            </header>
            <div className="global-home__stat-grid">
              <article>
                <Icon name="briefcase" />
                <span>
                  <strong>{serviceCount.toLocaleString(locale)}</strong>
                  <small>{ar ? "خدمة ضمن المنصة" : "platform services"}</small>
                </span>
              </article>
              <article>
                <Icon name="people" />
                <span>
                  <strong>
                    {liveActivity
                      ? liveActivity.activeUsers.toLocaleString(locale)
                      : "—"}
                  </strong>
                  <small>{ar ? "مستخدم نشط" : "active users"}</small>
                </span>
              </article>
              <article>
                <Icon name="globe" />
                <span>
                  <strong>
                    {liveActivity ? liveActivity.locations.length.toLocaleString(locale) : "—"}
                  </strong>
                  <small>{ar ? "مناطق متصلة" : "connected regions"}</small>
                </span>
              </article>
              <article>
                <Icon name="trend" />
                <span>
                  <strong>—</strong>
                  <small>{ar ? "نمو المشاريع" : "project growth"}</small>
                </span>
              </article>
            </div>
          </section>

          <section className="global-home__distribution">
            <header>
              <h2>{ar ? "توزيع المستخدمين" : "User distribution"}</h2>
            </header>
            <div
              className="global-home__donut"
              style={{ background: distributionGradient }}
              aria-hidden="true"
            >
              <span>
                <strong>
                  {liveActivity
                    ? liveActivity.activeUsers.toLocaleString(locale)
                    : "—"}
                </strong>
                <small>{ar ? "نشط" : "active"}</small>
              </span>
            </div>
            <ul>
              {liveActivity?.locations.slice(0, 4).map((location, index) => (
                <li key={location.countryCode}>
                  <i style={{ background: distributionColors[index] }} />
                  <span>{location.countryName[locale]}</span>
                  <b>
                    {liveActivity.activeUsers
                      ? `${Math.round((location.activeUsers / liveActivity.activeUsers) * 100)}%`
                      : "—"}
                  </b>
                </li>
              ))}
              {!liveActivity ? (
                <li className="global-home__distribution-empty">
                  {ar ? "بيانات التوزيع غير متاحة" : "Distribution unavailable"}
                </li>
              ) : null}
            </ul>
          </section>

          <section className="global-home__news">
            <header>
              <h2>{ar ? "أحدث الأخبار والفرص" : "Latest news and opportunities"}</h2>
              <Link href="/market">{ar ? "استكشف السوق" : "Explore market"}</Link>
            </header>
            <div className="global-home__news-empty">
              <span>
                <Icon name="globe" />
              </span>
              <strong>
                {ar ? "الفرص العالمية تبدأ بخطوة" : "Global opportunities start with a step"}
              </strong>
              <p>
                {ar
                  ? "استكشف السوق والمشاريع المنشورة في المنصة."
                  : "Explore market listings and published projects."}
              </p>
              <Link href="/market">{ar ? "تصفح الفرص" : "Browse opportunities"}</Link>
            </div>
          </section>
        </section>

        <section className="global-home__ecosystem">
          <div className="global-home__assurances">
            {assurances.map((item) => (
              <span key={item.title}>
                <Icon name={item.icon} />
                <i>
                  <b>{item.title}</b>
                  <small>{item.note}</small>
                </i>
              </span>
            ))}
          </div>
        </section>

        <footer className="global-home__footer">
          <Link className="global-home__footer-brand" href="/" aria-label="Jenan PRO">
            Jenan <b>PRO</b>
            <small>{ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}</small>
          </Link>
          <p>
            {ar
              ? "© 2026 جنان برو. جميع الحقوق محفوظة."
              : "© 2026 Jenan PRO. All rights reserved."}
          </p>
          <nav aria-label={ar ? "روابط المنصة" : "Platform links"}>
            <Link href="/benefits">{ar ? "حول المنصة" : "About"}</Link>
            <Link href="/benefits">{ar ? "الخصوصية" : "Privacy"}</Link>
            <Link href="/benefits">{ar ? "الشروط" : "Terms"}</Link>
          </nav>
          <span className="global-home__sr-only">
            {ar
              ? `${serviceCount} خدمة في كتالوج المنصة، ${
                  liveActivity?.activeUsers ?? "بيانات النشاط غير متاحة"
                } مستخدم نشط.`
              : `${serviceCount} catalog services and ${
                  liveActivity?.activeUsers ?? "unavailable activity"
                } active users.`}
          </span>
        </footer>
      </div>
    </main>
  );
}
