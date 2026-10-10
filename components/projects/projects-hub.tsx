import Link from "next/link";
import type { CSSProperties } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

export type HubProject = {
  id: string;
  name: string;
  status: string;
  currentPhase: string;
  sector: string | null;
  updatedAt: Date;
};

type Copy = readonly [string, string];

const navigation: ReadonlyArray<{
  href: string;
  icon: IconName;
  label: Copy;
}> = [
  { href: "/dashboard", icon: "dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", icon: "briefcase", label: ["المشاريع", "Projects"] },
  { href: "/academy", icon: "graduation", label: ["الأكاديمية", "Academy"] },
  { href: "/software", icon: "grid", label: ["البرمجيات", "Software"] },
  { href: "/market", icon: "barChart", label: ["السوق", "Market"] },
  { href: "/talent", icon: "people", label: ["المواهب", "Talent"] },
  { href: "/marketing", icon: "megaphone", label: ["التسويق", "Marketing"] },
];

const services: ReadonlyArray<{
  href: string;
  icon: IconName;
  title: Copy;
  description: Copy;
  tone: string;
}> = [
  {
    href: "/projects/analysis",
    icon: "barChart",
    title: ["تحليل مشروع", "Project analysis"],
    description: [
      "تحليل احترافي لفكرة المشروع والسوق والمنافسين والفرص",
      "Professional analysis of the idea, market, competitors, and opportunity",
    ],
    tone: "cyan",
  },
  {
    href: "/projects/start",
    icon: "rocket",
    title: ["بدء مشروع", "Start project"],
    description: [
      "قيّم جاهزية المشروع ثم حوّل خطتك إلى واقع عبر مسار إطلاق متكامل",
      "Evaluate project readiness, then turn the plan into reality through a complete launch workflow",
    ],
    tone: "emerald",
  },
  {
    href: "/projects/feasibility",
    icon: "pieChart",
    title: ["إعداد دراسات الجدوى", "Feasibility studies"],
    description: [
      "دراسات شاملة بمؤشرات مالية وفنية وسوقية دقيقة",
      "Detailed financial, technical, and market studies",
    ],
    tone: "gold",
  },
];

const sectorColors = ["#37c7ff", "#15e0e6", "#efc85a", "#29e2b3", "#9b6bef", "#83a4c4"];

function pick(copy: Copy, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function statusLabel(status: string, locale: Locale) {
  const labels: Record<string, Copy> = {
    DRAFT: ["مسودة", "Draft"],
    ANALYSIS: ["قيد التحليل", "In analysis"],
    FEASIBILITY: ["دراسة جدوى", "Feasibility"],
    EVALUATION: ["قيد التقييم", "In evaluation"],
    APPROVED: ["معتمد", "Approved"],
    IN_PROGRESS: ["قيد التنفيذ", "In progress"],
    ON_HOLD: ["معلق", "On hold"],
    COMPLETED: ["مكتمل", "Completed"],
    REJECTED: ["مرفوض", "Rejected"],
    ARCHIVED: ["مؤرشف", "Archived"],
  };
  return pick(labels[status] ?? [status, status], locale);
}

function phaseLabel(phase: string, locale: Locale) {
  const labels: Record<string, Copy> = {
    ANALYSIS: ["التحليل", "Analysis"],
    FEASIBILITY: ["الجدوى", "Feasibility"],
    EVALUATION: ["التقييم", "Evaluation"],
    PLANNING: ["التخطيط", "Planning"],
    EXECUTION: ["التنفيذ", "Execution"],
    REVIEW: ["المراجعة", "Review"],
    COMPLETION: ["الإكمال", "Completion"],
  };
  return pick(labels[phase] ?? [phase, phase], locale);
}

export function ProjectsHub({
  locale,
  projects,
  userLabel,
}: {
  locale: Locale;
  projects: HubProject[];
  userLabel: string;
}) {
  const ar = locale === "ar";
  const completed = projects.filter((project) => project.status === "COMPLETED").length;
  const inProgress = projects.filter((project) => project.status === "IN_PROGRESS").length;
  const analyzed = projects.filter((project) =>
    ["ANALYSIS", "FEASIBILITY", "EVALUATION", "APPROVED", "IN_PROGRESS", "COMPLETED"].includes(
      project.status,
    ),
  ).length;
  const sectorCounts = [...projects.reduce((counts, project) => {
    const sector = project.sector?.trim() || (ar ? "غير مصنف" : "Unclassified");
    counts.set(sector, (counts.get(sector) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6);
  let cursor = 0;
  const sectorStops = sectorCounts.length
    ? sectorCounts.map(([, count], index) => {
        const start = cursor;
        cursor += (count / projects.length) * 100;
        return `${sectorColors[index]} ${start}% ${cursor}%`;
      }).join(",")
    : "rgba(32, 171, 207, .28) 0 100%";
  const latest = projects.slice(0, 4);

  return (
    <main
      className="projects-dashboard"
      data-projects-route="/projects"
      data-projects-source="ACCOUNT_PROJECT_RECORDS"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="projects-dashboard__header">
        <Link className="projects-dashboard__brand" href="/dashboard">
          <strong>Jenan <b>PRO</b></strong>
          <small>{ar ? "منصة عالمية للمشاريع والاستثمارات" : "Global projects and investment platform"}</small>
        </Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {navigation.map((item) => (
            <Link
              className={item.href === "/projects" ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              <Icon name={item.icon} />
              {pick(item.label, locale)}
            </Link>
          ))}
        </nav>
        <div className="projects-dashboard__tools">
          <button disabled type="button" aria-label={ar ? "لا توجد تنبيهات جديدة" : "No new notifications"}>
            <Icon name="bell" />
          </button>
          <button disabled type="button" aria-label={ar ? "البحث غير متاح حاليًا" : "Search unavailable"}>
            <Icon name="search" />
          </button>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <span className="user-chip">{userLabel}</span>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>

      <section className="projects-dashboard__hero">
        <div className="projects-dashboard__hero-copy">
          <span>{ar ? "منصة الفكرة إلى مشروع ناجح ومستدام" : "From idea to a successful, sustainable project"}</span>
          <h1>{ar ? <>خدمات مشاريع متكاملة<br /><em>تصنع فرصًا حقيقية</em></> : <>Integrated project services<br /><em>that create real opportunities</em></>}</h1>
          <strong>{ar ? "تحليل دقيق · تقييم احترافي · دراسات جدوى · دعم في بدء التنفيذ" : "Accurate analysis · professional evaluation · feasibility · launch support"}</strong>
          <p>{ar ? "نساعدك في تحويل أفكارك إلى مشاريع قابلة للتنفيذ عبر تحليلات احترافية وبيانات دقيقة ورؤية استثمارية شاملة." : "Turn ideas into executable projects through professional analysis, accurate data, and a complete investment view."}</p>
        </div>
        <div className="projects-dashboard__hero-map" aria-hidden="true">
          <span><Icon name="globe" /><b>{ar ? "رؤية عالمية" : "Global vision"}</b></span>
          <i /><i /><i />
        </div>
        <div className="projects-dashboard__hero-promise">
          <Icon name="building" />
          <strong>{ar ? "مشاريع اليوم" : "Projects today"}</strong>
          <b>{ar ? "تصنع اقتصاد الغد" : "build tomorrow's economy"}</b>
          <small>{ar ? "رؤى أعمق · فرص أوسع · نمو مستدام" : "Deeper insight · wider opportunity · sustainable growth"}</small>
        </div>
      </section>

      <section className="projects-dashboard__services" aria-label={ar ? "خدمات المشاريع" : "Project services"}>
        {services.map((service) => (
          <Link className={`tone-${service.tone}`} href={service.href} key={service.href}>
            <span><Icon name={service.icon} /></span>
            <div><h2>{pick(service.title, locale)}</h2><p>{pick(service.description, locale)}</p></div>
            <i><Icon name="arrow" /></i>
          </Link>
        ))}
      </section>

      <section className="projects-dashboard__overview">
        <article className="projects-dashboard__outputs">
          <header><h2>{ar ? "أدوات ومخرجات المشروع" : "Project tools and outputs"}</h2></header>
          <div className="projects-dashboard__output-actions">
            {projects[0] ? (
              <>
                <Link href={`/reports/print/project-analysis?project=${projects[0].id}`}><Icon name="barChart" /><span>{ar ? "طباعة التقرير" : "Print report"}</span></Link>
                <a href={`/api/projects/${projects[0].id}/report`}><Icon name="pieChart" /><span>{ar ? "تنزيل PDF" : "Download PDF"}</span></a>
              </>
            ) : (
              <>
                <button disabled><Icon name="barChart" /><span>{ar ? "طباعة التقرير" : "Print report"}</span></button>
                <button disabled><Icon name="pieChart" /><span>{ar ? "تنزيل PDF" : "Download PDF"}</span></button>
              </>
            )}
            <button disabled><Icon name="people" /><span>{ar ? "مشاركة" : "Share"}</span></button>
            <button disabled><Icon name="mail" /><span>{ar ? "إرسال بالبريد" : "Email"}</span></button>
          </div>
          <Link className="projects-dashboard__payments" href="/user/payments">
            <Icon name="wallet" />
            <span><strong>{ar ? "إدارة المدفوعات والفواتير" : "Payments and invoices"}</strong><small>{ar ? "من خلال لوحة المستخدم" : "Available in your user center"}</small></span>
            <Icon name="arrow" />
          </Link>
        </article>

        <article className="projects-dashboard__stats">
          <header><h2>{ar ? "إحصائيات المشاريع" : "Project statistics"}</h2><span>{ar ? "سجلات الحساب" : "Account records"}</span></header>
          <div>
            {[
              [ar ? "إجمالي قيمة المشاريع" : "Total project value", "—", "wallet" as IconName, ar ? "لا يوجد مصدر مالي" : "No financial source"],
              [ar ? "مشروع قيد التنفيذ" : "In delivery", String(inProgress), "settings" as IconName, ar ? "سجل فعلي" : "Live records"],
              [ar ? "دراسة مكتملة" : "Completed projects", String(completed), "pieChart" as IconName, ar ? "سجل فعلي" : "Live records"],
              [ar ? "مشروع تم تحليله" : "Analyzed projects", String(analyzed), "barChart" as IconName, ar ? "سجل فعلي" : "Live records"],
            ].map(([label, value, icon, note]) => (
              <span key={label}><Icon name={icon as IconName} /><small>{label}</small><b>{value}</b><em>{note}</em></span>
            ))}
          </div>
        </article>

        <article className="projects-dashboard__distribution">
          <header><h2>{ar ? "توزيع المشاريع حسب القطاع" : "Projects by sector"}</h2><span>{projects.length}</span></header>
          <div>
            <span className="projects-dashboard__donut" style={{ "--sectors": `conic-gradient(${sectorStops})` } as CSSProperties}><b>{projects.length}</b><small>{ar ? "مشروع" : "Projects"}</small></span>
            <ul>{sectorCounts.map(([sector, count], index) => <li key={sector}><i style={{ background: sectorColors[index] }} /><span>{sector}</span><b>{Math.round((count / projects.length) * 100)}%</b></li>)}</ul>
            {!sectorCounts.length ? <p>{ar ? "لا توجد قطاعات مسجلة" : "No sectors recorded"}</p> : null}
          </div>
        </article>
      </section>

      <section className="projects-dashboard__lower">
        <article className="projects-dashboard__recent">
          <header><h2>{ar ? "أحدث المشاريع" : "Recent projects"}</h2><Link href="/projects/analysis">{ar ? "عرض الكل" : "View all"}</Link></header>
          <div className="projects-dashboard__table">
            <span className="is-head"><b>{ar ? "اسم المشروع" : "Project"}</b><b>{ar ? "القطاع" : "Sector"}</b><b>{ar ? "الخدمة" : "Service"}</b><b>{ar ? "الحالة" : "Status"}</b><b>{ar ? "التاريخ" : "Date"}</b></span>
            {latest.map((project) => <Link href="/projects/analysis" key={project.id}><strong>{project.name}</strong><span>{project.sector || (ar ? "غير مصنف" : "Unclassified")}</span><span>{phaseLabel(project.currentPhase, locale)}</span><em>{statusLabel(project.status, locale)}</em><small>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(project.updatedAt)}</small></Link>)}
            {!latest.length ? <p><Icon name="briefcase" />{ar ? "لا توجد مشاريع بعد. ابدأ مشروعك الأول." : "No projects yet. Start your first project."}</p> : null}
          </div>
        </article>

        <article className="projects-dashboard__activity">
          <header><h2>{ar ? "نشاط المشاريع الأخير" : "Recent project activity"}</h2></header>
          <div>{latest.map((project, index) => <Link href="/projects/analysis" key={project.id}><Icon name={index % 2 ? "trend" : "activity"} /><span><strong>{project.name}</strong><small>{statusLabel(project.status, locale)} · {phaseLabel(project.currentPhase, locale)}</small></span><time>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "short" }).format(project.updatedAt)}</time></Link>)}{!latest.length ? <p>{ar ? "لا يوجد نشاط مسجل" : "No activity recorded"}</p> : null}</div>
        </article>

        <article className="projects-dashboard__sectors">
          <header><h2>{ar ? "أهم القطاعات الاستثمارية" : "Leading investment sectors"}</h2></header>
          <div>{sectorCounts.slice(0, 6).map(([sector, count], index) => <span key={sector} style={{ "--sector": sectorColors[index] } as CSSProperties}><Icon name={index % 2 ? "settings" : "building"} /><strong>{sector}</strong><b>{Math.round((count / projects.length) * 100)}%</b><small>{count} {ar ? "مشروع" : "projects"}</small></span>)}{!sectorCounts.length ? <p>{ar ? "تظهر القطاعات بعد إضافة المشاريع" : "Sectors appear after projects are added"}</p> : null}</div>
        </article>
      </section>
    </main>
  );
}
