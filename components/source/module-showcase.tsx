import Link from "next/link";

import { ModuleIdentityScene } from "@/components/source/module-identity";
import { PlatformShell } from "@/components/source/source-ui";
import { Icon } from "@/components/ui/icons";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function ProjectServiceGlyph({ slug }: { slug: string }) {
  const commonProps = {
    className: "project-service-glyph",
    viewBox: "0 0 64 64",
    role: "presentation",
  } as const;

  switch (slug) {
    case "analysis":
      return (
        <svg {...commonProps}>
          <path
            className="project-service-glyph__orbit"
            d="M8 31C9 16 20 7 35 7c10 0 18 4 23 11"
          />
          <path
            className="project-service-glyph__primary"
            d="M7 46h10l8-18 10 11 9-24 13 15"
          />
          <path
            className="project-service-glyph__secondary"
            d="M10 53h45M13 49v7M31 49v7M50 49v7"
          />
          <circle
            className="project-service-glyph__node project-service-glyph__node--gold"
            cx="44"
            cy="15"
            r="2.6"
          />
          <circle
            className="project-service-glyph__node"
            cx="25"
            cy="28"
            r="2.4"
          />
        </svg>
      );
    case "feasibility-study":
      return (
        <svg {...commonProps}>
          <path
            className="project-service-glyph__orbit"
            d="M8 34C7 20 17 8 31 7M43 10c8 4 13 12 13 21"
          />
          <path
            className="project-service-glyph__primary"
            d="M32 11a21 21 0 1 0 21 21H32Z"
          />
          <path
            className="project-service-glyph__secondary"
            d="M36 8v20h20A20 20 0 0 0 36 8Z"
          />
          <path
            className="project-service-glyph__gold"
            d="M32 32 18 47M32 32h21"
          />
          <circle
            className="project-service-glyph__node project-service-glyph__node--gold"
            cx="32"
            cy="32"
            r="2.8"
          />
        </svg>
      );
    case "evaluation":
      return (
        <svg {...commonProps}>
          <path
            className="project-service-glyph__orbit"
            d="M10 22C18 7 40 3 53 16M57 25c4 16-7 30-22 33"
          />
          <path
            className="project-service-glyph__primary"
            d="m32 8 21 16-8 25-26 1L10 25Z"
          />
          <path
            className="project-service-glyph__secondary"
            d="M32 8v42M10 25l35 24M53 24 19 50"
          />
          <path
            className="project-service-glyph__gold"
            d="m24 32 6 6 12-15"
          />
          <circle
            className="project-service-glyph__node project-service-glyph__node--gold"
            cx="32"
            cy="32"
            r="3"
          />
        </svg>
      );
    case "start":
      return (
        <svg {...commonProps}>
          <path
            className="project-service-glyph__orbit"
            d="M10 37C13 17 26 7 45 8M51 13c6 7 8 15 6 24"
          />
          <path
            className="project-service-glyph__primary"
            d="M32 7c11 8 15 20 11 33L32 51 21 40C18 27 22 15 32 7Z"
          />
          <path
            className="project-service-glyph__secondary"
            d="m21 33-10 10 12 1M43 33l10 10-12 1"
          />
          <path
            className="project-service-glyph__gold"
            d="M27 52 32 60l5-8M32 14v17"
          />
          <circle
            className="project-service-glyph__node project-service-glyph__node--gold"
            cx="32"
            cy="34"
            r="3.2"
          />
        </svg>
      );
    default:
      return (
        <svg {...commonProps}>
          <path
            className="project-service-glyph__primary"
            d="M12 32 24 12h24l8 20-12 20H20Z"
          />
          <circle
            className="project-service-glyph__node"
            cx="32"
            cy="32"
            r="4"
          />
        </svg>
      );
  }
}

export function ModuleShowcase({
  locale,
  module,
  userLabel,
}: {
  locale: Locale;
  module: PlatformModuleDefinition;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <PlatformShell
      locale={locale}
      activeRoute={module.route}
      userLabel={userLabel}
    >
      <section
        className={"module-showcase module-showcase--" + module.scene}
        aria-labelledby="module-showcase-title"
      >
        <div className="module-showcase__atmosphere" aria-hidden="true">
          <ModuleIdentityScene route={module.route} />
        </div>

        <div className="module-showcase__circuits" aria-hidden="true">
          <span />
          <span />
          <span />
          <i />
          <i />
          <i />
        </div>

        <header className="module-showcase__copy">
          <div className="module-showcase__identity">
            <span className="module-showcase__code">{module.code}</span>
            <span className="module-showcase__live">
              <i />
              {ar ? "هوية قسم المشاريع" : "Projects identity"}
            </span>
          </div>
          <p className="module-showcase__eyebrow">
            {pick(module.eyebrow, locale)}
          </p>
          <h1 id="module-showcase-title">{pick(module.title, locale)}</h1>
          <p className="module-showcase__description">
            {pick(module.description, locale)}
          </p>
          <div className="module-showcase__signature">
            <span aria-hidden="true" />
            <strong>{pick(module.signature, locale)}</strong>
          </div>
        </header>

        <nav
          className="module-showcase__services"
          aria-label={ar ? "خدمات قسم المشاريع" : "Projects services"}
        >
          <div className="module-showcase__services-heading">
            <span>{ar ? "اختر نقطة البداية" : "Choose your starting point"}</span>
            <strong>
              {module.services.length}{" "}
              {ar ? "مسارات متخصصة" : "focused paths"}
            </strong>
          </div>
          <div className="module-showcase__service-list">
            {module.services.map((service, index) => (
              <Link
                className="module-showcase__service"
                href={service.href}
                key={service.id}
              >
                <span className="module-showcase__service-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className="module-showcase__service-icon"
                  aria-hidden="true"
                >
                  <ProjectServiceGlyph slug={service.slug} />
                </span>
                <span className="module-showcase__service-copy">
                  <strong>{pick(service.title, locale)}</strong>
                  <small>{pick(service.description, locale)}</small>
                </span>
                <span
                  className="module-showcase__service-arrow"
                  aria-hidden="true"
                >
                  <Icon name="arrow" />
                </span>
              </Link>
            ))}
          </div>
        </nav>

        <footer className="module-showcase__truth">
          <Icon name="shield" />
          <span>
            {ar
              ? "واجهات تصميمية قابلة للتطوير — لا توجد عمليات أو بيانات فعلية"
              : "Evolution-ready design interfaces — no live operations or data"}
          </span>
        </footer>
      </section>
    </PlatformShell>
  );
}
