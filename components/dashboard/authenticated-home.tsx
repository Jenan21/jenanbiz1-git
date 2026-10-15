import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { HomeScene } from "@/components/dashboard/home-scene";
import { HomeSearch } from "@/components/dashboard/home-search";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { SystemRole } from "@/generated/prisma/client";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

const services: ReadonlyArray<{
  href: string;
  icon: IconName;
  title: Copy;
  description: Copy;
  tone: string;
}> = [
  {
    href: "/projects",
    icon: "lightbulb",
    title: ["المشاريع", "Projects"],
    description: ["تحليل وتقييم ودراسات جدوى لبدء مشروعك.", "Analysis, evaluation, and feasibility to start your project."],
    tone: "blue",
  },
  {
    href: "/academy",
    icon: "graduation",
    title: ["الأكاديمية", "Academy"],
    description: ["دورات ودراسات وأبحاث متخصصة", "Courses, studies, and focused research"],
    tone: "cyan",
  },
  {
    href: "/software",
    icon: "cube",
    title: ["البرمجيات", "Software"],
    description: ["أدوات تشغيل ونمو الأعمال بجودة احترافية.", "Professional tools to run and grow a business."],
    tone: "gold",
  },
  {
    href: "/market",
    icon: "barChart",
    title: ["السوق", "Market"],
    description: ["بيع وشراء الأعمال والمتاجر والعقارات.", "Buy and sell businesses, stores, and property."],
    tone: "sky",
  },
  {
    href: "/talent",
    icon: "people",
    title: ["الوظائف", "Talent"],
    description: ["مواهب وفرص عمل في مختلف المجالات.", "Talent and job opportunities across fields."],
    tone: "violet",
  },
  {
    href: "/user/investments",
    icon: "wallet",
    title: ["بياناتي الاستثمارية", "My investments"],
    description: ["متابعة استثماراتك وتقاريرك في مكان واحد.", "Track your investments and reports in one place."],
    tone: "emerald",
  },
];

const nav: ReadonlyArray<{ href: string; label: Copy }> = [
  { href: "/dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", label: ["المشاريع", "Projects"] },
  { href: "/academy", label: ["الأكاديمية", "Academy"] },
  { href: "/software", label: ["البرمجيات", "Software"] },
  { href: "/market", label: ["السوق", "Market"] },
  { href: "/talent", label: ["الوظائف", "Talent"] },
  { href: "/marketing", label: ["التسويق", "Marketing"] },
  { href: "/benefits", label: ["من نحن", "About"] },
];

const strengths: ReadonlyArray<{ icon: IconName; title: Copy; note: Copy }> = [
  { icon: "link", title: ["أقسام مترابطة", "Connected sections"], note: ["تجربة موحدة لرحلة أعمال متكاملة", "One experience for a complete business journey"] },
  { icon: "bolt", title: ["حماية وأمان", "Protection and security"], note: ["خصوصية عالية وبيئة آمنة", "High privacy and a secure environment"] },
  { icon: "settings", title: ["أدوات متكاملة", "Integrated tools"], note: ["حلول احترافية في مكان واحد", "Professional solutions in one place"] },
  { icon: "shield", title: ["بيانات موثوقة", "Sourced data"], note: ["مصادر أصلية وتحليلات دقيقة", "Original sources and careful analysis"] },
];

const markets: ReadonlyArray<{ kind: "btc" | "gold" | "stocks"; title: Copy; symbol: string }> = [
  { kind: "stocks", title: ["الأسهم العالمية", "Global equities"], symbol: "S&P 500" },
  { kind: "gold", title: ["المعادن النفيسة", "Precious metals"], symbol: "XAU/USD" },
  { kind: "btc", title: ["العملات الرقمية", "Digital currencies"], symbol: "BTC/USD" },
];

const roleLabels: Partial<Record<SystemRole, Copy>> = {
  SUPER_ADMIN: ["مالك المنصة", "Platform owner"],
  ADMIN: ["مدير النظام", "Administrator"],
  ELITE_COMMITTEE: ["فريق المنصة", "Platform team"],
  MANAGER: ["فريق المنصة", "Platform team"],
  SUPERVISOR: ["فريق المنصة", "Platform team"],
  EMPLOYEE: ["فريق المنصة", "Platform team"],
};
const memberLabel: Copy = ["عضو", "Member"];

function copy(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

function MarketMark({ kind }: { kind: "btc" | "gold" | "stocks" }) {
  if (kind === "gold") {
    return (
      <svg aria-hidden="true" className="authenticated-home__coin" focusable="false" viewBox="0 0 48 40">
        <defs>
          <linearGradient id="ah-gold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffe28a" />
            <stop offset="1" stopColor="#d9962a" />
          </linearGradient>
        </defs>
        <path d="M14 18h20l5 12H9Z" fill="url(#ah-gold)" />
        <path d="M4 32h20l4 8H0Z M24 32h20l4 8H28Z" fill="url(#ah-gold)" />
        <path d="M18 20h12" stroke="#fff4c8" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "stocks") {
    return (
      <span aria-hidden="true" className="authenticated-home__coin is-stocks">
        <Icon name="barChart" />
      </span>
    );
  }
  return <span aria-hidden="true" className="authenticated-home__coin is-btc">₿</span>;
}

export function AuthenticatedHome({
  locale,
  systemRole,
  userLabel,
}: {
  locale: Locale;
  systemRole: SystemRole;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const canAdminister = systemRole === "ADMIN" || systemRole === "SUPER_ADMIN";
  const initial = Array.from(userLabel.trim())[0]?.toUpperCase() ?? "";
  const unavailable = ar ? "غير متاح" : "Unavailable";

  return (
    <main
      className="authenticated-home"
      data-dashboard-route="/dashboard"
      data-dashboard-source="AUTHENTICATED_PLATFORM"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="authenticated-home__header">
        <Link className="authenticated-home__brand" href="/dashboard" aria-label="Jenan PRO">
          <span aria-hidden="true"><i /><i /></span>
          <strong>Jenan <b>PRO</b></strong>
        </Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {nav.map((item) => (
            <Link
              aria-current={item.href === "/dashboard" ? "page" : undefined}
              className={item.href === "/dashboard" ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              {copy(item.label, locale)}
            </Link>
          ))}
          {canAdminister ? (
            <Link className="is-admin" data-testid="home-admin-link" href="/admin">
              <Icon name="shield" />
              {ar ? "الإدارة" : "Admin"}
            </Link>
          ) : null}
        </nav>
        <div className="authenticated-home__tools">
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <button
            aria-label={ar ? "الإشعارات غير متاحة حاليًا" : "Notifications are currently unavailable"}
            className="authenticated-home__bell"
            disabled
            type="button"
          >
            <Icon name="bell" />
          </button>
          <Link className="authenticated-home__profile" href="/user" aria-label={ar ? "حسابي" : "My account"}>
            <span aria-hidden="true" className="authenticated-home__avatar">{initial}</span>
            <span className="authenticated-home__identity">
              <span className="user-chip" title={userLabel}>{userLabel}</span>
              <small data-testid="home-role-label">{copy(roleLabels[systemRole] ?? memberLabel, locale)}</small>
            </span>
          </Link>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>

      <section className="authenticated-home__hero">
        <HomeScene locale={locale} />
        <div className="authenticated-home__hero-copy">
          <h1>
            {ar ? (
              <>
                <span className="is-line"><span className="is-cyan">مستقبل</span> الأعمال</span>
                <span className="is-line"><span className="is-gradient">يبدأ</span> من هنا</span>
              </>
            ) : (
              <>
                <span className="is-line">The <span className="is-cyan">future</span> of business</span>
                <span className="is-line"><span className="is-gradient">starts</span> here</span>
              </>
            )}
          </h1>
          <p>
            {ar
              ? "منصة Jenan PRO لتمكين الأفراد والشركات من المشاريع والاستثمار والتعليم والبرمجيات، مع بيانات موثوقة وأدوات ذكية لنمو مستدام."
              : "Jenan PRO empowers individuals and companies with projects, investment, education, and software, with sourced data and smart tools for lasting growth."}
          </p>
          <div className="authenticated-home__actions">
            <Link href="/projects"><Icon name="rocket" />{ar ? "ابدأ الآن" : "Start now"}</Link>
            <Link className="is-primary" href="#services"><Icon name="grid" />{ar ? "استكشف الخدمات" : "Explore services"}</Link>
            <HomeSearch locale={locale} />
          </div>
        </div>
      </section>

      <section className="authenticated-home__services" id="services" aria-label={ar ? "خدمات المنصة" : "Platform services"}>
        {services.map((service) => (
          <Link className={`authenticated-home__service tone-${service.tone}`} href={service.href} key={service.href}>
            <span aria-hidden="true" className="authenticated-home__photo" />
            <Icon aria-hidden="true" className="authenticated-home__watermark" name={service.icon} />
            <span className="authenticated-home__service-icon"><Icon name={service.icon} /></span>
            <h2>{copy(service.title, locale)}</h2>
            <p>{copy(service.description, locale)}</p>
            <b>{ar ? "استكشف المزيد" : "Explore more"} <Icon name="arrow" /></b>
          </Link>
        ))}
      </section>

      <section className="authenticated-home__strengths" aria-label={ar ? "عن المنصة" : "About the platform"}>
        {strengths.map((item) => (
          <div className="authenticated-home__strength" key={item.title[0]}>
            <span className="authenticated-home__strength-icon"><Icon name={item.icon} /></span>
            <i><b>{copy(item.title, locale)}</b><small>{copy(item.note, locale)}</small></i>
          </div>
        ))}
      </section>

      <section className="authenticated-home__markets" aria-label={ar ? "الأسواق العالمية" : "Global markets"}>
        {markets.map((market) => (
          <article key={market.symbol}>
            <MarketMark kind={market.kind} />
            <div className="authenticated-home__market-name">
              <h2>{copy(market.title, locale)}</h2>
              <small dir="ltr">{market.symbol} <strong>—</strong></small>
            </div>
            <div className="authenticated-home__quote">
              <i aria-hidden="true" />
              <small>{unavailable}</small>
            </div>
          </article>
        ))}
      </section>

      <footer className="authenticated-home__footer">
        <strong className="authenticated-home__footer-brand">Jenan <b>PRO</b></strong>
        <nav>
          <Link href="/dashboard">{ar ? "الرئيسية" : "Home"}</Link>
          <Link href="/benefits">{ar ? "عن المنصة" : "About"}</Link>
          <Link href="/benefits">{ar ? "الشروط والأحكام" : "Terms"}</Link>
          <Link href="/benefits">{ar ? "سياسة الخصوصية" : "Privacy"}</Link>
        </nav>
        <small>{ar ? "جميع الحقوق محفوظة © 2026 Jenan PRO" : "© 2026 Jenan PRO. All rights reserved."}</small>
      </footer>
    </main>
  );
}
