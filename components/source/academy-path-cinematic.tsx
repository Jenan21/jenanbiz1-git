import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import { ServiceToolDock } from "@/components/source/service-tool-workspace";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import {
  resolveModuleHref,
  type PlatformNavigationMode,
} from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type AcademyPath = "seminars" | "research" | "courses";
const pick = (copy: Copy, locale: Locale) =>
  locale === "ar" ? copy[0] : copy[1];

const content: Record<
  AcademyPath,
  {
    code: string;
    eyebrow: Copy;
    title: Copy;
    accent: Copy;
    navigator: Copy;
    fields: readonly [string, Copy][];
    phases: readonly { code: string; title: Copy; note: Copy }[];
  }
> = {
  seminars: {
    code: "DIALOGUE CHAMBER 02",
    eyebrow: ["مساحة الأفكار الحية", "A space for living ideas"],
    title: ["الفكرة تصبح", "Ideas become"],
    accent: ["حوارًا.", "dialogue."],
    navigator: ["منظم الندوة", "Seminar curator"],
    fields: [
      ["01", ["محور الندوة", "Seminar theme"]],
      ["02", ["المتحدثون", "Speakers"]],
      ["03", ["الجمهور", "Audience"]],
      ["04", ["موعد البث", "Broadcast time"]],
    ],
    phases: [
      {
        code: "THEME",
        title: ["المحور", "Theme"],
        note: ["فكرة واضحة للنقاش", "A focused idea to discuss"],
      },
      {
        code: "VOICES",
        title: ["الأصوات", "Voices"],
        note: ["خبرات ووجهات نظر", "Expertise and perspectives"],
      },
      {
        code: "DIALOGUE",
        title: ["الحوار", "Dialogue"],
        note: ["أسئلة ونقاش حي", "Questions and live exchange"],
      },
      {
        code: "IMPACT",
        title: ["الأثر", "Impact"],
        note: ["معرفة قابلة للمشاركة", "Knowledge worth sharing"],
      },
    ],
  },
  research: {
    code: "EVIDENCE LAB 03",
    eyebrow: ["مختبر الدليل والمعرفة", "Evidence and knowledge lab"],
    title: ["السؤال يصبح", "Questions become"],
    accent: ["معرفة.", "knowledge."],
    navigator: ["مستكشف الأبحاث", "Research explorer"],
    fields: [
      ["01", ["مجال البحث", "Research field"]],
      ["02", ["نوع المنهج", "Methodology"]],
      ["03", ["مصدر الدليل", "Evidence source"]],
      ["04", ["حالة النشر", "Publication state"]],
    ],
    phases: [
      {
        code: "QUESTION",
        title: ["السؤال", "Question"],
        note: ["فرضية قابلة للفحص", "A testable hypothesis"],
      },
      {
        code: "EVIDENCE",
        title: ["الدليل", "Evidence"],
        note: ["مصادر وبيانات موثقة", "Sources and documented data"],
      },
      {
        code: "INSIGHT",
        title: ["التحليل", "Analysis"],
        note: ["روابط واستنتاجات", "Connections and findings"],
      },
      {
        code: "PUBLISH",
        title: ["النشر", "Publish"],
        note: ["معرفة منظمة وواضحة", "Structured, clear knowledge"],
      },
    ],
  },
  courses: {
    code: "LEARNING ORBIT 04",
    eyebrow: ["مسار تعلم يتطور معك", "A learning path that evolves with you"],
    title: ["المعرفة تصبح", "Knowledge becomes"],
    accent: ["مهارة.", "capability."],
    navigator: ["مخطط المسار", "Learning path planner"],
    fields: [
      ["01", ["المجال", "Domain"]],
      ["02", ["المستوى", "Level"]],
      ["03", ["نمط التعلم", "Learning mode"]],
      ["04", ["المدة", "Duration"]],
    ],
    phases: [
      {
        code: "FOUNDATION",
        title: ["الأساس", "Foundation"],
        note: ["مفاهيم تبني الفهم", "Concepts that build understanding"],
      },
      {
        code: "MATERIAL",
        title: ["المادة", "Material"],
        note: ["محتوى منظم ومتدرج", "Structured, progressive content"],
      },
      {
        code: "PRACTICE",
        title: ["التطبيق", "Practice"],
        note: ["تمارين وتجارب عملية", "Exercises and applied work"],
      },
      {
        code: "MASTERY",
        title: ["الإتقان", "Mastery"],
        note: ["مهارة قابلة للاستخدام", "Capability ready to apply"],
      },
    ],
  },
};

function PathCore({ variant }: { variant: AcademyPath }) {
  return (
    <svg
      className="academy-path__core"
      viewBox="0 0 760 610"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`path-line-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5edce9" stopOpacity=".16" />
          <stop offset=".55" stopColor="#67d7a1" stopOpacity=".92" />
          <stop offset="1" stopColor="#e1c579" stopOpacity=".88" />
        </linearGradient>
        <radialGradient id={`path-light-${variant}`}>
          <stop stopColor="#e1c579" stopOpacity=".68" />
          <stop offset=".22" stopColor="#67d7a1" stopOpacity=".22" />
          <stop offset="1" stopColor="#5edce9" stopOpacity="0" />
        </radialGradient>
        <filter
          id={`path-glow-${variant}`}
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="academy-path__grid">
        <path d="M50 548h660M94 508h572M140 468h480M188 428h384" />
        <path d="M50 548 284 360h192l234 188M136 548l184-188M624 548 440 360" />
      </g>
      <g className="academy-path__orbit">
        <ellipse cx="380" cy="295" rx="265" ry="166" />
        <ellipse cx="380" cy="295" rx="202" ry="124" />
        <path d="M115 295h530M380 129v332M192 177l376 236M568 177 192 413" />
      </g>
      <circle cx="380" cy="295" r="188" fill={`url(#path-light-${variant})`} />
      {variant === "seminars" ? (
        <g
          className="academy-path__subject"
          filter={`url(#path-glow-${variant})`}
        >
          <path d="M230 398c38-86 92-126 150-126s112 40 150 126M270 418c30-65 66-94 110-94s80 29 110 94M310 438c19-40 42-58 70-58s51 18 70 58" />
          <path d="M380 168v120M352 205h56v82h-56zM335 438h90" />
          <circle cx="380" cy="168" r="12" />
        </g>
      ) : null}
      {variant === "research" ? (
        <g
          className="academy-path__subject"
          filter={`url(#path-glow-${variant})`}
        >
          <circle cx="350" cy="275" r="112" />
          <circle cx="350" cy="275" r="69" />
          <path d="m430 355 112 112M278 275h144M350 203v144M225 160 164 104M475 160l61-56M225 390l-61 56" />
          <circle cx="350" cy="275" r="8" />
        </g>
      ) : null}
      {variant === "courses" ? (
        <g
          className="academy-path__subject"
          filter={`url(#path-glow-${variant})`}
        >
          <path d="M230 405h96v-58h92v-58h92v-58h76M230 430c92 24 192 15 292-27M230 365c82 20 168 13 256-22M230 302c70 16 142 11 217-19" />
          <circle cx="278" cy="405" r="8" />
          <circle cx="372" cy="347" r="8" />
          <circle cx="464" cy="289" r="8" />
          <circle cx="548" cy="231" r="8" />
        </g>
      ) : null}
      <g className="academy-path__signals">
        <path d="M380 126V58M168 295H72M592 295h96M226 178l-70-68M534 178l70-68" />
        <circle cx="380" cy="58" r="5" />
        <circle cx="72" cy="295" r="4" />
        <circle className="gold" cx="688" cy="295" r="5" />
        <circle cx="156" cy="110" r="4" />
        <circle className="gold" cx="604" cy="110" r="4" />
      </g>
    </svg>
  );
}

export function AcademyPathCinematic({
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
  const variant = service.slug as AcademyPath;
  const copy = content[variant] ?? content.seminars;
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute={module.route}
      userLabel={userLabel}
      immersive
    >
      <section
        className="academy-path"
        data-variant={variant}
        data-locale={locale}
        aria-labelledby="academy-path-title"
      >
        <ServiceToolDock
          locale={locale}
          moduleId={module.id}
          navigationMode={navigationMode}
          serviceSlug={service.slug}
        />
        <div className="academy-path__traces" aria-hidden="true">
          <span />
          <span />
          <i />
          <i />
        </div>
        <header className="academy-path__header">
          <Link
            href={resolveModuleHref(module, navigationMode)}
            className="academy-path__back"
          >
            <span aria-hidden="true">←</span>
            {pick(module.title, locale)}
          </Link>
          <small>
            {module.code} / {copy.code}
          </small>
          <p>{pick(copy.eyebrow, locale)}</p>
          <h1 id="academy-path-title">
            {pick(copy.title, locale)} <span>{pick(copy.accent, locale)}</span>
          </h1>
          <em>{pick(service.description, locale)}</em>
        </header>
        <aside
          className="academy-path__navigator"
          aria-label={pick(copy.navigator, locale)}
        >
          <div>
            <small>{copy.code}</small>
            <strong>{pick(copy.navigator, locale)}</strong>
          </div>
          {copy.fields.map(([number, label]) => (
            <span key={number}>
              <b>{number}</b>
              <strong>{pick(label, locale)}</strong>
              <i />
            </span>
          ))}
          <p>
            {ar
              ? "واجهة تصميمية — الإدخال والبيانات غير مفعّلين."
              : "Design interface — input and data are inactive."}
          </p>
        </aside>
        <div className="academy-path__stage">
          <PathCore variant={variant} />
          <div>
            <small>JANAN / {copy.code}</small>
            <strong>{pick(service.title, locale)}</strong>
            <span>
              <i />
              {ar ? "نموذج بصري تجريبي" : "Visual preview model"}
            </span>
          </div>
        </div>
        <section
          className="academy-path__phases"
          aria-label={ar ? "مراحل المسار" : "Path phases"}
        >
          {copy.phases.map((phase, index) => (
            <article key={phase.code}>
              <span>
                <i />
                <b>{String(index + 1).padStart(2, "0")}</b>
              </span>
              <div>
                <small>{phase.code}</small>
                <strong>{pick(phase.title, locale)}</strong>
                <p>{pick(phase.note, locale)}</p>
              </div>
            </article>
          ))}
        </section>
        <footer className="academy-path__truth">
          <span>
            <i />
            {ar ? "محتوى ومسارات تجريبية" : "SAMPLE CONTENT AND PATHS"}
          </span>
          <strong>
            {ar ? "لا تسجيل أو بيانات فعلية" : "NO LIVE ENROLLMENT OR DATA"}
          </strong>
        </footer>
      </section>
    </PlatformShell>
  );
}
