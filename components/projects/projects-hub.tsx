import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type HubProject = { id: string; name: string; status: string; currentPhase: string; sector: string | null; updatedAt: Date };

const services = [
  ["/projects/analysis", "barChart", "تحليل مشروع", "Project analysis", "تنظيم الفكرة والسوق والموقع والمخاطر والتوصيات."],
  ["/projects/feasibility", "pieChart", "دراسة الجدوى", "Feasibility study", "دراسة مبسطة أو احترافية بحسابات مالية حتمية."],
  ["/projects/evaluation", "activity", "تقييم مشروع", "Project evaluation", "درجات وأدلة ومصادر وقرار اعتماد بشري موثق."],
  ["/projects/start", "rocket", "بدء مشروع", "Start project", "خارطة طريق وتجهيز وفريق وإطلاق بعد استيفاء البوابات."],
] as const;

export function ProjectsHub({ locale, projects }: { locale: Locale; projects: HubProject[] }) {
  const ar = locale === "ar";
  const metrics = [
    [ar ? "إجمالي المشاريع" : "Total projects", projects.length],
    [ar ? "قيد التحليل" : "In analysis", projects.filter((project) => project.currentPhase === "ANALYSIS").length],
    [ar ? "قيد التنفيذ" : "In delivery", projects.filter((project) => project.status === "IN_PROGRESS").length],
    [ar ? "مكتملة" : "Completed", projects.filter((project) => project.status === "COMPLETED").length],
  ] as const;
  return (
    <section className="projects-hub">
      <header className="projects-hub__header"><div><span className="eyebrow eyebrow--small">JENAN PRO / PROJECTS</span><h1>{ar ? "قسم المشاريع" : "Projects command center"}</h1><p>{ar ? "تحليل وتقييم وبدء ودراسة جدوى مرتبطة بسجل مشروع واحد وأدلة قابلة للتدقيق." : "Analysis, evaluation, launch, and feasibility connected to one auditable project record."}</p></div><span className="workspace-overview__status"><i />{ar ? "جاهز للعمل" : "Ready"}</span></header>
      <div className="projects-hub__metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{projects.length ? (ar ? "من السجلات الفعلية" : "From live records") : (ar ? "لا توجد بيانات" : "No data yet")}</small></article>)}</div>
      <div className="projects-hub__services">{services.map(([href, icon, arabic, english, description], index) => <Link href={href} key={href}><span className="projects-hub__service-number">{String(index + 1).padStart(2, "0")}</span><span className="projects-hub__service-icon"><Icon name={icon} /></span><span><strong>{ar ? arabic : english}</strong><small>{description}</small></span><Icon name="arrow" /></Link>)}</div>
      <div className="projects-hub__lower"><section><header><h2>{ar ? "مشروعاتي" : "My projects"}</h2><Link href="/projects/analysis/new">{ar ? "مشروع جديد" : "New project"}</Link></header>{projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><span>{[project.sector, project.status, project.currentPhase].filter(Boolean).join(" · ")}</span></div><small>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(project.updatedAt)}</small></article>)}{!projects.length ? <p>{ar ? "لا توجد مشاريع بعد. ابدأ بإدخال مشروعك الأول." : "No projects yet. Start by entering your first project."}</p> : null}</section><aside><h2>{ar ? "المخرجات والتقارير" : "Outputs and reports"}</h2><p>{ar ? "تُنشأ التقارير من بيانات المشروع الفعلية والأدلة المحفوظة." : "Reports are generated from persisted project data and evidence."}</p>{projects[0] ? <a className="button button--secondary" href={`/api/projects/${projects[0].id}/report`}>{ar ? "تنزيل أحدث تقرير" : "Download latest report"}</a> : <button className="button button--secondary" disabled type="button">{ar ? "لا يوجد تقرير بعد" : "No report yet"}</button>}</aside></div>
    </section>
  );
}