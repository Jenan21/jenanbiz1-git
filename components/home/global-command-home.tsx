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
        ? "إدارة الاستثمارات والفرص ونتائج الأداء"
        : "Manage investments, opportunities, and performance",
      href: "/account",
      icon: "barChart",
      title: ar ? "بياناتي الاستثمارية" : "My investment data",
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
            <Link href="/benefits">{ar ? "من نحن" : "About"}</Link>
            <Link href="/talent">{ar ? "الوظائف" : "Careers"}</Link>
            <Link href="/market">{ar ? "السوق" : "Market"}</Link>
            <Link href="/software">{ar ? "البرمجيات" : "Software"}</Link>
            <Link href="/academy">{ar ? "الأكاديمية" : "Academy"}</Link>
            <Link href="/projects">{ar ? "المشاريع" : "Projects"}</Link>
            <Link className="global-home__nav-active" href="/">
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
            <GatewayWorldMap activity={activity.locations} locale={locale} />
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
            <h1>
              {ar ? (
                <>
                  مستقبل أعمالك يبدأ <em>من هنا</em>
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

        <section className="global-home__ecosystem">
          <div className="global-home__ecosystem-copy">
            <small>
              {ar ? "استكشف عوالم " : "Explore "}
              <b>Jenan PRO</b>
            </small>
            <h2>{ar ? "شريكك الاستراتيجي لنمو أعمالك" : "Your strategic growth partner"}</h2>
            <p>
              {ar
                ? "من الفكرة إلى التوسع، نتائج أوضح في منظومة واحدة."
                : "From idea to scale, clearer results in one ecosystem."}
            </p>
          </div>
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
          <Link className="global-home__video" href="/benefits">
            <span>
              <Icon name="arrow" />
            </span>
            <b>{ar ? "شاهد كيف تعمل المنصة" : "See how the platform works"}</b>
            <small>{ar ? "دقيقتان فقط" : "Two minutes"}</small>
          </Link>
        </section>

        <section
          className="global-home__markets"
          data-market-source="UNAVAILABLE"
          aria-label={ar ? "مؤشرات الأسواق" : "Market indicators"}
        >
          {([
            ["trend", ar ? "الأسهم العالمية" : "Global equities", "S&P 500"],
            ["sparkles", ar ? "المعادن النفيسة" : "Precious metals", "XAU/USD"],
            ["wallet", ar ? "العملات الرقمية" : "Digital assets", "BTC/USD"],
          ] as const).map(([icon, title, symbol], index) => (
            <article key={symbol}>
              <Icon name={icon} />
              <span>
                <b>{title}</b>
                <small>{symbol}</small>
              </span>
              <strong>—</strong>
              <div className={`global-home__spark global-home__spark--${index + 1}`} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <em>{ar ? "المصدر غير متصل" : "Source unavailable"}</em>
            </article>
          ))}
        </section>

        <span className="global-home__sr-only">
          {ar
            ? `${serviceCount} خدمة في كتالوج المنصة، ${activity.activeUsers} مستخدم نشط خلال ${activity.windowMinutes} دقيقة.`
            : `${serviceCount} catalog services and ${activity.activeUsers} active users in the last ${activity.windowMinutes} minutes.`}
        </span>
      </div>
    </main>
  );
}
