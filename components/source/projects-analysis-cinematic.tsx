import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import { ProjectsInteractiveExperience } from "@/components/source/projects-interactive-experience";
import { ServiceToolDock } from "@/components/source/service-tool-workspace";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import { resolveModuleHref, type PlatformNavigationMode } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

const lenses = [
  {
    code: "IDEA",
    title: ["وضوح الفكرة", "Idea clarity"],
    note: ["المشكلة والحل والقيمة", "Problem, solution, and value"],
  },
  {
    code: "MARKET",
    title: ["منظور السوق", "Market perspective"],
    note: ["الجمهور والبدائل والفرصة", "Audience, alternatives, and opportunity"],
  },
  {
    code: "OPS",
    title: ["قابلية التشغيل", "Operational fit"],
    note: ["الموارد والمسار والجاهزية", "Resources, path, and readiness"],
  },
  {
    code: "RISK",
    title: ["خريطة المخاطر", "Risk map"],
    note: ["الافتراضات والعوائق والاعتماديات", "Assumptions, blockers, and dependencies"],
  },
] as const;

function AnalysisCore() {
  return (
    <svg
      className="analysis-stage__core"
      viewBox="0 0 760 600"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="analysis-line" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5edce9" stopOpacity=".18" />
          <stop offset=".52" stopColor="#5edce9" stopOpacity=".9" />
          <stop offset=".78" stopColor="#67d7a1" stopOpacity=".82" />
          <stop offset="1" stopColor="#e1c579" stopOpacity=".8" />
        </linearGradient>
        <radialGradient id="analysis-energy">
          <stop stopColor="#e1c579" stopOpacity=".78" />
          <stop offset=".18" stopColor="#67d7a1" stopOpacity=".32" />
          <stop offset=".58" stopColor="#5edce9" stopOpacity=".08" />
          <stop offset="1" stopColor="#5edce9" stopOpacity="0" />
        </radialGradient>
        <filter id="analysis-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="analysis-stage__floor">
        <path d="M56 540 236 390h288l180 150M132 540l158-150M628 540 470 390" />
        <path d="M56 540h648M90 510h580M126 480h508M168 446h424M214 414h332" />
      </g>

      <g className="analysis-stage__connections">
        <path d="M380 108V38M380 492v70M188 300H62M572 300h126" />
        <path className="analysis-stage__gold-line" d="M245 165 156 82M515 165l89-83M245 435l-89 83M515 435l89 83" />
        <circle cx="380" cy="38" r="4" />
        <circle cx="698" cy="300" r="4" />
        <circle className="analysis-stage__gold-node" cx="604" cy="82" r="4" />
        <circle className="analysis-stage__gold-node" cx="156" cy="518" r="4" />
      </g>

      <g className="analysis-stage__orbits" filter="url(#analysis-glow)">
        <circle cx="380" cy="300" r="190" />
        <circle cx="380" cy="300" r="150" />
        <circle cx="380" cy="300" r="108" />
        <path d="M190 300h380M380 110v380" />
        <path d="M246 166 514 434M514 166 246 434" />
      </g>

      <circle cx="380" cy="300" r="142" fill="url(#analysis-energy)" />

      <g className="analysis-stage__prism">
        <path d="m380 184 102 58v116l-102 58-102-58V242Z" />
        <path d="m380 184 102 58-102 59-102-59M380 301v115" />
        <path className="analysis-stage__gold-line" d="m380 218 70 41-70 40-70-40Z" />
        <circle className="analysis-stage__gold-node" cx="380" cy="301" r="7" />
      </g>

      <g className="analysis-stage__pulse" filter="url(#analysis-glow)">
        <circle cx="380" cy="300" r="24" />
        <circle cx="380" cy="300" r="7" />
      </g>
    </svg>
  );
}

export function ProjectsAnalysisCinematic({
  locale,
  module,
  service,
  userLabel,
  navigationMode = "live",
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  service: PlatformServiceDefinition;
  userLabel: string;
  navigationMode?: PlatformNavigationMode;
}) {
  const ar = locale === "ar";

  return (
    <PlatformShell
      locale={locale}
      activeRoute={module.route}
      userLabel={userLabel}
      immersive
    >
      <section
        className="projects-analysis"
        aria-labelledby="projects-analysis-title"
      >
        <ServiceToolDock
          locale={locale}
          moduleId={module.id}
          navigationMode={navigationMode}
          serviceSlug={service.slug}
        />
        <ProjectsInteractiveExperience locale={locale} mode="analysis" />
        <div className="projects-analysis__traces" aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
          <i />
        </div>

        <header className="projects-analysis__header">
          <Link href={resolveModuleHref(module, navigationMode)} className="projects-analysis__back">
            <span aria-hidden="true">←</span>
            {pick(module.title, locale)}
          </Link>
          <span className="projects-analysis__code">
            {module.code} / ANALYSIS NODE 01
          </span>
          <h1 id="projects-analysis-title">{pick(service.title, locale)}</h1>
          <p>{pick(service.description, locale)}</p>
          <Link href="/projects-report-review" className="projects-report-link">{ar ? "معاينة الملخص التنفيذي" : "Executive summary preview"}</Link>
        </header>

        <aside
          className="projects-analysis__inputs"
          aria-label={ar ? "مدخلات التحليل" : "Analysis inputs"}
        >
          <div className="projects-analysis__panel-title">
            <small>INPUT SIGNALS</small>
            <strong>{ar ? "عرّف مشروعك" : "Define your project"}</strong>
          </div>
          {[
            ["01", ar ? "فكرة المشروع" : "Project idea"],
            ["02", ar ? "القطاع المستهدف" : "Target sector"],
            ["03", ar ? "السوق الجغرافي" : "Geographic market"],
            ["04", ar ? "مرحلة المشروع" : "Project stage"],
          ].map(([number, label]) => (
            <div className="projects-analysis__input-line" key={number}>
              <span>{number}</span>
              <strong>{label}</strong>
              <i />
            </div>
          ))}
          <p>
            {ar
              ? "واجهة تصميمية فقط — الإدخال والتحليل غير مفعّلين."
              : "Design interface only — input and analysis are inactive."}
          </p>
        </aside>

        <div className="projects-analysis__stage">
          <AnalysisCore />
          <div className="projects-analysis__stage-label">
            <small>JENAN ANALYSIS CORE</small>
            <strong>{ar ? "نواة فهم المشروع" : "Project intelligence core"}</strong>
            <span>
              <i />
              {ar ? "نموذج تجريبي" : "Preview model"}
            </span>
          </div>
        </div>

        <section
          className="projects-analysis__lenses"
          aria-label={ar ? "محاور التحليل" : "Analysis lenses"}
        >
          {lenses.map((lens, index) => (
            <article
              className={"projects-analysis__lens projects-analysis__lens--" + (index + 1)}
              key={lens.code}
            >
              <span className="projects-analysis__lens-orbit" aria-hidden="true">
                <i />
                <b>{String(index + 1).padStart(2, "0")}</b>
              </span>
              <div>
                <small>{lens.code}</small>
                <strong>{pick(lens.title, locale)}</strong>
                <p>{pick(lens.note, locale)}</p>
              </div>
            </article>
          ))}
        </section>

        <footer className="projects-analysis__footer">
          <span>
            <i />
            {ar ? "أربعة محاور ضمن رؤية واحدة" : "Four lenses, one perspective"}
          </span>
          <strong>
            {ar ? "لا نتائج فعلية قبل ربط محرك التحليل" : "No live results before the analysis engine is connected"}
          </strong>
        </footer>
      </section>
    </PlatformShell>
  );
}
