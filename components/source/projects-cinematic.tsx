import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import { ProjectsHubPulse } from "@/components/source/projects-interactive-experience";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import { resolveServiceHref } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function ProjectPortalGlyph({ slug }: { slug: string }) {
  if (slug === "analysis") {
    return (
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <path className="portal-glyph__soft" d="M9 52h54M14 48V22M27 48V34M40 48V17M53 48V28" />
        <path className="portal-glyph__gold" d="m12 38 15-12 13 8 18-19" />
        <circle cx="58" cy="15" r="3" />
      </svg>
    );
  }
  if (slug === "feasibility-study") {
    return (
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <path d="M36 9a27 27 0 1 0 27 27H36Z" />
        <path className="portal-glyph__soft" d="M42 9v21h21A21 21 0 0 0 42 9Z" />
        <path className="portal-glyph__gold" d="m22 40 9 8 18-22" />
      </svg>
    );
  }
  if (slug === "evaluation") {
    return (
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <path d="m36 8 25 18-9 30-32 1L10 27Z" />
        <path className="portal-glyph__soft" d="M36 8v49M10 27l42 29M61 26 20 57" />
        <path className="portal-glyph__gold" d="m27 36 7 7 13-17" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 72 72" aria-hidden="true">
      <path d="M36 8c12 9 17 23 12 38L36 58 24 46C20 31 24 17 36 8Z" />
      <path className="portal-glyph__soft" d="m24 38-12 12 14 1M48 38l12 12-14 1" />
      <path className="portal-glyph__gold" d="M30 58 36 67l6-9M36 18v22" />
    </svg>
  );
}

function ProjectsFutureCity() {
  return (
    <svg
      className="projects-cinema__city"
      viewBox="0 0 1200 720"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="project-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#092b45" stopOpacity=".05" />
          <stop offset=".58" stopColor="#0a3851" stopOpacity=".42" />
          <stop offset="1" stopColor="#031521" stopOpacity=".96" />
        </linearGradient>
        <linearGradient id="project-line" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#5edce9" stopOpacity=".12" />
          <stop offset=".52" stopColor="#5edce9" stopOpacity=".92" />
          <stop offset=".82" stopColor="#67d7a1" stopOpacity=".8" />
          <stop offset="1" stopColor="#e1c579" stopOpacity=".76" />
        </linearGradient>
        <linearGradient id="project-glass" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#52d8e7" stopOpacity=".18" />
          <stop offset=".5" stopColor="#143e56" stopOpacity=".42" />
          <stop offset="1" stopColor="#041723" stopOpacity=".76" />
        </linearGradient>
        <radialGradient id="project-core">
          <stop stopColor="#f0d783" stopOpacity=".9" />
          <stop offset=".16" stopColor="#67d7a1" stopOpacity=".44" />
          <stop offset=".55" stopColor="#5edce9" stopOpacity=".12" />
          <stop offset="1" stopColor="#5edce9" stopOpacity="0" />
        </radialGradient>
        <filter id="project-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="1200" height="720" fill="url(#project-sky)" />
      <g className="projects-cinema__horizon">
        <path d="M0 506 318 424h564l318 82" />
        <path d="M64 720 402 424M218 720 468 424M1136 720 798 424M982 720 732 424" />
        <path d="M0 552h1200M0 606h1200M0 672h1200" />
      </g>

      <g className="projects-cinema__architecture">
        <path fill="url(#project-glass)" d="M360 452V245l88-46 88 46v207Z" />
        <path d="M360 245h176M448 199v253M390 272h116M390 310h116M390 348h116M390 386h116" />
        <path fill="url(#project-glass)" d="M536 452V138l102-58 102 58v314Z" />
        <path d="M536 138h204M638 80v372M570 170h136M570 214h136M570 258h136M570 302h136M570 346h136M570 390h136" />
        <path fill="url(#project-glass)" d="M740 452V225l78-38 78 38v227Z" />
        <path d="M740 225h156M818 187v265M770 257h96M770 300h96M770 343h96M770 386h96" />
        <path fill="url(#project-glass)" d="M244 452V327l58-32 58 32v125ZM896 452V310l62-34 62 34v142Z" />
        <path className="projects-cinema__gold" d="M318 295V170h230M520 170l28 17v-17M638 80V39M611 53h54" />
        <path className="projects-cinema__foundation" d="M174 452h872M210 468h780" />
      </g>

      <g className="projects-cinema__signals">
        <path d="M78 118h228l36 36h142" />
        <path d="M28 166h242l42 42h118" />
        <path d="M1122 126H920l-42 42H758" />
        <path className="projects-cinema__gold" d="M1172 188H964l-34 34h-96" />
        <circle cx="78" cy="118" r="4" />
        <circle cx="1122" cy="126" r="4" />
        <circle className="projects-cinema__signal-gold" cx="1172" cy="188" r="4" />
      </g>

      <g className="projects-cinema__core" filter="url(#project-glow)">
        <circle cx="638" cy="432" r="112" fill="url(#project-core)" />
        <circle cx="638" cy="432" r="58" />
        <circle cx="638" cy="432" r="35" />
        <path d="M638 367v130M573 432h130" />
        <circle className="projects-cinema__signal-gold" cx="638" cy="432" r="6" />
      </g>
    </svg>
  );
}

export function ProjectsCinematic({
  locale,
  module,
  userLabel,
  reviewMode = false,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  userLabel: string;
  reviewMode?: boolean;
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
        className="projects-cinema"
        aria-labelledby="projects-cinema-title"
      >
        <ProjectsHubPulse locale={locale} />
        <div className="projects-cinema__visual">
          <ProjectsFutureCity />
          <div className="projects-cinema__scan" aria-hidden="true" />
        </div>

        <header className="projects-cinema__intro">
          <span className="projects-cinema__code">
            {module.code} / {ar ? "بيئة المشاريع" : "PROJECT ENVIRONMENT"}
          </span>
          <p>{pick(module.eyebrow, locale)}</p>
          <h1 id="projects-cinema-title">
            {ar ? (
              <>
                نبني الفكرة
                <span>حتى تصبح واقعًا.</span>
              </>
            ) : (
              <>
                We build the idea
                <span>until it becomes real.</span>
              </>
            )}
          </h1>
          <small>{pick(module.description, locale)}</small>
        </header>

        <nav
          className="projects-cinema__portals"
          aria-label={ar ? "خدمات المشاريع" : "Project services"}
        >
          {module.services.map((service, index) => (
            <Link
              className={"projects-cinema__portal projects-cinema__portal--" + (index + 1)}
              href={resolveServiceHref(service, reviewMode ? "preview" : "live")}
              key={service.id}
            >
              <span className="projects-cinema__portal-orbit" aria-hidden="true">
                <i />
                <b />
                <span>
                  <ProjectPortalGlyph slug={service.slug} />
                </span>
              </span>
              <span className="projects-cinema__portal-copy">
                <small>0{index + 1}</small>
                <strong>{pick(service.title, locale)}</strong>
                <em>{pick(service.description, locale)}</em>
              </span>
            </Link>
          ))}
        </nav>

        <div className="projects-cinema__signature">
          <i />
          <span>{pick(module.signature, locale)}</span>
          <small>
            {ar ? "تصميم الواجهة — غير تشغيلي" : "INTERFACE DESIGN — INACTIVE"}
          </small>
        </div>
      </section>
    </PlatformShell>
  );
}
