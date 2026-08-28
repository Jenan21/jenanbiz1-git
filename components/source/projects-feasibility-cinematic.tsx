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

const feasibilityLenses = [
  { code: "MARKET", title: ["جدوى السوق", "Market viability"], note: ["الطلب والحجم والبدائل", "Demand, size, and alternatives"] },
  { code: "MODEL", title: ["نموذج الإيراد", "Revenue model"], note: ["مصادر الدخل وآلية التسعير", "Income sources and pricing"] },
  { code: "COST", title: ["هيكل التكاليف", "Cost structure"], note: ["التأسيس والتشغيل والموارد", "Setup, operations, and resources"] },
  { code: "DECISION", title: ["بوابة القرار", "Decision gateway"], note: ["الافتراضات والبدائل التالية", "Assumptions and next alternatives"] },
] as const;

function FeasibilityCore() {
  return (
    <svg className="feasibility-stage__core" viewBox="0 0 760 600" aria-hidden="true">
      <defs>
        <linearGradient id="feasibility-line" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5edce9" stopOpacity=".18" />
          <stop offset=".48" stopColor="#67d7a1" stopOpacity=".92" />
          <stop offset=".78" stopColor="#5edce9" stopOpacity=".84" />
          <stop offset="1" stopColor="#e1c579" stopOpacity=".88" />
        </linearGradient>
        <radialGradient id="feasibility-energy">
          <stop stopColor="#67d7a1" stopOpacity=".3" />
          <stop offset=".3" stopColor="#e1c579" stopOpacity=".13" />
          <stop offset=".68" stopColor="#5edce9" stopOpacity=".05" />
          <stop offset="1" stopColor="#5edce9" stopOpacity="0" />
        </radialGradient>
        <filter id="feasibility-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="feasibility-stage__floor">
        <path d="M54 532 220 405h320l166 127M120 532l146-127M640 532 494 405" />
        <path d="M54 532h652M92 505h576M138 478h484M190 442h380" />
      </g>
      <circle cx="380" cy="292" r="204" fill="url(#feasibility-energy)" />
      <g className="feasibility-stage__rings" filter="url(#feasibility-glow)">
        <circle cx="380" cy="292" r="190" /><circle cx="380" cy="292" r="151" />
        <circle cx="380" cy="292" r="112" /><path d="M380 102v380M190 292h380" />
        <path d="M246 158 514 426M514 158 246 426" />
      </g>
      <g className="feasibility-stage__dial">
        <path d="M270 318a118 118 0 0 1 220 0" />
        <path className="feasibility-stage__gold-line" d="M292 296a94 94 0 0 1 176 0" />
        <path d="m380 292 72-66" /><circle cx="380" cy="292" r="14" />
        <circle className="feasibility-stage__gold-node" cx="452" cy="226" r="5" />
      </g>
      <g className="feasibility-stage__bars">
        <path d="M292 382v-38h28v38M337 382v-68h28v68M382 382v-92h28v92M427 382v-124h28v124" />
        <path className="feasibility-stage__gold-line" d="m290 332 60-36 48 11 72-94" />
      </g>
      <g className="feasibility-stage__signals">
        <path d="M380 88V38M178 292H62M582 292h116M238 148l-82-72M522 148l82-72" />
        <circle cx="380" cy="38" r="4" /><circle cx="62" cy="292" r="4" />
        <circle className="feasibility-stage__gold-node" cx="604" cy="76" r="4" />
      </g>
    </svg>
  );
}

export function ProjectsFeasibilityCinematic({
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
    <PlatformShell locale={locale} activeRoute={module.route} userLabel={userLabel} immersive>
      <section className="projects-analysis projects-feasibility" aria-labelledby="projects-feasibility-title">
        <ServiceToolDock
          locale={locale}
          moduleId={module.id}
          navigationMode={navigationMode}
          serviceSlug={service.slug}
        />
        <ProjectsInteractiveExperience locale={locale} mode="feasibility" />
        <div className="projects-analysis__traces" aria-hidden="true">
          <span /><span /><span /><i /><i />
        </div>
        <header className="projects-analysis__header">
          <Link href={resolveModuleHref(module, navigationMode)} className="projects-analysis__back">
            <span aria-hidden="true">←</span>{pick(module.title, locale)}
          </Link>
          <span className="projects-analysis__code">{module.code} / FEASIBILITY NODE 02</span>
          <h1 id="projects-feasibility-title">{pick(service.title, locale)}</h1>
          <p>{pick(service.description, locale)}</p>
          <Link href="/projects-feasibility-report-review" className="projects-report-link">{ar ? "معاينة تقرير دراسة الجدوى" : "Feasibility report preview"}</Link>
        </header>
        <aside className="projects-analysis__inputs" aria-label={ar ? "مدخلات دراسة الجدوى" : "Feasibility inputs"}>
          <div className="projects-analysis__panel-title">
            <small>STUDY PARAMETERS</small><strong>{ar ? "نطاق الدراسة" : "Study scope"}</strong>
          </div>
          {[
            ["01", ar ? "المشروع والقطاع" : "Project and sector"],
            ["02", ar ? "السوق المستهدف" : "Target market"],
            ["03", ar ? "حجم التشغيل" : "Operating scale"],
            ["04", ar ? "الأفق الزمني" : "Planning horizon"],
          ].map(([number, label]) => (
            <div className="projects-analysis__input-line" key={number}>
              <span>{number}</span><strong>{label}</strong><i />
            </div>
          ))}
          <p>{ar ? "واجهة تصميمية — لا توجد حسابات أو نتائج مالية فعلية." : "Design interface — no live calculations or financial results."}</p>
        </aside>
        <div className="projects-analysis__stage projects-feasibility__stage">
          <FeasibilityCore />
          <div className="projects-analysis__stage-label">
            <small>FEASIBILITY MATRIX</small>
            <strong>{ar ? "مصفوفة الجدوى" : "Feasibility matrix"}</strong>
            <span><i />{ar ? "بيانات تجريبية" : "Preview data"}</span>
          </div>
        </div>
        <section className="projects-analysis__lenses" aria-label={ar ? "محاور دراسة الجدوى" : "Feasibility lenses"}>
          {feasibilityLenses.map((lens, index) => (
            <article className={"projects-analysis__lens projects-analysis__lens--" + (index + 1)} key={lens.code}>
              <span className="projects-analysis__lens-orbit" aria-hidden="true">
                <i /><b>{String(index + 1).padStart(2, "0")}</b>
              </span>
              <div><small>{lens.code}</small><strong>{pick(lens.title, locale)}</strong><p>{pick(lens.note, locale)}</p></div>
            </article>
          ))}
        </section>
        <footer className="projects-analysis__footer">
          <span><i />{ar ? "سوق وتكاليف وإيراد ضمن قرار واحد" : "Market, cost, and revenue in one decision"}</span>
          <strong>{ar ? "لا توصية فعلية قبل ربط محرك الدراسة" : "No live recommendation before the study engine is connected"}</strong>
        </footer>
      </section>
    </PlatformShell>
  );
}
