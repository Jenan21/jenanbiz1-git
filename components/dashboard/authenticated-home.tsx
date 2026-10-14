import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
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
    description: ["تحليل · تقييم · دراسة جدوى · بدء مشروعك", "Analysis · evaluation · feasibility · launch"],
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
    description: ["أدوات تشغيل ونمو الأعمال", "Tools to run and grow a business"],
    tone: "gold",
  },
  {
    href: "/market",
    icon: "barChart",
    title: ["السوق", "Market"],
    description: ["بيع وشراء الأعمال والمتاجر والعقارات", "Buy and sell businesses, stores, and assets"],
    tone: "sky",
  },
  {
    href: "/talent",
    icon: "people",
    title: ["الوظائف", "Talent"],
    description: ["مواهب وفرص عمل في مختلف المجالات", "Talent and job opportunities across fields"],
    tone: "violet",
  },
  {
    href: "/user/investments",
    icon: "wallet",
    title: ["بياناتي الاستثمارية", "My investment data"],
    description: ["متابعة مشاريعك الاستثمارية وتقاريرك في مكان واحد", "Follow your investment projects and reports in one place"],
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
  { icon: "shield", title: ["مصادر موثّقة", "Sourced data"], note: ["كل رقم يظهر مع مصدره وتاريخه", "Every figure shows its source and date"] },
  { icon: "rocket", title: ["أدوات عملية", "Practical tools"], note: ["لتطوير مشروعك خطوة بخطوة", "To build your project step by step"] },
  { icon: "lock", title: ["حماية لحسابك", "Account protection"], note: ["جلسات آمنة وصلاحيات واضحة", "Secure sessions and clear permissions"] },
  { icon: "grid", title: ["أقسام مترابطة", "Connected sections"], note: ["من الفكرة إلى التنفيذ في مكان واحد", "From idea to execution in one place"] },
];

const markets: ReadonlyArray<{ icon: IconName; title: Copy; symbol: string }> = [
  { icon: "barChart", title: ["الأسهم العالمية", "Global equities"], symbol: "S&P 500" },
  { icon: "cube", title: ["المعادن النفيسة", "Precious metals"], symbol: "XAU/USD" },
  { icon: "wallet", title: ["العملات الرقمية", "Digital currencies"], symbol: "BTC/USD" },
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
          <label className="authenticated-home__search">
            <Icon name="search" />
            <input
              disabled
              placeholder={ar ? "البحث غير متاح حاليًا" : "Search unavailable"}
              type="search"
              aria-label={ar ? "البحث غير متاح حاليًا" : "Search is currently unavailable"}
            />
          </label>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <button
            aria-label={ar ? "الإشعارات غير متاحة حاليًا" : "Notifications are currently unavailable"}
            className="authenticated-home__bell"
            disabled
            type="button"
          >
            <Icon name="bell" />
          </button>
          <div className="authenticated-home__profile">
            <span aria-hidden="true" className="authenticated-home__avatar">{initial}</span>
            <span className="authenticated-home__identity">
              <span className="user-chip" title={userLabel}>{userLabel}</span>
              <small data-testid="home-role-label">{copy(roleLabels[systemRole] ?? memberLabel, locale)}</small>
            </span>
          </div>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>

      <section className="authenticated-home__hero">
        <div className="authenticated-home__scene" aria-hidden="true">
          <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" focusable="false">
            <path d="M40 250 C 190 40, 420 20, 560 150" />
            <path d="M120 300 C 280 120, 520 90, 720 210" />
            <path d="M210 120 C 330 20, 500 30, 640 70" />
            <circle cx="40" cy="250" r="4" />
            <circle cx="560" cy="150" r="4" />
            <circle cx="120" cy="300" r="4" />
            <circle cx="720" cy="210" r="4" />
            <circle cx="210" cy="120" r="4" />
            <circle cx="640" cy="70" r="4" />
          </svg>
        </div>
        <div className="authenticated-home__hero-copy">
          <h1>
            {ar ? (
              <><span className="is-cyan">مستقبل</span> الأعمال <span className="is-gradient">يبدأ</span> من هنا</>
            ) : (
              <>The <span className="is-cyan">future</span> of business <span className="is-gradient">starts</span> here</>
            )}
          </h1>
          <strong>{ar ? "خدمات متكاملة • تحليلات موثّقة • فرص عالمية" : "Complete services • sourced analysis • global opportunities"}</strong>
          <p>
            {ar
              ? "منصة Jenan PRO لتمكين الأفراد والشركات من المشاريع والاستثمار والتعليم والبرمجيات، مع بيانات موثّقة المصدر وأدوات عملية للنمو في اقتصاد عالمي متصل."
              : "Jenan PRO equips individuals and companies with projects, investment, education, and software, using sourced data and practical tools to grow in a connected global economy."}
          </p>
          <div className="authenticated-home__actions">
            <Link className="is-primary" href="#services"><Icon name="grid" />{ar ? "استكشف الخدمات" : "Explore services"}</Link>
            <Link href="/user"><Icon name="barChart" />{ar ? "لوحة بياناتي" : "My dashboard"}</Link>
            <Link href="/projects"><Icon name="rocket" />{ar ? "ابدأ الآن" : "Start now"}</Link>
          </div>
        </div>
      </section>

      <section className="authenticated-home__services" id="services" aria-label={ar ? "خدمات المنصة" : "Platform services"}>
        {services.map((service) => (
          <Link className={`authenticated-home__service tone-${service.tone}`} href={service.href} key={service.href}>
            <span><Icon name={service.icon} /></span>
            <h2>{copy(service.title, locale)}</h2>
            <p>{copy(service.description, locale)}</p>
            <b>{ar ? "استكشف المزيد" : "Explore more"} <Icon name="arrow" /></b>
          </Link>
        ))}
      </section>

      <section className="authenticated-home__partner" aria-label={ar ? "عن المنصة" : "About the platform"}>
        <div className="authenticated-home__partner-copy">
          <small>{ar ? "استكشف عوالم Jenan PRO" : "Explore the worlds of Jenan PRO"}</small>
          <h2>{ar ? "شريك استراتيجي لنمو أعمالك" : "A strategic partner for your growth"}</h2>
          <p>{ar ? "من الفكرة إلى التوسع .. في منصة واحدة." : "From idea to expansion .. on one platform."}</p>
        </div>
        <ul className="authenticated-home__strengths">
          {strengths.map((item) => (
            <li key={item.title[0]}>
              <Icon name={item.icon} />
              <span><b>{copy(item.title, locale)}</b><small>{copy(item.note, locale)}</small></span>
            </li>
          ))}
        </ul>
        <Link className="authenticated-home__analysis" href="/projects/analysis">
          <Icon name="sparkles" />
          <span><b>{ar ? "حلّل فكرة مشروعك" : "Analyze your project idea"}</b><small>{ar ? "مؤشرات الموقع والمصادر والقيود" : "Location indicators, sources, and limits"}</small></span>
          <Icon name="arrow" />
        </Link>
      </section>

      <section className="authenticated-home__markets" aria-label={ar ? "الأسواق العالمية" : "Global markets"}>
        {markets.map((market) => (
          <article key={market.symbol}>
            <span aria-hidden="true"><Icon name={market.icon} /></span>
            <div>
              <h2>{copy(market.title, locale)}</h2>
              <small dir="ltr">{market.symbol}</small>
            </div>
            <div className="authenticated-home__quote">
              <strong>—</strong>
              <small>{ar ? "غير متاح: لا يوجد مصدر بيانات مباشر" : "Unavailable: no live data source"}</small>
            </div>
          </article>
        ))}
      </section>

      <footer className="authenticated-home__footer">
        <strong>Jenan <b>PRO</b></strong>
        <nav><Link href="/dashboard">{ar ? "الرئيسية" : "Home"}</Link><Link href="/benefits">{ar ? "عن المنصة" : "About"}</Link><Link href="/benefits">{ar ? "الشروط والأحكام" : "Terms"}</Link><Link href="/benefits">{ar ? "سياسة الخصوصية" : "Privacy"}</Link></nav>
        <small>© 2026 Jenan PRO</small>
      </footer>
    </main>
  );
}
