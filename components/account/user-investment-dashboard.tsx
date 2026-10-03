import Link from "next/link";
import type { CSSProperties } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";
import type { getAccountOverview } from "@/services/account/account-overview-service";

export type InvestmentOverview = Awaited<ReturnType<typeof getAccountOverview>>;
type Copy = readonly [string, string];

const nav: ReadonlyArray<{ href: string; icon: IconName; label: Copy }> = [
  { href: "/dashboard", icon: "dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", icon: "briefcase", label: ["المشاريع", "Projects"] },
  { href: "/academy", icon: "graduation", label: ["الأكاديمية", "Academy"] },
  { href: "/programs", icon: "grid", label: ["المجتمعات", "Programs"] },
  { href: "/market", icon: "barChart", label: ["السوق", "Market"] },
  { href: "/talent", icon: "people", label: ["المواهب", "Talent"] },
  { href: "/marketing", icon: "megaphone", label: ["التسويق", "Marketing"] },
];

const channels = [
  ["YT", "YouTube", "#ff2d3f"],
  ["X", "X / تويتر", "#e8f7ff"],
  ["IG", "Instagram", "#e24dd7"],
  ["f", "Facebook", "#3186ff"],
  ["TK", "TikTok", "#21ddec"],
  ["SC", "Snapchat", "#f6dc38"],
] as const;

const services: ReadonlyArray<{ href: string; icon: IconName; title: Copy }> = [
  { href: "/academy", icon: "graduation", title: ["الأكاديمية", "Academy"] },
  { href: "/software", icon: "grid", title: ["البرمجيات", "Software"] },
  { href: "/talent", icon: "briefcase", title: ["الوظائف", "Jobs"] },
  { href: "/projects/evaluation", icon: "barChart", title: ["تقييم مشروع", "Project evaluation"] },
  { href: "/projects/start", icon: "rocket", title: ["بدء مشروع", "Start project"] },
  { href: "/projects/analysis", icon: "trend", title: ["تحليل مشروع", "Project analysis"] },
];

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

function projectStatus(value: string, ar: boolean) {
  const statuses: Record<string, Copy> = {
    ACTIVE: ["نشط", "Active"],
    ANALYSIS: ["التحليل", "Analysis"],
    FEASIBILITY: ["دراسة الجدوى", "Feasibility"],
    EVALUATION: ["التقييم", "Evaluation"],
    APPROVED: ["معتمد", "Approved"],
    IN_PROGRESS: ["قيد التنفيذ", "In progress"],
    ON_HOLD: ["معلق", "On hold"],
    DRAFT: ["مسودة", "Draft"],
    COMPLETED: ["مكتمل", "Completed"],
    REJECTED: ["مرفوض", "Rejected"],
    ARCHIVED: ["مؤرشف", "Archived"],
  };
  return pick(statuses[value] ?? [value, value], ar ? "ar" : "en");
}

export function UserInvestmentDashboard({
  locale,
  overview,
  userLabel,
}: {
  locale: Locale;
  overview: InvestmentOverview;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const activeStatuses = new Set<string>([
    "ANALYSIS",
    "FEASIBILITY",
    "EVALUATION",
    "APPROVED",
    "IN_PROGRESS",
  ]);
  const activeProjects = overview.projects.filter((project) =>
    activeStatuses.has(project.status),
  ).length;
  const granted = new Set<string>(overview.communityAccess.grants.map((grant) => grant.platform));

  return (
    <main className="investment-dashboard" data-investment-route="/user/investments" data-investment-source="ACCOUNT_RECORDS">
      <header className="investment-dashboard__header">
        <Link className="investment-dashboard__brand" href="/dashboard"><strong>Jenan <b>PRO</b></strong><small>{ar ? "منصة عالمية للمشاريع والاستثمارات" : "Global projects and investment platform"}</small></Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {nav.map((item) => <Link href={item.href} key={item.href}><Icon name={item.icon} />{pick(item.label, locale)}</Link>)}
        </nav>
        <div className="investment-dashboard__tools">
          <button disabled type="button" aria-label={ar ? "البحث غير متاح" : "Search unavailable"}><Icon name="search" /></button>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <span className="user-chip">{userLabel}</span>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>

      <div className="investment-dashboard__layout">
        <section className="investment-dashboard__main">
          <section className="investment-dashboard__hero">
            <div className="investment-dashboard__hero-copy">
              <span><Link href="/user">{ar ? "لوحة المستخدم" : "User center"}</Link> / {ar ? "بياناتي الاستثمارية" : "My investments"}</span>
              <h1>{ar ? "بياناتي الاستثمارية" : "My investment data"}</h1>
              <h2>{ar ? "إدارة ومتابعة جميع استثماراتك في مكان واحد" : "Manage every investment in one place"}</h2>
              <p>{ar ? "رؤى ذكية وتحليلات متقدمة من سجلات حسابك الفعلية. القيم المالية تظهر فقط عند توفر مصدر استثماري معتمد." : "Smart insight from your actual account records. Financial values appear only when an approved source is connected."}</p>
            </div>
            <div className="investment-dashboard__hero-visual" aria-hidden="true">
              <span>{ar ? "استثمارات عالمية" : "Global investments"}<b>{ar ? "مصدر مالي غير متصل" : "Financial source not connected"}</b></span>
              <i /><i /><i /><i />
            </div>
            <ul>
              <li><Icon name="barChart" />{ar ? "تحليلات لحظية دقيقة" : "Accurate live analytics"}</li>
              <li><Icon name="trend" />{ar ? "فرص استثمارية موثقة" : "Verified opportunities"}</li>
              <li><Icon name="activity" />{ar ? "متابعة أداء شامل" : "Complete performance tracking"}</li>
              <li><Icon name="barChart" />{ar ? "تقارير احترافية" : "Professional reports"}</li>
            </ul>
          </section>

          <section className="investment-dashboard__metrics" aria-label={ar ? "مؤشرات الاستثمار" : "Investment metrics"}>
            {[
              { icon: "wallet" as IconName, title: ar ? "القيمة السوقية الحالية" : "Current market value", value: "—", note: ar ? "لا تقييم موثق" : "No verified valuation", tone: "violet" },
              { icon: "pieChart" as IconName, title: ar ? "عدد المشاريع" : "Projects", value: String(overview.projects.length), note: ar ? `${activeProjects} مشروع نشط` : `${activeProjects} active`, tone: "gold" },
              { icon: "trend" as IconName, title: ar ? "إجمالي العائد" : "Total return", value: "—", note: ar ? "لا أساس للحساب" : "No calculation basis", tone: "green" },
              { icon: "wallet" as IconName, title: ar ? "إجمالي الاستثمارات" : "Total investments", value: "—", note: ar ? "مصدر مالي غير متصل" : "Financial source disconnected", tone: "cyan" },
            ].map((metric) => <article className={`tone-${metric.tone}`} key={metric.title}><span><Icon name={metric.icon} /></span><div><small>{metric.title}</small><strong>{metric.value}</strong><em>{metric.note}</em></div></article>)}
          </section>

          <section className="investment-dashboard__analytics">
            <article className="investment-dashboard__performance">
              <header><h2>{ar ? "أداء الاستثمارات" : "Investment performance"}</h2><span>{ar ? "آخر 12 شهر" : "Last 12 months"}</span></header>
              <div className="investment-dashboard__chart"><p><Icon name="barChart" /><strong>{ar ? "لا توجد نقاط أداء موثقة" : "No verified performance points"}</strong><small>{ar ? "سيظهر المخطط عند اتصال سجل التقييم." : "The chart appears when valuation history is connected."}</small></p></div>
            </article>
            <article className="investment-dashboard__allocation">
              <header><h2>{ar ? "توزيع المحفظة الاستثمارية" : "Portfolio allocation"}</h2><Link href="/user/investment/detail">{ar ? "عرض التفاصيل" : "View details"}</Link></header>
              <div><span className="investment-dashboard__ring"><b>—</b><small>{ar ? "غير متاح" : "Unavailable"}</small></span><p>{ar ? "لا توجد أصول مصنفة حتى الآن." : "No classified assets are available yet."}</p></div>
            </article>
          </section>

          <section className="investment-dashboard__records">
            <article className="investment-dashboard__projects">
              <header><h2>{ar ? "مشاريعي الاستثمارية" : "My investment projects"}</h2><Link href="/projects">{ar ? "عرض الكل" : "View all"}</Link></header>
              <div className="investment-dashboard__table">
                <div className="is-head"><span>{ar ? "المشروع" : "Project"}</span><span>{ar ? "الحالة" : "Status"}</span><span>{ar ? "المرحلة" : "Phase"}</span><span>{ar ? "القيمة" : "Value"}</span></div>
                {overview.projects.slice(0, 5).map((project) => <Link href="/projects" key={project.id}><strong>{project.name}</strong><span>{projectStatus(project.status, ar)}</span><span>{project.currentPhase}</span><span>—</span></Link>)}
                {!overview.projects.length ? <p><Icon name="briefcase" />{ar ? "لا توجد مشاريع مرتبطة بالحساب." : "No projects are linked to this account."}</p> : null}
              </div>
            </article>
            <article className="investment-dashboard__opportunities">
              <header><h2>{ar ? "أحدث الفرص الاستثمارية" : "Latest investment opportunities"}</h2><Link href="/market">{ar ? "عرض الكل" : "View all"}</Link></header>
              <div><Icon name="rocket" /><strong>{ar ? "لا توجد فرص موثقة مخصصة لحسابك" : "No verified opportunities matched to your account"}</strong><p>{ar ? "لن نعرض فرصًا تقديرية قبل اتصال مصدر معتمد." : "Estimated opportunities are not shown before an approved source is connected."}</p><Link href="/market">{ar ? "استكشف السوق" : "Explore market"}</Link></div>
            </article>
          </section>

          <section className="investment-dashboard__bottom">
            <div><strong>{ar ? "إجراءات سريعة للتقارير" : "Quick report actions"}</strong><Link href="/reports/view/portfolio"><Icon name="barChart" />{ar ? "فتح التقرير" : "Open report"}</Link><button disabled><Icon name="mail" />{ar ? "إرسال بالبريد" : "Email"}</button><button disabled><Icon name="people" />{ar ? "مشاركة" : "Share"}</button></div>
            <div><span><Icon name="briefcase" /><b>{overview.projects.length}</b><small>{ar ? "مشروع مسجل" : "Projects"}</small></span><span><Icon name="trend" /><b>—</b><small>{ar ? "متوسط النمو" : "Average growth"}</small></span><span><Icon name="grid" /><b>—</b><small>{ar ? "قطاعات متنوعة" : "Sectors"}</small></span><span><Icon name="shield" /><b>—</b><small>{ar ? "فرص موثقة" : "Verified opportunities"}</small></span></div>
          </section>
        </section>

        <aside className="investment-dashboard__aside">
          <section className="investment-dashboard__community">
            <header><Icon name="check" /><h2>{ar ? "اشترك بصفحاتنا وافتح الخدمات المجانية" : "Follow our pages and unlock services"}</h2></header>
            <p>{ar ? "تابع حساباتنا الرسمية طوعياً، ثم أكّد المتابعة يدويًا. لا ندّعي تحققًا آليًا غير متاح." : "Follow official accounts voluntarily, then acknowledge manually. We do not claim unavailable automatic verification."}</p>
            <div>{channels.map(([key, label, color]) => { const active = granted.has(key === "TK" ? "TIKTOK" : key === "YT" ? "YOUTUBE" : key === "IG" ? "INSTAGRAM" : key === "SC" ? "SNAPCHAT" : key === "f" ? "FACEBOOK" : "X"); return <span key={key}><i style={{ "--channel": color } as CSSProperties}>{key}</i><strong>{label}</strong><small className={active ? "is-active" : ""}>{active ? (ar ? "تمت المتابعة" : "Followed") : (ar ? "غير مؤكد" : "Not confirmed")}</small></span>; })}</div>
            <Link href="/user/unlocks">{ar ? `${overview.communityAccess.grants.length} / 6 — إدارة المتابعة` : `${overview.communityAccess.grants.length} / 6 — Manage follows`}</Link>
          </section>

          <section className="investment-dashboard__free-services">
            <header><Icon name="grid" /><h2>{ar ? "الخدمات المجانية بعد الاشتراك" : "Free services after access"}</h2></header>
            <p>{overview.communityAccess.hasAccess ? (ar ? "يمكنك فتح الخدمات المتاحة لحسابك." : "Available services can now be opened.") : (ar ? "أكد متابعة قناة معتمدة لفتح الخدمات." : "Acknowledge an approved channel to unlock services.")}</p>
            <div>{services.map((service) => <Link href={overview.communityAccess.hasAccess ? service.href : "/user/unlocks"} key={service.href}><Icon name={service.icon} /><strong>{pick(service.title, locale)}</strong><small>{overview.communityAccess.hasAccess ? (ar ? "مفتوح" : "Open") : (ar ? "مغلق" : "Locked")}</small></Link>)}</div>
          </section>

          <Link className="investment-dashboard__upgrade" href="/user/unlocks"><Icon name="sparkles" /><span><strong>{ar ? "افتح المزيد من الفرص" : "Unlock more opportunities"}</strong><small>{ar ? "تابع القنوات الرسمية وافتح خدمات إضافية." : "Follow official channels and unlock additional services."}</small></span><Icon name="arrow" /></Link>
        </aside>
      </div>
    </main>
  );
}
