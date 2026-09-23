"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import countries from "world-countries";

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

const distributionColors = ["#1fe7ff", "#59f3ff", "#4df6a2", "#8a63ff", "#f0c85b"];

const countryRegions = new Map(
  countries.map((country) => [
    country.cca2,
    { region: country.region, subregion: country.subregion },
  ]),
);

const activityRegions = [
  { id: "north-america", ar: "أمريكا الشمالية", en: "North America" },
  { id: "europe", ar: "أوروبا", en: "Europe" },
  { id: "asia", ar: "آسيا", en: "Asia" },
  { id: "south-america", ar: "أمريكا الجنوبية", en: "South America" },
  { id: "africa", ar: "أفريقيا", en: "Africa" },
  { id: "middle-east", ar: "الشرق الأوسط", en: "Middle East" },
] as const;

function resolveActivityRegion(countryCode: string) {
  const geography = countryRegions.get(countryCode);
  if (!geography) return null;
  if (geography.subregion === "South America") return "south-america";
  if (geography.region === "Americas") return "north-america";
  if (geography.subregion === "Western Asia") return "middle-east";
  if (geography.region === "Europe") return "europe";
  if (geography.region === "Asia") return "asia";
  if (geography.region === "Africa") return "africa";
  return null;
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
  const topLocations = activity.locations.slice(0, 5);
  const regionCounts = new Map(activityRegions.map((region) => [region.id, 0]));
  for (const location of activity.locations) {
    const regionId = resolveActivityRegion(location.countryCode);
    if (regionId) regionCounts.set(regionId, (regionCounts.get(regionId) ?? 0) + location.activeUsers);
  }
  const regionSlots = activityRegions.map((region) => ({
    activeUsers: regionCounts.get(region.id) || null,
    countryCode: region.id,
    countryName: { ar: region.ar, en: region.en },
  }));
  const newsModules = ["projects", "academy", "software"]
    .map((moduleId) => modules.find((module) => module.id === moduleId))
    .filter((module): module is PlatformModuleDefinition => Boolean(module));
  let distributionCursor = 0;
  const distributionGradient = topLocations.length
    ? `conic-gradient(${topLocations.map((location, index) => {
        const start = distributionCursor;
        distributionCursor += (location.activeUsers / Math.max(activity.activeUsers, 1)) * 100;
        return `${distributionColors[index]} ${start}% ${distributionCursor}%`;
      }).join(", ")})`
    : "conic-gradient(rgba(89,243,255,.14) 0 100%)";

  const capabilities = [
    { icon: "barChart" as const, title: ar ? "تحليلات ذكية" : "Smart analytics", note: ar ? "لقرارات أفضل" : "For better decisions" },
    { icon: "globe" as const, title: ar ? "فرص عالمية" : "Global opportunity", note: ar ? "للنمو والتوسع" : "For growth and reach" },
    { icon: "brain" as const, title: ar ? "تقنيات متقدمة" : "Advanced technology", note: ar ? "بذكاء قابل للتوسع" : "Intelligence that scales" },
    { icon: "shield" as const, title: ar ? "بيئة آمنة" : "Secure environment", note: ar ? "لأعمالك وبياناتك" : "For work and data" },
  ];

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
      <div className="global-home__stage">
        <div className="global-home__atmosphere" aria-hidden="true" />

        <header className="global-home__header">
          <Link className="global-home__brand" href="/" aria-label="Jenan Pro">
            <img className="global-home__brand-image" src="/assets/jenan-pro-logo.png" alt="" />
            <span><strong>Jenan <b>Pro</b></strong><small>{ar ? "أعمال أنجح · فرص أكبر" : "Business Without Limits"}</small></span>
          </Link>
          <nav aria-label={ar ? "التنقل الرئيسي" : "Primary navigation"}>
            <Link href="/dashboard">{ar ? "مركز الأمر" : "Command center"}</Link>
            <Link href="/pricing">{ar ? "الأسعار" : "Pricing"}</Link>
            <Link href="/academy">{ar ? "الأكاديمية" : "Academy"}</Link>
            <Link href="/projects">{ar ? "خدماتنا" : "Services"}</Link>
            <Link href="/benefits">{ar ? "من نحن" : "About"}</Link>
          </nav>
          <div className="global-home__tools">
            <Link className="global-home__tool-icon" href="/market" aria-label={ar ? "البحث" : "Search"}><Icon name="search" /></Link>
            <Link className="global-home__tool-icon" href="/login" aria-label={ar ? "الإشعارات" : "Notifications"}><Icon name="bell" /></Link>
            <LanguageSwitcher locale={locale} label={ar ? "العربية" : "English"} showChevron />
          </div>
        </header>

        <section className="global-home__hero-copy">
          <h1>{ar ? <>منصة جنان برو<br />مركز الأعمال الذكي</> : <>Jenan Pro<br />Intelligent Business Command</>}</h1>
          <strong>{ar ? "خدمات متكاملة · تحليلات ذكية · فرص عالمية" : "Integrated services · Smart analytics · Global opportunity"}</strong>
          <p>{ar ? "تمكّن الأفراد والشركات من النمو والتوسع ببيانات دقيقة ورؤى استشرافية وتقنية متقدمة تقودك إلى فرص أكبر." : "Helping people and organizations grow with precise data, forward insight, and advanced technology."}</p>
        </section>

        <section className="global-home__world" aria-label={ar ? "انتشار المنصة العالمي" : "Global platform activity"}>
          <div className="global-home__globe">
            <div className="global-home__earth-texture" aria-hidden="true" />
            <GatewayWorldMap activity={activity.locations} locale={locale} />
            <div className="global-home__network" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </div>
            <div className="global-home__regions">{regionSlots.map((region, index) => <span className={`global-home__region global-home__region--${index + 1}`} data-state={region.activeUsers == null ? "unavailable" : "live"} key={region.countryCode}><b>{copy([region.countryName.ar, region.countryName.en], locale)}</b><strong>{region.activeUsers == null ? "—" : region.activeUsers}</strong><small>{region.activeUsers == null ? (ar ? "بانتظار البيانات" : "Awaiting data") : (ar ? "نشط" : "active")}</small></span>)}</div>
          </div>
          <div className="global-home__city" aria-hidden="true" />
        </section>

        <aside className="global-home__kpis" aria-label={ar ? "مؤشرات المنصة" : "Platform indicators"}>
          <article><Icon name="activity" /><span><strong>{serviceCount}</strong><small>{ar ? "خدمة متاحة" : "Available services"}</small></span></article>
          <article><Icon name="people" /><span><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم نشط" : "Active users"}</small></span></article>
          <article><Icon name="globe" /><span><strong>{activity.locations.length}</strong><small>{ar ? "دول نشطة" : "Active countries"}</small></span></article>
          <blockquote>{ar ? "مستقبل أكثر ازدهاراً يبدأ من هنا" : "A more prosperous future begins here"}</blockquote>
        </aside>

        <section className="global-home__capabilities" aria-label={ar ? "قدرات المنصة" : "Platform capabilities"}>
          {capabilities.map((item) => <article key={item.title}><span><Icon name={item.icon} /></span><strong>{item.title}</strong><small>{item.note}</small></article>)}
        </section>

        <blockquote className="global-home__quote">
          {ar ? <>“نبني جسوراً بين الطموح<br />والفرص العالمية”</> : <>“Building bridges between ambition<br />and global opportunity”</>}
          <cite>Jenan Pro</cite>
        </blockquote>

        <section className="global-home__news">
          <header><h2>{ar ? "أحدث الأخبار والتحديثات" : "Latest news and updates"}</h2><Link href="/dashboard">{ar ? "عرض الكل" : "View all"}<Icon name="arrow" /></Link></header>
          <div>{newsModules.map((module, index) => <Link href={module.route} key={module.id} className={`global-home__news-card global-home__news-card--${index + 1}`}><span><Icon name={module.icon} /></span><small>{copy(module.eyebrow, locale)}</small><strong>{copy(module.title, locale)}</strong><p>{copy(module.signature, locale)}</p></Link>)}</div>
        </section>

        <section className="global-home__stats">
          <h2>{ar ? "إحصائيات المنصة" : "Platform statistics"}</h2>
          <div><article><Icon name="user" /><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم نشط" : "Active users"}</small></article><article><Icon name="trend" /><strong>{activity.locations.length}</strong><small>{ar ? "دول نشطة" : "Active countries"}</small></article><article><Icon name="briefcase" /><strong>{modules.length}</strong><small>{ar ? "قسم رئيسي" : "Main divisions"}</small></article><article><Icon name="wallet" /><strong>{serviceCount}</strong><small>{ar ? "خدمة" : "Services"}</small></article></div>
        </section>

        <section className="global-home__distribution">
          <h2>{ar ? "توزيع المستخدمين" : "User distribution"}</h2>
          <div className="global-home__donut" style={{ "--distribution": distributionGradient } as CSSProperties}><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم" : "users"}</small></div>
          <ul>{topLocations.length ? topLocations.map((location, index) => <li key={location.countryCode}><i style={{ background: distributionColors[index] }} /><span>{copy([location.countryName.ar, location.countryName.en], locale)}</span><b>{Math.round(location.activeUsers / Math.max(activity.activeUsers, 1) * 100)}%</b></li>) : <li className="global-home__empty"><span>{ar ? "لا توجد جلسات نشطة حالياً" : "No active sessions now"}</span></li>}</ul>
        </section>

        <section className="global-home__trust">{([
          ["globe", ar ? "أعمال من أي مكان" : "Work from anywhere", ar ? "على مدار الساعة" : "Around the clock"],
          ["rocket", ar ? "أداء سريع وموثوق" : "Fast and reliable", ar ? "بأحدث التقنيات" : "Modern technology"],
          ["people", ar ? "شبكة فرص عالمية" : "Global opportunity network", ar ? "في مختلف القطاعات" : "Across sectors"],
          ["wallet", ar ? "بيانات دقيقة وموثوقة" : "Accurate trusted data", ar ? "تدعم قراراتك" : "Supports decisions"],
          ["brain", ar ? "ذكاء اصطناعي متقدم" : "Advanced AI", ar ? "يعمل من أجلك" : "Working for you"],
        ] as const).map(([icon, title, note]) => <article key={title}><Icon name={icon} /><span><strong>{title}</strong><small>{note}</small></span></article>)}</section>

        <footer className="global-home__footer"><span className="global-home__footer-brand"><b>Jenan <em>Pro</em></b><small>Business Without Limits</small></span><nav><Link href="/benefits">{ar ? "الخصوصية" : "Privacy"}</Link><Link href="/pricing">{ar ? "الشروط والأحكام" : "Terms"}</Link><Link href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link></nav><span>{ar ? "© 2026 منصة جنان برو. جميع الحقوق محفوظة." : "© 2026 Jenan Pro. All rights reserved."}</span></footer>
      </div>
    </main>
  );
}
