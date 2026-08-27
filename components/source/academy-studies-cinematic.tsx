import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import type {
  PlatformModuleDefinition,
  PlatformServiceDefinition,
} from "@/lib/platform/catalog";
import { resolveModuleHref, type PlatformNavigationMode } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

const studyFields = [
  {
    code: "STRATEGY",
    title: ["دراسات استراتيجية", "Strategic studies"],
    note: ["القرار والرؤية والتحول", "Decision, vision, and transformation"],
  },
  {
    code: "SECTORS",
    title: ["دراسات قطاعية", "Sector studies"],
    note: ["القطاعات والاتجاهات والفرص", "Sectors, trends, and opportunities"],
  },
  {
    code: "MARKETS",
    title: ["دراسات الأسواق", "Market studies"],
    note: ["الحركة والطلب والمنافسة", "Movement, demand, and competition"],
  },
  {
    code: "ORGANIZATION",
    title: ["دراسات مؤسسية", "Institutional studies"],
    note: ["الكفاءة والهيكلة والتطوير", "Capability, structure, and development"],
  },
] as const;

function KnowledgeAtlas() {
  return (
    <svg className="studies-atlas" viewBox="0 0 760 620" aria-hidden="true">
      <defs>
        <linearGradient id="studies-line" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5edce9" stopOpacity=".18" />
          <stop offset=".55" stopColor="#67d7a1" stopOpacity=".92" />
          <stop offset="1" stopColor="#e1c579" stopOpacity=".86" />
        </linearGradient>
        <radialGradient id="studies-light">
          <stop stopColor="#e1c579" stopOpacity=".72" />
          <stop offset=".22" stopColor="#67d7a1" stopOpacity=".24" />
          <stop offset="1" stopColor="#5edce9" stopOpacity="0" />
        </radialGradient>
        <filter id="studies-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className="studies-atlas__grid">
        <path d="M54 554h652M92 518h576M132 482h496M178 446h404" />
        <path d="m54 554 246-184h160l246 184M134 554l190-184M626 554 436 370" />
      </g>
      <g className="studies-atlas__orbit">
        <ellipse cx="380" cy="298" rx="270" ry="166" />
        <ellipse cx="380" cy="298" rx="212" ry="126" />
        <ellipse cx="380" cy="298" rx="150" ry="87" />
        <path d="M110 298h540M380 132v332M190 181l380 234M570 181 190 415" />
      </g>
      <circle cx="380" cy="298" r="188" fill="url(#studies-light)" />
      <g className="studies-atlas__pages" filter="url(#studies-glow)">
        <path d="M380 230c-63-42-133-47-201-19v170c68-25 136-15 201 28Z" />
        <path d="M380 230c63-42 133-47 201-19v170c-68-25-136-15-201 28Z" />
        <path d="M380 230v179M203 245c58-18 108-7 156 18M557 245c-58-18-108-7-156 18" />
        <path d="M220 291c48-13 92-5 133 17M540 291c-48-13-92-5-133 17M220 337c48-11 92-3 133 20M540 337c-48-11-92-3-133 20" />
      </g>
      <g className="studies-atlas__signals">
        <path d="M380 205V76M244 205 152 116M516 205l92-89M174 360 74 404M586 360l100 44" />
        <circle cx="380" cy="76" r="5" /><circle cx="152" cy="116" r="4" />
        <circle className="gold" cx="608" cy="116" r="5" /><circle cx="74" cy="404" r="4" />
        <circle className="gold" cx="686" cy="404" r="4" />
      </g>
      <g className="studies-atlas__core" filter="url(#studies-glow)">
        <circle cx="380" cy="298" r="27" /><circle cx="380" cy="298" r="7" />
      </g>
    </svg>
  );
}

export function AcademyStudiesCinematic({
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
      <section className="academy-studies" data-locale={locale} aria-labelledby="academy-studies-title">
        <div className="academy-studies__traces" aria-hidden="true"><span /><span /><i /><i /></div>

        <header className="academy-studies__header">
          <Link href={resolveModuleHref(module, navigationMode)} className="academy-studies__back">
            <span aria-hidden="true">←</span>{pick(module.title, locale)}
          </Link>
          <small>{module.code} / STUDIES NODE 01</small>
          <p>{ar ? "مختبر المعرفة التطبيقية" : "Applied knowledge laboratory"}</p>
          <h1 id="academy-studies-title">
            {ar ? <>من المعرفة <span>إلى القرار.</span></> : <>From knowledge <span>to decision.</span></>}
          </h1>
          <em>{pick(service.description, locale)}</em>
        </header>

        <aside className="academy-studies__navigator" aria-label={ar ? "مستكشف الدراسات" : "Studies navigator"}>
          <div><small>KNOWLEDGE INDEX</small><strong>{ar ? "مستكشف الدراسات" : "Studies navigator"}</strong></div>
          {[ar ? "المجال المعرفي" : "Knowledge domain", ar ? "نوع الدراسة" : "Study type", ar ? "النطاق الجغرافي" : "Geographic scope", ar ? "الأفق الزمني" : "Time horizon"].map((label, index) => (
            <span key={label}><b>{String(index + 1).padStart(2, "0")}</b><strong>{label}</strong><i /></span>
          ))}
          <p>{ar ? "واجهة استكشاف تصميمية — البحث والبيانات غير مفعّلين." : "Design-only discovery interface — search and data are inactive."}</p>
        </aside>

        <div className="academy-studies__stage">
          <KnowledgeAtlas />
          <div className="academy-studies__stage-label">
            <small>JANAN KNOWLEDGE ATLAS</small>
            <strong>{ar ? "أطلس الدراسات المتخصصة" : "Specialized studies atlas"}</strong>
            <span><i />{ar ? "نموذج بصري تجريبي" : "Visual preview model"}</span>
          </div>
        </div>

        <section className="academy-studies__fields" aria-label={ar ? "مسارات الدراسات" : "Study fields"}>
          {studyFields.map((field, index) => (
            <article key={field.code}>
              <span><i /><b>{String(index + 1).padStart(2, "0")}</b></span>
              <div><small>{field.code}</small><strong>{pick(field.title, locale)}</strong><p>{pick(field.note, locale)}</p></div>
            </article>
          ))}
        </section>

        <footer className="academy-studies__truth">
          <span><i />{ar ? "محتوى ومسارات تجريبية" : "SAMPLE CONTENT AND PATHS"}</span>
          <strong>{ar ? "لا بحث أو بيانات فعلية" : "NO LIVE SEARCH OR DATA"}</strong>
        </footer>
      </section>
    </PlatformShell>
  );
}
