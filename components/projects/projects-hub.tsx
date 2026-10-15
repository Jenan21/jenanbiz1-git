import Link from "next/link";
import { HubProjectInvitations } from "@/components/projects/project-invitations";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
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

const services: ReadonlyArray<{ href: string; icon: IconName; title: Copy; description: Copy; tone: string }> = [
  {
    href: "/projects/analysis",
    icon: "barChart",
    title: ["تحليل مشروع", "Project analysis"],
    description: ["مؤشرات الموقع والدولة والمنافسين مع المصادر والقيود", "Location, country and competitor indicators with sources and limits"],
    tone: "cyan",
  },
  {
    href: "/projects/start",
    icon: "rocket",
    title: ["بدء مشروع", "Start project"],
    description: ["من الفكرة إلى خطة إطلاق: الميزانية والفريق والجدول", "From idea to a launch plan: budget, team and schedule"],
    tone: "emerald",
  },
  {
    href: "/projects/feasibility",
    icon: "pieChart",
    title: ["دراسات الجدوى", "Feasibility studies"],
    description: ["دراسة مالية وفنية وسوقية بحسابات حتمية قابلة للمراجعة", "Financial, technical and market study with reviewable, deterministic maths"],
    tone: "gold",
  },
];

const STATUS: Record<string, Copy> = {
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

const ANALYZED = new Set(["ANALYSIS", "FEASIBILITY", "EVALUATION", "APPROVED", "IN_PROGRESS", "COMPLETED"]);

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
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
  const counts = [
    { icon: "briefcase" as IconName, label: ["مشاريعي", "My projects"] as Copy, value: projects.length },
    { icon: "barChart" as IconName, label: ["تم تحليلها", "Analyzed"] as Copy, value: projects.filter((project) => ANALYZED.has(project.status)).length },
    { icon: "rocket" as IconName, label: ["قيد التنفيذ", "In delivery"] as Copy, value: projects.filter((project) => project.status === "IN_PROGRESS").length },
    { icon: "check" as IconName, label: ["مكتملة", "Completed"] as Copy, value: projects.filter((project) => project.status === "COMPLETED").length },
  ];
  const latest = projects.slice(0, 3);
  const dateFormat = new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" });

  return (
    <main
      className="projects-stage"
      data-projects-route="/projects"
      data-projects-source="ACCOUNT_PROJECT_RECORDS"
      dir={ar ? "rtl" : "ltr"}
    >
      <JenanHeader locale={locale} userLabel={userLabel} />

      <section className="projects-stage__hero stage">
        <div aria-hidden="true" className="stage__photo" />
        <div aria-hidden="true" className="stage__grade" />
        <div aria-hidden="true" className="stage__fade" />
        <div className="projects-stage__copy">
          <span className="projects-stage__tag"><Icon name="rocket" />{ar ? "قسم المشاريع" : "Projects"}</span>
          <h1>
            {ar ? (
              <>
                <span className="is-line">من <span className="is-cyan">الفكرة</span> إلى</span>
                <span className="is-line">مشروع <span className="is-gradient">قابل للتنفيذ</span></span>
              </>
            ) : (
              <>
                <span className="is-line">From <span className="is-cyan">idea</span> to a</span>
                <span className="is-line"><span className="is-gradient">project that can ship</span></span>
              </>
            )}
          </h1>
          <p>
            {ar
              ? "حلّل فكرتك على أرض الواقع، وابنِ خطة الإطلاق، وأعدّ دراسة الجدوى. كل رقم بمصدره وتاريخه، وكل قيد معلن."
              : "Test your idea against real indicators, build the launch plan and prepare the feasibility study. Every figure carries its source and date, every limit is stated."}
          </p>
          <div className="projects-stage__actions">
            <Link className="is-primary" href="/projects/start"><Icon name="rocket" />{ar ? "ابدأ مشروعًا" : "Start a project"}</Link>
            <Link href="/projects/analysis"><Icon name="barChart" />{ar ? "حلّل فكرة" : "Analyze an idea"}</Link>
          </div>
        </div>
        <div className="projects-stage__counts" aria-label={ar ? "سجلاتي" : "My records"}>
          {counts.map((item) => (
            <div className="stage-glass" key={item.label[0]}>
              <Icon name={item.icon} />
              <small>{pick(item.label, locale)}</small>
              <strong>{item.value}</strong>
              <em>{ar ? "سجل فعلي" : "Live records"}</em>
            </div>
          ))}
        </div>
        <div className="projects-stage__invites">
          <HubProjectInvitations ar={ar} />
        </div>
      </section>

      <section className="projects-stage__bottom">
        <div className="projects-stage__services" aria-label={ar ? "خدمات المشاريع" : "Project services"}>
          {services.map((service) => (
            <Link className={`stage-card tone-${service.tone}`} href={service.href} key={service.href}>
              <span aria-hidden="true" className="stage-card__photo" />
              <Icon aria-hidden="true" className="stage-card__watermark" name={service.icon} />
              <span className="stage-card__icon"><Icon name={service.icon} /></span>
              <h2>{pick(service.title, locale)}</h2>
              <p>{pick(service.description, locale)}</p>
              <b>{ar ? "افتح" : "Open"} <Icon name="arrow" /></b>
            </Link>
          ))}
        </div>
        <aside className="projects-stage__recent" aria-label={ar ? "أحدث مشاريعي" : "My latest projects"}>
          <header>
            <h2>{ar ? "أحدث مشاريعي" : "My latest projects"}</h2>
            <Link href="/projects/analysis">{ar ? "الكل" : "All"}</Link>
          </header>
          {latest.length ? (
            <ul>
              {latest.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/analysis/result?project=${project.id}`}>
                    <strong>{project.name}</strong>
                    <small>{pick(STATUS[project.status] ?? [project.status, project.status], locale)} · {dateFormat.format(project.updatedAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p><Icon name="briefcase" />{ar ? "لا توجد مشاريع بعد. ابدأ مشروعك الأول." : "No projects yet. Start your first project."}</p>
          )}
        </aside>
      </section>
    </main>
  );
}
