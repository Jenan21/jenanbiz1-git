import Link from "next/link";

import { PlatformShell } from "@/components/source/source-ui";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import { resolveServiceHref } from "@/lib/platform/navigation";
import type { Locale } from "@/types/i18n";

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function AcademyGlyph({ slug }: { slug: string }) {
  if (slug === "seminars") {
    return <svg viewBox="0 0 72 72" aria-hidden="true"><path d="M13 42h46M20 42V24h32v18M27 24v-7h18v7M24 50h24" /><path className="academy-glyph__gold" d="M29 33h14M36 27v12" /></svg>;
  }
  if (slug === "research") {
    return <svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="31" cy="31" r="16" /><path d="m43 43 15 15M25 31h12M31 25v12" /><path className="academy-glyph__gold" d="M12 55h25" /></svg>;
  }
  if (slug === "courses") {
    return <svg viewBox="0 0 72 72" aria-hidden="true"><path d="m8 27 28-14 28 14-28 14Z" /><path d="M17 32v15c12 8 26 8 38 0V32M62 29v19" /><circle className="academy-glyph__gold" cx="62" cy="52" r="3" /></svg>;
  }
  return <svg viewBox="0 0 72 72" aria-hidden="true"><path d="M10 17c11-3 20 0 26 6v35c-7-6-16-8-26-5ZM62 17c-11-3-20 0-26 6v35c7-6 16-8 26-5Z" /><path className="academy-glyph__gold" d="M18 28h11M18 35h11M43 28h11M43 35h11" /></svg>;
}

function AcademyObservatory() {
  return (
    <svg className="academy-cinema__observatory" viewBox="0 0 1200 720" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="academy-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#5edce9" stopOpacity=".18" /><stop offset=".5" stopColor="#67d7a1" stopOpacity=".85" /><stop offset="1" stopColor="#e1c579" stopOpacity=".8" /></linearGradient>
        <radialGradient id="academy-light"><stop stopColor="#e1c579" stopOpacity=".62" /><stop offset=".24" stopColor="#67d7a1" stopOpacity=".18" /><stop offset="1" stopColor="#5edce9" stopOpacity="0" /></radialGradient>
        <filter id="academy-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g className="academy-cinema__grid"><path d="M0 590h1200M80 720 420 448M250 720 486 448M1120 720 780 448M950 720 714 448" /><path d="M0 636h1200M0 684h1200" /></g>
      <g className="academy-cinema__rings"><ellipse cx="610" cy="390" rx="310" ry="170" /><ellipse cx="610" cy="390" rx="244" ry="132" /><ellipse cx="610" cy="390" rx="164" ry="88" /><path d="M300 390h620M610 220v340" /></g>
      <g className="academy-cinema__book" filter="url(#academy-glow)"><path d="M610 338c-72-48-154-52-230-18v174c77-31 155-21 230 32Z" /><path d="M610 338c72-48 154-52 230-18v174c-77-31-155-21-230 32Z" /><path className="academy-cinema__gold" d="M610 338v188M407 349c65-20 126-8 180 23M813 349c-65-20-126-8-180 23" /><path d="M414 394c61-17 118-6 169 21M806 394c-61-17-118-6-169 21M414 438c61-14 118-3 169 24M806 438c-61-14-118-3-169 24" /></g>
      <g className="academy-cinema__knowledge"><path d="M610 300V102M610 142 476 76M610 178l148-92M610 230 364 136M610 252l-322 92" /><circle cx="610" cy="102" r="5" /><circle cx="476" cy="76" r="4" /><circle className="academy-cinema__gold-node" cx="758" cy="86" r="5" /><circle cx="974" cy="136" r="4" /><circle className="academy-cinema__gold-node" cx="288" cy="344" r="4" /></g>
      <circle cx="610" cy="390" r="190" fill="url(#academy-light)" />
    </svg>
  );
}

export function AcademyCinematic({ locale, module, userLabel, reviewMode = false }: { locale: Locale; module: PlatformModuleDefinition; userLabel: string; reviewMode?: boolean }) {
  const ar = locale === "ar";
  return (
    <PlatformShell locale={locale} activeRoute={module.route} userLabel={userLabel} immersive>
      <section className="academy-cinema" data-locale={locale} aria-labelledby="academy-cinema-title">
        <AcademyObservatory />
        <header className="academy-cinema__intro">
          <span className="academy-cinema__code">{module.code} / KNOWLEDGE OBSERVATORY</span>
          <p>{pick(module.eyebrow, locale)}</p>
          <h1 id="academy-cinema-title">
            {ar ? (
              <>المعرفة مفتاح <span>تحقيق أحلامك</span><span>وبوابة المستقبل.</span></>
            ) : (
              <>Knowledge is the key <span>to your dreams</span><span>and the gateway to the future.</span></>
            )}
          </h1>
          <small>{pick(module.description, locale)}</small>
        </header>
        <div className="academy-cinema__pulse" aria-hidden="true"><span>{ar ? "مرصد المعرفة" : "KNOWLEDGE FIELD"}</span><i /><strong>04</strong><small>{ar ? "مسارات تصميمية" : "DESIGN PATHS"}</small></div>
        <nav className="academy-cinema__paths" aria-label={ar ? "مسارات أكاديمية جنان" : "Jenan Academy paths"}>
          {module.services.map((service, index) => (
            <Link href={resolveServiceHref(service, reviewMode ? "preview" : "live")} className="academy-cinema__path" key={service.id}>
              <span className="academy-cinema__path-icon"><i /><AcademyGlyph slug={service.slug} /></span>
              <span><small>0{index + 1}</small><strong>{pick(service.title, locale)}</strong><em>{pick(service.description, locale)}</em></span>
            </Link>
          ))}
        </nav>
        <footer className="academy-cinema__truth"><span><i />{ar ? "محتوى ومسارات تجريبية" : "SAMPLE CONTENT AND PATHS"}</span><strong>{ar ? "لا تسجيل أو بيانات فعلية" : "NO LIVE ENROLLMENT OR DATA"}</strong></footer>
      </section>
    </PlatformShell>
  );
}
