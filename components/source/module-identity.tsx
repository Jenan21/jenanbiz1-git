import Link from "next/link";
import type { CSSProperties } from "react";

import { Icon, type IconName } from "@/components/ui/icons";
import { findPlatformModule } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

type Pair = readonly [ar: string, en: string];

interface IdentityProfile {
  code: string;
  icon: IconName;
  title: Pair;
  signature: Pair;
}

export interface ModuleCinemaPresentation {
  accent: string;
  depth: "focused" | "deep";
  lighting: "balanced" | "dramatic";
  motion: "calm" | "ambient";
  preset: string;
}

export const defaultCinemaPresentations: Readonly<
  Record<string, ModuleCinemaPresentation>
> = {
  dashboard: {
    accent: "#58e2dc",
    depth: "deep",
    lighting: "balanced",
    motion: "ambient",
    preset: "global-command",
  },
  projects: {
    accent: "#65dfe6",
    depth: "deep",
    lighting: "dramatic",
    motion: "ambient",
    preset: "future-city",
  },
  academy: {
    accent: "#67e6d0",
    depth: "focused",
    lighting: "balanced",
    motion: "calm",
    preset: "knowledge-atrium",
  },
  talent: {
    accent: "#76e8d4",
    depth: "focused",
    lighting: "dramatic",
    motion: "ambient",
    preset: "human-constellation",
  },
  market: {
    accent: "#58ded2",
    depth: "deep",
    lighting: "dramatic",
    motion: "ambient",
    preset: "global-bazaar",
  },
  software: {
    accent: "#50e2e9",
    depth: "deep",
    lighting: "dramatic",
    motion: "ambient",
    preset: "intelligence-core",
  },
  programs: {
    accent: "#73e4cf",
    depth: "deep",
    lighting: "dramatic",
    motion: "ambient",
    preset: "impact-launch",
  },
  marketing: {
    accent: "#5fe2dd",
    depth: "focused",
    lighting: "dramatic",
    motion: "ambient",
    preset: "signal-studio",
  },
};

const identityProfiles: Readonly<Record<string, IdentityProfile>> = {
  dashboard: {
    code: "GLOBAL / 00",
    icon: "globe",
    title: ["مركز الأعمال", "Business command"],
    signature: ["منظومة واحدة، رؤية كاملة", "One ecosystem, complete vision"],
  },
  projects: {
    code: "BUILD / 01",
    icon: "building",
    title: ["المشاريع", "Projects"],
    signature: ["من المخطط إلى واقع متقن", "From blueprint to built reality"],
  },
  academy: {
    code: "LEARN / 02",
    icon: "graduation",
    title: ["أكاديمية جنان", "Jenan Academy"],
    signature: ["معرفة تتحول إلى أثر", "Knowledge transformed into impact"],
  },
  talent: {
    code: "HUMAN / 03",
    icon: "people",
    title: ["الكفاءات", "Talent"],
    signature: ["المهارة في مدارها الصحيح", "Capability in the right orbit"],
  },
  market: {
    code: "TRADE / 04",
    icon: "cart",
    title: ["سوق جنان", "Jenan Market"],
    signature: ["فرص موثوقة بلا حدود", "Trusted opportunity without borders"],
  },
  software: {
    code: "SYSTEM / 05",
    icon: "settings",
    title: ["البرمجيات", "Software"],
    signature: ["ذكاء يبني ويتكامل", "Intelligence that builds and connects"],
  },
  programs: {
    code: "IMPACT / 06",
    icon: "rocket",
    title: ["البرامج", "Programs"],
    signature: ["رحلات مصممة لصناعة الأثر", "Journeys engineered for impact"],
  },
  marketing: {
    code: "SIGNAL / 07",
    icon: "sparkles",
    title: ["الإعلان والتسويق", "Marketing"],
    signature: ["إشارة واضحة تصل بثقة", "A clear signal, delivered with trust"],
  },
};

function resolveModuleName(route: string) {
  return route.split("/").filter(Boolean)[0] ?? "dashboard";
}

function pick(copy: Pair, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function SceneNodes() {
  return (
    <g className="identity-scene__nodes">
      <circle cx="95" cy="78" r="4" />
      <circle cx="688" cy="88" r="3" />
      <circle cx="742" cy="272" r="4" />
      <circle cx="120" cy="326" r="3" />
      <path d="M99 78H190L230 118" />
      <path d="M688 88H622L590 120" />
      <path d="M742 272H682L650 240" />
      <path d="M120 326H194L226 294" />
    </g>
  );
}

function ProjectsScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--projects">
      <path className="identity-gold" d="M126 286H690" />
      <path d="M174 286V188H256V286M190 188V148H238V188" />
      <path d="M282 286V118H392V286M304 150H370M304 178H370M304 206H370M304 234H370" />
      <path d="M424 286V164H522V286M446 194H500M446 220H500M446 246H500" />
      <path d="M552 286V210H646V286M574 236H624M574 258H624" />
      <path
        className="identity-gold"
        d="M230 148V92H444M394 92L444 116V92M340 92V126"
      />
      <path
        className="identity-floor-line"
        d="M96 332L318 278H500L720 332M154 332L340 286M654 332L478 286"
      />
    </g>
  );
}

function AcademyScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--academy">
      <path d="M408 286C340 244 278 238 205 254V136C278 120 340 132 408 174Z" />
      <path d="M408 286C476 244 538 238 611 254V136C538 120 476 132 408 174Z" />
      <path
        className="identity-gold"
        d="M408 174V286M236 166C296 158 344 170 382 192M580 166C520 158 472 170 434 192"
      />
      <path d="M302 112L408 62L514 112L408 160Z" />
      <path d="M484 126V184" />
      <circle className="identity-gold-fill" cx="484" cy="190" r="7" />
      <path
        className="identity-floor-line"
        d="M120 330H696M218 330L344 286M598 330L472 286"
      />
    </g>
  );
}

function TalentScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--talent">
      <circle cx="408" cy="154" r="58" />
      <path d="M292 296C304 230 344 204 408 204C472 204 512 230 524 296" />
      <circle cx="240" cy="182" r="30" />
      <circle cx="576" cy="182" r="30" />
      <path d="M166 286C174 244 198 224 240 224C276 224 300 240 312 272M650 286C642 244 618 224 576 224C540 224 516 240 504 272" />
      <path
        className="identity-gold"
        d="M270 164L344 146M472 146L546 164M286 250L350 226M466 226L530 250"
      />
      <circle className="identity-gold-fill" cx="408" cy="154" r="9" />
      <circle className="identity-gold-fill" cx="240" cy="182" r="6" />
      <circle className="identity-gold-fill" cx="576" cy="182" r="6" />
    </g>
  );
}

function MarketScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--market">
      <path d="M162 172H654L620 110H196Z" />
      <path
        className="identity-gold"
        d="M196 110H620M242 110L226 172M316 110L308 172M408 110V172M500 110L508 172M574 110L590 172"
      />
      <path d="M184 172V294H632V172M242 294V224H334V294M374 206H584V262H374Z" />
      <path d="M142 306C244 326 326 320 408 292C490 264 574 260 674 282" />
      <path
        className="identity-gold"
        d="M146 304L176 280M146 304L182 314M674 282L642 262M674 282L650 308"
      />
      <circle className="identity-gold-fill" cx="408" cy="292" r="7" />
    </g>
  );
}

function SoftwareScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--software">
      <rect x="300" y="92" width="216" height="216" rx="34" />
      <rect
        className="identity-gold"
        x="342"
        y="134"
        width="132"
        height="132"
        rx="20"
      />
      <circle cx="408" cy="200" r="36" />
      <path d="M300 134H240L212 106M300 184H196M300 234H232L202 264M516 134H576L604 106M516 184H620M516 234H584L614 264" />
      <path d="M342 92V56M392 92V42M442 92V56M474 308V344M424 308V360M374 308V344" />
      <circle className="identity-gold-fill" cx="196" cy="184" r="6" />
      <circle className="identity-gold-fill" cx="620" cy="184" r="6" />
      <path className="identity-gold" d="M390 198L404 212L430 180" />
    </g>
  );
}

function ProgramsScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--programs">
      <path d="M408 72C472 114 490 186 448 248L408 300L368 248C326 186 344 114 408 72Z" />
      <circle className="identity-gold" cx="408" cy="164" r="35" />
      <path d="M367 226L316 260L334 194M449 226L500 260L482 194" />
      <path
        className="identity-gold"
        d="M388 298L408 342L428 298M370 314L360 348M446 314L456 348"
      />
      <path d="M182 290C240 236 288 220 344 228M634 290C576 236 528 220 472 228" />
      <circle className="identity-gold-fill" cx="182" cy="290" r="7" />
      <circle className="identity-gold-fill" cx="634" cy="290" r="7" />
    </g>
  );
}

function MarketingScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--marketing">
      <path d="M230 212L392 150V274L230 234Z" />
      <path
        className="identity-gold"
        d="M230 212L176 206V240L230 234M278 246L298 306H244L230 234"
      />
      <path d="M420 158C470 172 500 206 500 242M438 128C518 150 560 196 560 248M458 96C568 126 624 184 624 260" />
      <circle cx="636" cy="260" r="7" />
      <circle cx="570" cy="248" r="6" />
      <circle className="identity-gold-fill" cx="508" cy="242" r="6" />
      <path d="M176 152H116M180 126L142 88M176 266H120" />
    </g>
  );
}

function DashboardScene() {
  return (
    <g className="identity-scene__subject identity-scene__subject--dashboard">
      <ellipse cx="408" cy="202" rx="166" ry="116" />
      <ellipse cx="408" cy="202" rx="62" ry="116" />
      <path d="M242 202H574M264 144H552M264 260H552" />
      <path
        className="identity-gold"
        d="M408 86V318M292 118L524 286M524 118L292 286"
      />
      <circle className="identity-gold-fill" cx="292" cy="118" r="7" />
      <circle className="identity-gold-fill" cx="524" cy="286" r="7" />
      <circle cx="524" cy="118" r="6" />
      <circle cx="292" cy="286" r="6" />
    </g>
  );
}

function IdentitySubject({ moduleName }: { moduleName: string }) {
  switch (moduleName) {
    case "projects":
      return <ProjectsScene />;
    case "academy":
      return <AcademyScene />;
    case "talent":
      return <TalentScene />;
    case "market":
      return <MarketScene />;
    case "software":
      return <SoftwareScene />;
    case "programs":
      return <ProgramsScene />;
    case "marketing":
      return <MarketingScene />;
    default:
      return <DashboardScene />;
  }
}

export function ModuleIdentityScene({
  presentation,
  route,
}: {
  presentation?: ModuleCinemaPresentation;
  route: string;
}) {
  const moduleName = resolveModuleName(route);
  const profile = identityProfiles[moduleName] ?? identityProfiles.dashboard;
  const scene =
    presentation ??
    defaultCinemaPresentations[moduleName] ??
    defaultCinemaPresentations.dashboard;
  const gradientId = `identity-gradient-${moduleName}`;
  const glowId = `identity-glow-${moduleName}`;
  const sceneStyle = { "--identity-accent": scene.accent } as CSSProperties;

  return (
    <div
      className={`identity-scene identity-scene--${moduleName}`}
      data-depth={scene.depth}
      data-lighting={scene.lighting}
      data-motion={scene.motion}
      data-preset={scene.preset}
      style={sceneStyle}
    >
      <svg viewBox="0 0 816 390" role="img" aria-label={profile.code}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.08" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.75" />
            <stop offset="1" stopColor="#e9ca70" stopOpacity="0.72" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="identity-scene__grid">
          <path d="M36 336L252 260H564L780 336" />
          <path d="M106 336L292 276M710 336L524 276M186 336L326 288M630 336L490 288" />
          <path d="M38 336H778M82 320H734M134 302H682M198 284H618" />
        </g>
        <g style={{ stroke: `url(#${gradientId})` }}>
          <SceneNodes />
          <IdentitySubject moduleName={moduleName} />
        </g>
        <g className="identity-scene__pulse" filter={`url(#${glowId})`}>
          <circle cx="408" cy="202" r="4" />
          <circle cx="408" cy="202" r="13" />
        </g>
      </svg>
      <span className="identity-scene__code">{profile.code}</span>
      <span className="identity-scene__horizon" aria-hidden="true" />
    </div>
  );
}

export async function ModuleIdentityRail({
  activeHref,
  locale,
  route,
}: {
  activeHref?: string;
  locale: Locale;
  route: string;
}) {
  const catalogModule =
    (await findPlatformModule(route)) ??
    (await findPlatformModule("dashboard"));
  const moduleName = catalogModule?.scene ?? resolveModuleName(route);
  const moduleRoute = catalogModule?.route ?? `/${moduleName}`;
  const fallbackProfile =
    identityProfiles[moduleName] ?? identityProfiles.dashboard;
  const profile = catalogModule
    ? {
        code: catalogModule.code,
        icon: catalogModule.icon,
        signature: catalogModule.signature,
        title: catalogModule.title,
      }
    : fallbackProfile;
  const divisions = catalogModule?.services ?? [];

  return (
    <aside className={`identity-rail identity-rail--${moduleName}`}>
      <header className="identity-rail__header">
        <span className="identity-rail__icon" aria-hidden="true">
          <Icon name={profile.icon} />
        </span>
        <span>
          <small>{profile.code}</small>
          <strong>{pick(profile.title, locale)}</strong>
        </span>
      </header>

      <p className="identity-rail__signature">
        {pick(profile.signature, locale)}
      </p>

      <nav aria-label={locale === "ar" ? "خدمات القسم" : "Section services"}>
        {divisions.slice(0, 7).map((division) => {
          const href = division.href ?? moduleRoute;
          const isActive = href === activeHref;
          return (
            <Link
              className="identity-rail__service"
              href={href}
              key={division.id}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="identity-rail__service-icon" aria-hidden="true">
                <Icon name={division.icon} />
              </span>
              <span>
                <strong>{pick(division.title, locale)}</strong>
                <small>
                  {isActive
                    ? locale === "ar"
                      ? "المساحة الحالية"
                      : "Current space"
                    : locale === "ar"
                      ? "استكشف الخدمة"
                      : "Explore service"}
                </small>
              </span>
              <Icon name="arrow" />
            </Link>
          );
        })}
      </nav>

      <footer className="identity-rail__footer">
        <span>
          <i />{" "}
          {locale === "ar" ? "هوية القسم نشطة" : "Section identity active"}
        </span>
        <small>
          {locale === "ar"
            ? "واجهة قابلة للتطوير"
            : "Evolution-ready interface"}
        </small>
      </footer>
    </aside>
  );
}
