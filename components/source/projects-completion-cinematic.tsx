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

const evaluationLenses = [
  { code: "VALUE", title: ["قيمة المشروع", "Project value"], note: ["وضوح الأثر والميزة", "Impact and advantage"] },
  { code: "FIT", title: ["ملاءمة السوق", "Market fit"], note: ["الحاجة والجمهور والتوقيت", "Need, audience, and timing"] },
  { code: "READY", title: ["جاهزية التنفيذ", "Delivery readiness"], note: ["الفريق والموارد والمسار", "Team, resources, and path"] },
  { code: "RISK", title: ["درجة المخاطر", "Risk posture"], note: ["العوائق والمرونة والبدائل", "Blockers, resilience, and options"] },
] as const;

const launchLenses = [
  { code: "SPACE", title: ["مساحة المشروع", "Project space"], note: ["الهوية والنطاق والملكية", "Identity, scope, and ownership"] },
  { code: "TEAM", title: ["تشكيل الفريق", "Team formation"], note: ["الأدوار والمسؤوليات", "Roles and responsibilities"] },
  { code: "PLAN", title: ["المسار الأول", "First roadmap"], note: ["المراحل والمخرجات", "Stages and outcomes"] },
  { code: "GATE", title: ["بوابة الانطلاق", "Launch gateway"], note: ["المراجعة والاعتماد", "Review and approval"] },
] as const;

function EvaluationCore() {
  return (
    <svg className="completion-stage__core" viewBox="0 0 760 600" aria-hidden="true">
      <g className="completion-stage__floor">
        <path d="M52 532 222 404h316l170 128M120 532l148-128M640 532 492 404" />
        <path d="M52 532h656M94 503h572M142 470h476M198 434h364" />
      </g>
      <g className="completion-stage__rings">
        <circle cx="380" cy="292" r="196" /><circle cx="380" cy="292" r="154" />
        <circle cx="380" cy="292" r="108" /><path d="M380 96v392M184 292h392" />
      </g>
      <g className="completion-stage__radar">
        <path d="m380 142 126 98-48 160-156 8-60-166Z" />
        <path d="m380 188 86 66-34 110-106 5-40-113Z" />
        <path d="m380 226 52 40-20 66-64 3-24-68Z" />
        <path d="M380 142v250M242 242l216 158M506 240 302 408" />
        <path className="completion-stage__gold-line" d="m380 188 52 78-20 66-86 37-40-113Z" />
        <circle className="completion-stage__gold-node" cx="432" cy="266" r="6" />
      </g>
      <g className="completion-stage__signals">
        <path d="M380 82V34M174 292H58M586 292h116M236 148l-82-76M524 148l82-76" />
        <circle cx="380" cy="34" r="4" /><circle cx="702" cy="292" r="4" />
        <circle className="completion-stage__gold-node" cx="154" cy="72" r="4" />
      </g>
    </svg>
  );
}

function LaunchCore() {
  return (
    <svg className="completion-stage__core" viewBox="0 0 760 600" aria-hidden="true">
      <g className="completion-stage__floor">
        <path d="M52 532 222 404h316l170 128M120 532l148-128M640 532 492 404" />
        <path d="M52 532h656M94 503h572M142 470h476M198 434h364" />
      </g>
      <g className="completion-stage__rings">
        <circle cx="380" cy="292" r="196" /><circle cx="380" cy="292" r="154" />
        <circle cx="380" cy="292" r="110" /><path d="M380 96v392M184 292h392" />
      </g>
      <g className="completion-stage__rocket">
        <path d="M380 132c76 54 96 146 48 232l-48 54-48-54c-48-86-28-178 48-232Z" />
        <circle cx="380" cy="246" r="38" />
        <path d="m332 330-66 54 82 2M428 330l66 54-82 2" />
        <path className="completion-stage__gold-line" d="M352 414 380 486l28-72M324 434l-18 58M436 434l18 58" />
        <path d="M380 164v44" />
        <circle className="completion-stage__gold-node" cx="380" cy="246" r="7" />
      </g>
      <g className="completion-stage__signals">
        <path d="M380 82V34M174 292H58M586 292h116M236 148l-82-76M524 148l82-76" />
        <circle cx="380" cy="34" r="4" /><circle cx="58" cy="292" r="4" />
        <circle className="completion-stage__gold-node" cx="606" cy="72" r="4" />
      </g>
    </svg>
  );
}

export function ProjectsCompletionCinematic({
  locale,
  module,
  service,
  userLabel,
  mode,
  navigationMode = "live",
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  service: PlatformServiceDefinition;
  userLabel: string;
  mode?: "evaluation" | "launch";
  navigationMode?: PlatformNavigationMode;
}) {
  const ar = locale === "ar";
  const launch = mode ? mode === "launch" : service.slug === "start";
  const lenses = launch ? launchLenses : evaluationLenses;
  const inputs = launch
    ? [
        ["01", ar ? "اسم المشروع" : "Project name"],
        ["02", ar ? "مالك المشروع" : "Project owner"],
        ["03", ar ? "الفريق الأولي" : "Initial team"],
        ["04", ar ? "نقطة الانطلاق" : "Starting point"],
      ]
    : [
        ["01", ar ? "ملخص المشروع" : "Project summary"],
        ["02", ar ? "مرحلة المشروع" : "Project stage"],
        ["03", ar ? "السوق والقطاع" : "Market and sector"],
        ["04", ar ? "أدلة الجاهزية" : "Readiness evidence"],
      ];
  const node = launch ? "LAUNCH NODE 04" : "EVALUATION NODE 03";

  return (
    <PlatformShell locale={locale} activeRoute={module.route} userLabel={userLabel} immersive>
      <section
        className={"projects-analysis projects-completion " + (launch ? "projects-completion--launch" : "projects-completion--evaluation")}
        aria-labelledby="projects-completion-title"
      >
        <ServiceToolDock
          locale={locale}
          moduleId={module.id}
          navigationMode={navigationMode}
          serviceSlug={service.slug}
        />
        <ProjectsInteractiveExperience
          locale={locale}
          mode={launch ? "launch" : "evaluation"}
        />
        <div className="projects-analysis__traces" aria-hidden="true"><span /><span /><span /><i /><i /></div>
        <header className="projects-analysis__header">
          <Link href={resolveModuleHref(module, navigationMode)} className="projects-analysis__back"><span aria-hidden="true">←</span>{pick(module.title, locale)}</Link>
          <span className="projects-analysis__code">{module.code} / {node}</span>
          <h1 id="projects-completion-title">{pick(service.title, locale)}</h1>
          <p>{pick(service.description, locale)}</p>
          <Link href={launch ? "/projects-report-review" : "/projects-evaluation-report-review"} className="projects-report-link">
            {launch ? (ar ? "معاينة الملخص التنفيذي" : "Executive summary preview") : (ar ? "معاينة تقرير التقييم" : "Evaluation report preview")}
          </Link>
        </header>
        <aside className="projects-analysis__inputs" aria-label={ar ? "مدخلات الواجهة" : "Interface inputs"}>
          <div className="projects-analysis__panel-title">
            <small>{launch ? "LAUNCH PARAMETERS" : "EVALUATION INPUTS"}</small>
            <strong>{launch ? (ar ? "تهيئة المساحة" : "Prepare the space") : (ar ? "نطاق التقييم" : "Evaluation scope")}</strong>
          </div>
          {inputs.map(([number, label]) => (
            <div className="projects-analysis__input-line" key={number}><span>{number}</span><strong>{label}</strong><i /></div>
          ))}
          <p>{ar ? "واجهة تصميمية — لا توجد عملية أو نتيجة فعلية." : "Design interface — no live operation or result."}</p>
        </aside>
        <div className="projects-analysis__stage projects-completion__stage">
          {launch ? <LaunchCore /> : <EvaluationCore />}
          <div className="projects-analysis__stage-label">
            <small>{launch ? "PROJECT LAUNCH CORE" : "PROJECT EVALUATION CORE"}</small>
            <strong>{launch ? (ar ? "نواة الانطلاق" : "Launch core") : (ar ? "بوصلة التقييم" : "Evaluation compass")}</strong>
            <span><i />{ar ? "نموذج تجريبي" : "Preview model"}</span>
          </div>
        </div>
        <section className="projects-analysis__lenses" aria-label={ar ? "محاور الواجهة" : "Interface lenses"}>
          {lenses.map((lens, index) => (
            <article className={"projects-analysis__lens projects-analysis__lens--" + (index + 1)} key={lens.code}>
              <span className="projects-analysis__lens-orbit" aria-hidden="true"><i /><b>{String(index + 1).padStart(2, "0")}</b></span>
              <div><small>{lens.code}</small><strong>{pick(lens.title, locale)}</strong><p>{pick(lens.note, locale)}</p></div>
            </article>
          ))}
        </section>
        <footer className="projects-analysis__footer">
          <span><i />{launch ? (ar ? "من القرار إلى مساحة مشروع واضحة" : "From decision to a clear project space") : (ar ? "أربعة محاور ضمن بوصلة قرار واحدة" : "Four lenses within one decision compass")}</span>
          <strong>{ar ? "التشغيل غير مفعّل في هذه المرحلة" : "Operations are inactive at this stage"}</strong>
        </footer>
      </section>
    </PlatformShell>
  );
}
