import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { SystemRole } from "@/generated/prisma/client";
import type { HomeStats } from "@/services/platform/home-stats-service";
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
    description: ["تحليل • تقييم • دراسة جدوى لبدء مشروعك بنجاح", "Analysis • evaluation • feasibility to launch your project well"],
    tone: "blue",
  },
  {
    href: "/academy",
    icon: "graduation",
    title: ["الأكاديمية", "Academy"],
    description: ["دورات ودراسات وأبحاث لصناعة قرار أفضل", "Courses, studies, and research for better decisions"],
    tone: "cyan",
  },
  {
    href: "/software",
    icon: "cube",
    title: ["البرمجيات", "Software"],
    description: ["أدوات تشغيل ونمو الأعمال لزيادة كفاءة مشروعك", "Tools to run and grow a business and raise its efficiency"],
    tone: "gold",
  },
  {
    href: "/market",
    icon: "barChart",
    title: ["السوق", "Market"],
    description: ["بيع وشراء الأعمال والمتاجر والعقارات والفرص الاستثمارية", "Buy and sell businesses, stores, property, and opportunities"],
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
    description: ["متابعة استثماراتك ومشاريعك وتقارير في مكان واحد", "Follow your investments, projects, and reports in one place"],
    tone: "emerald",
  },
];

const nav: ReadonlyArray<{ href: string; label: Copy }> = [
  { href: "/dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", label: ["المشاريع", "Projects"] },
  { href: "/academy", label: ["الأكاديمية", "Academy"] },
  { href: "/software", label: ["البرمجيات", "Software"] },
  { href: "/market", label: ["السوق", "Market"] },
  { href: "/marketing", label: ["التسويق", "Marketing"] },
  { href: "/talent", label: ["الوظائف", "Talent"] },
  { href: "/benefits", label: ["من نحن", "About"] },
];

const strengths: ReadonlyArray<{ href?: string; icon: IconName; title: Copy; note: Copy; tone?: string }> = [
  { icon: "shield", title: ["مصادر موثّقة", "Sourced data"], note: ["بيانات دقيقة من جهات عالمية", "Accurate data from global bodies"] },
  { icon: "wrench", title: ["أدوات عملية", "Practical tools"], note: ["أدوات ونماذج جاهزة للتطبيق", "Ready-to-use tools and templates"] },
  { icon: "lock", title: ["حماية حسابك", "Account protection"], note: ["أعلى معايير الأمان والخصوصية", "High security and privacy standards"] },
  { icon: "network", title: ["أقسام مترابطة", "Connected sections"], note: ["جميع خدماتك في منصة واحدة", "All your services on one platform"] },
  { href: "/projects/analysis", icon: "lightbulb", title: ["تحليل فكرة المشروع", "Analyze your idea"], note: ["من الفكرة إلى خطة عمل واضحة", "From idea to a clear action plan"], tone: "gold" },
];

const markets: ReadonlyArray<{ glyph: string; tone: string; title: Copy; symbol: string }> = [
  { glyph: "₿", tone: "orange", title: ["العملات الرقمية", "Digital currencies"], symbol: "BTC/USD" },
  { glyph: "Au", tone: "gold", title: ["المعادن النفيسة", "Precious metals"], symbol: "XAU/USD" },
  { glyph: "S", tone: "green", title: ["الأسهم العالمية", "Global equities"], symbol: "S&P 500" },
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

/** A real count, formatted like the reference ("1,320"), or the dash used everywhere a figure has no source. */
function figure(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function GlassCard({ className, children }: { className: string; children: React.ReactNode }) {
  return <div className={`authenticated-home__glass ${className}`}>{children}</div>;
}

function LaptopScene() {
  return (
    <svg className="authenticated-home__laptop" viewBox="0 0 180 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ah-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b3a66" />
          <stop offset="1" stopColor="#031427" />
        </linearGradient>
      </defs>
      <path d="M30 86h120l14 14H16l14-14Z" fill="#0a1b2d" stroke="#2aa9d8" strokeOpacity=".55" />
      <rect x="34" y="14" width="112" height="72" rx="4" fill="url(#ah-screen)" stroke="#33c3ef" strokeOpacity=".8" />
      <path d="M78 42c3-10 11-14 17-14-1 8-6 18-17 14Zm0 0c-4 8-1 14 5 17" fill="none" stroke="#19f0f6" strokeWidth="3" strokeLinecap="round" />
      <text x="90" y="72" textAnchor="middle" fontSize="11" fontWeight="800" fill="#eaffff" fontFamily="Segoe UI, sans-serif">Jenan <tspan fill="#19f0f6">PRO</tspan></text>
      <rect x="150" y="82" width="16" height="14" rx="2" fill="#10263a" stroke="#2aa9d8" strokeOpacity=".5" />
      <rect x="8" y="96" width="24" height="5" rx="1" fill="#16405f" />
      <rect x="10" y="91" width="20" height="5" rx="1" fill="#1d5a82" />
    </svg>
  );
}

export function AuthenticatedHome({
  locale,
  stats,
  systemRole,
  userLabel,
}: {
  locale: Locale;
  stats: HomeStats;
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
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} showChevron />
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
          <span className="authenticated-home__logout"><LogoutButton label={ar ? "خروج" : "Logout"} /><Icon name="logout" /></span>
        </div>
      </header>

      <section className="authenticated-home__hero">
        <div className="authenticated-home__hero-copy">
          <span className="authenticated-home__tagline">
            <i aria-hidden="true" className="authenticated-home__tagline-mark" />
            {ar ? "من الفكرة إلى النمو ... معك في كل خطوة" : "From idea to growth ... with you at every step"}
            <Icon name="sparkles" />
          </span>
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
              ? "منصة متكاملة تجمع لك فرص المشاريع والاستثمار والتعليم والبرمجيات، بيانات موثّقة وأدوات عملية لنمو أعمالك في اقتصاد عالمي متصل."
              : "One platform that brings you project, investment, education, and software opportunities, with sourced data and practical tools to grow your business in a connected global economy."}
          </p>
          <div className="authenticated-home__actions">
            <Link className="is-primary" href="#services"><Icon name="grid" />{ar ? "استكشف الخدمات" : "Explore services"}</Link>
            <Link href="/projects"><Icon name="rocket" />{ar ? "ابدأ الآن" : "Start now"}</Link>
            <button disabled title={ar ? "الفيديو غير متاح حاليًا" : "The video is not available yet"} type="button">
              <Icon name="play" />{ar ? "شاهد الفيديو" : "Watch the video"}
            </button>
          </div>
        </div>

        <div className="authenticated-home__scene" aria-hidden="false">
          <div className="authenticated-home__skyline" aria-hidden="true" />
          <div className="authenticated-home__worldmap" aria-hidden="true" />
          <svg className="authenticated-home__arcs" viewBox="0 0 900 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M215 150 C 330 60, 420 70, 520 130" />
            <path d="M520 130 C 600 90, 660 70, 760 100" />
            <path d="M520 130 C 640 170, 700 180, 770 215" />
            <path d="M150 215 C 300 190, 420 230, 540 215" />
            <circle cx="215" cy="150" r="3.5" />
            <circle cx="520" cy="130" r="3.5" />
            <circle cx="760" cy="100" r="3.5" />
            <circle cx="770" cy="215" r="3.5" />
            <circle cx="540" cy="215" r="3.5" />
          </svg>

          <GlassCard className="is-growth">
            <small>{ar ? "نمو المشاريع" : "Project growth"}</small>
            <strong className="is-empty">—</strong>
            <em>{unavailable}</em>
          </GlassCard>
          <GlassCard className="is-users">
            <span className="authenticated-home__glass-icon"><Icon name="user" /></span>
            <small>{ar ? "المستخدمون النشطون" : "Active users"}</small>
            <strong className={stats.activeUsers === null ? "is-empty" : undefined} data-testid="home-active-users">{figure(stats.activeUsers)}</strong>
            <em>{stats.activeUsers === null ? unavailable : ar ? "خلال آخر 15 دقيقة" : "In the last 15 minutes"}</em>
          </GlassCard>
          <GlassCard className="is-opportunities">
            <span className="authenticated-home__glass-icon"><Icon name="barChart" /></span>
            <small>{ar ? "فرص السوق اليوم" : "Market opportunities today"}</small>
            <strong className="is-empty">—</strong>
            <em>{unavailable}</em>
          </GlassCard>
          <GlassCard className="is-investments">
            <small>{ar ? "إجمالي الاستثمارات" : "Total investments"}</small>
            <strong className="is-empty">—</strong>
            <em>{unavailable}</em>
          </GlassCard>
          <GlassCard className="is-projects">
            <span className="authenticated-home__glass-icon"><Icon name="cube" /></span>
            <small>{ar ? "المشاريع النشطة" : "Active projects"}</small>
            <strong className={stats.projects === null ? "is-empty" : undefined} data-testid="home-active-projects">{figure(stats.projects)}</strong>
            <em>{stats.projects === null ? unavailable : ar ? "غير مؤرشفة" : "Not archived"}</em>
          </GlassCard>
          <GlassCard className="is-countries">
            <small>{ar ? "الدول المستهدفة" : "Target countries"}</small>
            <strong className="is-empty">—</strong>
            <em>{unavailable}</em>
          </GlassCard>

          <LaptopScene />
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

      <section className="authenticated-home__strengths" aria-label={ar ? "عن المنصة" : "About the platform"}>
        {strengths.map((item) => {
          const body = (
            <>
              <span className={`authenticated-home__strength-icon${item.tone ? ` is-${item.tone}` : ""}`}><Icon name={item.icon} /></span>
              <i><b>{copy(item.title, locale)}</b><small>{copy(item.note, locale)}</small></i>
            </>
          );
          return item.href ? (
            <Link className="authenticated-home__strength" href={item.href} key={item.title[0]}>{body}</Link>
          ) : (
            <div className="authenticated-home__strength" key={item.title[0]}>{body}</div>
          );
        })}
      </section>

      <section className="authenticated-home__markets" aria-label={ar ? "الأسواق العالمية" : "Global markets"}>
        {markets.map((market) => (
          <article key={market.symbol}>
            <span className={`authenticated-home__coin is-${market.tone}`} aria-hidden="true">{market.glyph}</span>
            <div className="authenticated-home__market-name">
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
        <strong className="authenticated-home__footer-brand"><span aria-hidden="true"><i /><i /></span>Jenan <b>PRO</b></strong>
        <small>{ar ? "من الفكرة إلى التوسع ... منصة واحدة لعالم أكبر." : "From idea to expansion ... one platform for a bigger world."}</small>
        <nav>
          <Link href="/dashboard">{ar ? "الرئيسية" : "Home"}</Link>
          <Link href="/benefits">{ar ? "عن المنصة" : "About"}</Link>
          <Link href="/benefits">{ar ? "الشروط والأحكام" : "Terms"}</Link>
          <Link href="/benefits">{ar ? "سياسة الخصوصية" : "Privacy"}</Link>
        </nav>
        <small>{ar ? "© 2026 Jenan PRO جميع الحقوق محفوظة." : "© 2026 Jenan PRO. All rights reserved."}</small>
      </footer>
    </main>
  );
}
