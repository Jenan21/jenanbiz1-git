import dynamic from "next/dynamic";
import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import type { Project } from "@/components/source/projects-workspace";
import { assessProjectQuality } from "@/services/projects/project-quality";
import {
  buildProjectPortfolioStats,
  getLatestProjectIntelligence,
  selectProject,
} from "@/services/projects/project-review-data";
import { listUserProjects } from "@/services/projects/project-service";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import { resolveModuleHref } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

const ProjectsWorkspace = dynamic(
  () =>
    import("@/components/source/projects-workspace").then(
      (module) => module.ProjectsWorkspace,
    ),
  { ssr: false },
);

type ProjectsLiveView =
  | "showcase"
  | "analysis"
  | "feasibility"
  | "evaluation"
  | "launch"
  | "executive-report"
  | "feasibility-report"
  | "evaluation-report";

const pageCopy = {
  ar: {
    total: "إجمالي المشاريع",
    active: "المشاريع الجارية",
    ready: "جاهزة للقرار",
    average: "متوسط الجودة",
    noProjects: "لا توجد مشاريع بعد. ابدأ من شاشة التحليل لإنشاء أول مشروع وربطه بباقي المسارات.",
    summary: "ملخص المشروع",
    phasePlan: "خطة المراحل",
    intelligence: "آخر بيانات السوق",
    reports: "مركز التقارير",
    assessments: "التقييمات",
    sources: "المصادر",
    limitations: "حدود البيانات",
    download: "تحميل PDF",
    executive: "الملخص التنفيذي",
    feasibility: "تقرير الجدوى",
    evaluation: "تقرير التقييم",
    workspace: "مساحة التشغيل",
    goProjects: "العودة إلى المشاريع",
    services: "المسارات الفرعية",
  },
  en: {
    total: "Total projects",
    active: "In progress",
    ready: "Decision ready",
    average: "Average quality",
    noProjects: "No projects yet. Start from analysis to create your first project and connect the rest of the flows.",
    summary: "Project summary",
    phasePlan: "Phase plan",
    intelligence: "Latest market data",
    reports: "Reports center",
    assessments: "Assessments",
    sources: "Sources",
    limitations: "Data limitations",
    download: "Download PDF",
    executive: "Executive summary",
    feasibility: "Feasibility report",
    evaluation: "Evaluation report",
    workspace: "Operational workspace",
    goProjects: "Back to projects",
    services: "Sub-flows",
  },
} as const;

const viewConfig = {
  showcase: {
    focusMode: "all",
    title: ["قسم المشاريع يعمل الآن على بياناتك الحقيقية", "Projects now runs on your real records"],
    description: [
      "أنشئ المشروع، حلّل الفكرة، شغّل دراسة الجدوى، وثّق التقييم، ثم ابدأ التنفيذ من قاعدة بيانات واحدة.",
      "Create a project, analyze the idea, run feasibility, record evaluation, and start delivery from one database-backed flow.",
    ],
    helper: [
      "هذه المساحة مرتبطة ببيانات حسابك فقط وتدعم التحديث الفعلي للتفاصيل والمراحل والتقييمات.",
      "This workspace is tied to your account data and supports real updates to project details, stages, and assessments.",
    ],
    allowCreate: true,
  },
  analysis: {
    focusMode: "analysis",
    title: ["تحليل مشروع ببيانات حقيقية", "Project analysis with real data"],
    description: [
      "وثّق فكرة المشروع وقطاعه ودولته ووصفه، ثم اربطه ببحث سوقي محفوظ داخل قاعدة البيانات.",
      "Capture the project idea, sector, country, and description, then connect it to persisted market intelligence.",
    ],
    helper: [
      "عدّل بطاقة المشروع ثم نفّذ بحثًا موثقًا ليتم حفظ آخر لقطة سوقية للمشروع نفسه.",
      "Update the project record, then run a sourced search to store the latest market snapshot for that project.",
    ],
    allowCreate: true,
  },
  feasibility: {
    focusMode: "feasibility",
    title: ["إعداد دراسة الجدوى", "Build the feasibility study"],
    description: [
      "احسب الجدوى المالية مباشرة ثم احفظ النتيجة كتقييم مالي موثق داخل المشروع.",
      "Run live financial feasibility and persist the result as a verified financial assessment on the project.",
    ],
    helper: [
      "الحسابات تفاعلية، وحفظ النتيجة يربطها بسجل المشروع الحقيقي بدل تركها كمعاينة منفصلة.",
      "The calculations are interactive, and saving the result binds it to the live project record instead of leaving it as a disconnected preview.",
    ],
    allowCreate: false,
  },
  evaluation: {
    focusMode: "evaluation",
    title: ["تقييم مشروع وتشغيل قرار واضح", "Evaluate the project with a clear decision"],
    description: [
      "أكمل التقييمات الستة، راقب الجاهزية، وثبّت المرحلة الحالية وفق قواعد التقدم الحقيقية.",
      "Complete the six assessments, monitor readiness, and update the current phase under the real progression rules.",
    ],
    helper: [
      "أي درجة أو مصدر أو ملخص تحفظ هنا ستؤثر مباشرة في نتيجة القرار وجاهزية البدء.",
      "Any score, source, or summary saved here directly changes the decision result and launch readiness.",
    ],
    allowCreate: false,
  },
  launch: {
    focusMode: "launch",
    title: ["بدء مشروع مع بوابة جاهزية فعلية", "Launch a project with a real readiness gate"],
    description: [
      "لا يبدأ التنفيذ إلا بعد اكتمال التقييمات المطلوبة، مع متابعة المراحل من نفس السجل.",
      "Execution only starts after the required assessments are complete, with lifecycle tracking in the same record.",
    ],
    helper: [
      "استخدم هذه الصفحة لمراجعة الجاهزية، تحديث المراحل، وبدء التنفيذ عندما يصبح المشروع مستعدًا فعلًا.",
      "Use this page to review readiness, update phases, and start execution only when the project is genuinely ready.",
    ],
    allowCreate: false,
  },
  "executive-report": {
    focusMode: "launch",
    title: ["الملخص التنفيذي الحي", "Live executive summary"],
    description: [
      "حمّل تقرير PDF الحقيقي للمشروع الحالي أو انتقل إلى تقارير الجدوى والتقييم من نفس السجل.",
      "Download the live PDF report for the current project or move to feasibility and evaluation reports from the same record.",
    ],
    helper: [
      "هذه الصفحة تعرض حالة المشروع الفعلية وأحدث البيانات الموثقة قبل تنزيل التقرير.",
      "This page shows the real project state and latest verified data before downloading the report.",
    ],
    allowCreate: false,
  },
  "feasibility-report": {
    focusMode: "feasibility",
    title: ["تقرير دراسة الجدوى الحي", "Live feasibility report"],
    description: [
      "راجع أثر الدراسة المالية والمصادر المرتبطة بالمشروع قبل تنزيل التقرير.",
      "Review the financial study impact and the project-linked sources before downloading the report.",
    ],
    helper: [
      "تقرير الجدوى يعتمد على سجل المشروع والتقييمات والبحث السوقي المحفوظ.",
      "The feasibility report depends on the persisted project record, assessments, and market research.",
    ],
    allowCreate: false,
  },
  "evaluation-report": {
    focusMode: "evaluation",
    title: ["تقرير التقييم الحي", "Live evaluation report"],
    description: [
      "تابع جودة الأدلة ونتيجة القرار ثم نزّل التقرير من البيانات الحقيقية للمشروع.",
      "Track evidence quality and the decision verdict, then download the report from the project’s live data.",
    ],
    helper: [
      "كل تحديث في التقييمات أو المراحل ينعكس هنا مباشرة.",
      "Every assessment or lifecycle update is reflected here immediately.",
    ],
    allowCreate: false,
  },
} as const;

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function formatReportHref(projectId: string, variant: ProjectsLiveView) {
  if (variant === "feasibility-report") return `/api/projects/${projectId}/report`;
  if (variant === "evaluation-report") return `/api/projects/${projectId}/report`;
  return `/api/projects/${projectId}/report`;
}

export async function ProjectsLiveExperience({
  locale,
  module,
  service,
  userId,
  userLabel,
  view,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  service?: PlatformServiceDefinition;
  userId: string;
  userLabel: string;
  view: ProjectsLiveView;
}) {
  const ar = locale === "ar";
  const text = pageCopy[ar ? "ar" : "en"];
  const config = viewConfig[view];
  const projectRecords = await listUserProjects(userId);
  const projects = projectRecords as unknown as Project[];
  const portfolio = buildProjectPortfolioStats(projectRecords);
  const selectedProjectRecord = selectProject(projectRecords);
  const selectedProject = selectProject(projects, selectedProjectRecord?.id);
  const selectedQuality = selectedProjectRecord
    ? assessProjectQuality(selectedProjectRecord.assessments)
    : null;
  const latestIntelligence = getLatestProjectIntelligence(
    selectedProjectRecord,
  ) as
    | {
        query?: string;
        population?: { value?: number | null; year?: number | null };
        purchasingPower?: { value?: number | null; year?: number | null };
        competitors?: Array<{ name?: string; category?: string }>;
        sources?: Array<{ source?: string; confidence?: string }>;
        limitations?: string[];
      }
    | null;

  return (
    <PlatformShell
      locale={locale}
      activeRoute={module.route}
      userLabel={userLabel}
      immersive={view !== "showcase"}
    >
      <section className="projects-live-page">
        <header className="card projects-live-hero">
          <div>
            <span className="eyebrow eyebrow--small">
              {service ? pick(service.title, locale) : pick(module.title, locale)}
            </span>
            <h1>{pick(config.title, locale)}</h1>
            <p>{pick(config.description, locale)}</p>
          </div>
          <div className="projects-live-hero__actions">
            <Link className="button button--ghost" href={resolveModuleHref(module, "live")}>
              {text.goProjects}
            </Link>
            {view === "showcase" && (
              <div className="projects-live-links">
                <span>{text.services}</span>
                <div>
                  {module.services.map((item) => (
                    <Link key={item.id} href={item.previewHref ?? item.href}>
                      {pick(item.title, locale)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <section className="projects-live-stats" aria-label={text.workspace}>
          <article className="card projects-live-stat">
            <span>{text.total}</span>
            <strong>{portfolio.total}</strong>
          </article>
          <article className="card projects-live-stat">
            <span>{text.active}</span>
            <strong>{portfolio.active}</strong>
          </article>
          <article className="card projects-live-stat">
            <span>{text.ready}</span>
            <strong>{portfolio.ready}</strong>
          </article>
          <article className="card projects-live-stat">
            <span>{text.average}</span>
            <strong>{portfolio.averageScore}%</strong>
          </article>
        </section>

        {selectedProject ? (
          <>
            <section className="projects-live-grid">
              <article className="card projects-live-panel">
                <div className="project-card-heading">
                  <h2>{text.summary}</h2>
                  <span>{selectedProject.status}</span>
                </div>
                <strong>{selectedProject.name}</strong>
                <p>{selectedProject.description || "-"}</p>
                <dl className="projects-live-meta">
                  <div>
                    <dt>{ar ? "القطاع" : "Sector"}</dt>
                    <dd>{selectedProject.sector || "-"}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "الدولة" : "Country"}</dt>
                    <dd>{selectedProject.countryCode || "-"}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "العملة" : "Currency"}</dt>
                    <dd>{selectedProject.currency}</dd>
                  </div>
                  <div>
                    <dt>{ar ? "المرحلة الحالية" : "Current phase"}</dt>
                    <dd>{selectedProject.currentPhase}</dd>
                  </div>
                </dl>
              </article>

              <article className="card projects-live-panel">
                <div className="project-card-heading">
                  <h2>{text.assessments}</h2>
                  <span>{selectedQuality?.verdict ?? "-"}</span>
                </div>
                <div className="projects-live-score">
                  <strong>{selectedQuality?.score ?? 0}%</strong>
                  <span>{selectedQuality?.completeness ?? 0}%</span>
                </div>
                <div className="project-missing-list">
                  <strong>{ar ? "الناقص" : "Missing"}</strong>
                  <div>
                    {selectedQuality?.missing.length
                      ? selectedQuality.missing.join(" · ")
                      : ar
                        ? "مكتمل"
                        : "Complete"}
                  </div>
                </div>
              </article>

              <article className="card projects-live-panel">
                <div className="project-card-heading">
                  <h2>{text.intelligence}</h2>
                  <span>{latestIntelligence?.query ?? "-"}</span>
                </div>
                <dl className="projects-live-meta">
                  <div>
                    <dt>{ar ? "السكان" : "Population"}</dt>
                    <dd>
                      {latestIntelligence?.population?.value?.toLocaleString?.() ?? "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>{ar ? "القوة الشرائية" : "Purchasing power"}</dt>
                    <dd>
                      {latestIntelligence?.purchasingPower?.value?.toLocaleString?.() ??
                        "-"}
                    </dd>
                  </div>
                  <div>
                    <dt>{ar ? "المنافسون" : "Competitors"}</dt>
                    <dd>{latestIntelligence?.competitors?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{text.sources}</dt>
                    <dd>{latestIntelligence?.sources?.length ?? 0}</dd>
                  </div>
                </dl>
                {latestIntelligence?.limitations?.length ? (
                  <ul className="projects-live-list">
                    {latestIntelligence.limitations.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{ar ? "لا توجد قيود مسجلة على آخر بحث." : "No limitations recorded on the latest search."}</p>
                )}
              </article>

              <article className="card projects-live-panel">
                <div className="project-card-heading">
                  <h2>{text.reports}</h2>
                  <span>{selectedProject.id}</span>
                </div>
                <div className="projects-live-links projects-live-links--stack">
                  <Link href={formatReportHref(selectedProject.id, view)}>{text.download}</Link>
                  <Link href="/projects-feasibility-report-review">{text.feasibility}</Link>
                  <Link href="/projects-evaluation-report-review">{text.evaluation}</Link>
                  <Link href="/projects-report-review">{text.executive}</Link>
                </div>
              </article>
            </section>

            <ProjectsWorkspace
              locale={locale}
              focusMode={config.focusMode}
              initialProjects={projects}
              initialSelectedProjectId={selectedProject.id}
              title={pick(config.title, locale)}
              helper={pick(config.helper, locale)}
              allowCreate={config.allowCreate}
            />
          </>
        ) : (
          <section className="card empty-state">
            <p>{text.noProjects}</p>
            <Link className="button button--primary" href="/projects-analysis-review">
              {ar ? "ابدأ من التحليل" : "Start from analysis"}
            </Link>
          </section>
        )}
      </section>
    </PlatformShell>
  );
}
