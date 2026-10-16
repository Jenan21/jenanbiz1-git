import Link from "next/link";
import type { CSSProperties } from "react";
import { LivePanel, type LiveSource } from "@/components/shell/live-panel";
import { SectionSearch } from "@/components/shell/section-search";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type Tone = "blue" | "cyan" | "emerald" | "gold" | "pink" | "violet";

export type ShowcaseService = {
  description: Copy;
  href: string;
  icon: IconName;
  title: Copy;
  tone: Tone;
};

export type ShowcaseFact = { icon: IconName; text: Copy; title: Copy };

export type ShowcasePanel =
  | { kind: "live"; emptyText: Copy; href: string; icon: IconName; linkLabel: Copy; source: LiveSource; title: Copy }
  | { kind: "links"; icon: IconName; items: ReadonlyArray<{ href: string; icon: IconName; title: Copy }>; title: Copy }
  | { kind: "steps"; icon: IconName; steps: ReadonlyArray<{ text: Copy; title: Copy }>; title: Copy }
  | { kind: "tips"; icon: IconName; tips: ReadonlyArray<{ icon: IconName; text: Copy; title: Copy }>; title: Copy };

export type SectionShowcaseProps = {
  /** Extra data attributes a page must keep for its tests and tooling. */
  attributes?: Record<`data-${string}`, string>;
  cta: Copy;
  facts: readonly ShowcaseFact[];
  locale: Locale;
  panels: readonly [ShowcasePanel, ShowcasePanel, ShowcasePanel];
  /** The section's own scene, shown over the stage and again, faintly, inside the cards. */
  photo: string;
  pitch: Copy;
  primary: { href: string; icon: IconName; label: Copy };
  route: string;
  search: { placeholder: Copy; scope: string };
  secondary?: { href: string; icon: IconName; label: Copy };
  servicesLabel: Copy;
  services: readonly ShowcaseService[];
  tag: { icon: IconName; label: Copy };
  /** The headline: the second line carries the gradient. */
  title: readonly [Copy, Copy];
  userLabel: string;
};

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

function Panel({ locale, panel }: { locale: Locale; panel: ShowcasePanel }) {
  const ar = locale === "ar";
  return (
    <section className={`showcase-panel showcase-panel--${panel.kind}`}>
      <header>
        <h2><span aria-hidden="true" className="showcase__mark"><Icon name={panel.icon} /></span>{pick(panel.title, locale)}</h2>
        {panel.kind === "live" ? <Link href={panel.href}>{pick(panel.linkLabel, locale)}</Link> : null}
      </header>
      {panel.kind === "live" ? <LivePanel emptyText={panel.emptyText} locale={locale} source={panel.source} /> : null}
      {panel.kind === "links" ? (
        <ul className="showcase-panel__links">
          {panel.items.map((item) => (
            <li key={item.href}>
              <Link href={item.href}>
                <span aria-hidden="true" className="showcase__mark"><Icon name={item.icon} /></span>
                <strong>{pick(item.title, locale)}</strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {panel.kind === "steps" ? (
        <ol className="showcase-panel__steps">
          {panel.steps.map((step, index) => (
            <li key={step.title[1]}>
              <b aria-hidden="true">{ar ? ["١", "٢", "٣", "٤"][index] : index + 1}</b>
              <strong>{pick(step.title, locale)}</strong>
              <small>{pick(step.text, locale)}</small>
            </li>
          ))}
        </ol>
      ) : null}
      {panel.kind === "tips" ? (
        <ul className="showcase-panel__tips">
          {panel.tips.map((tip) => (
            <li key={tip.title[1]}>
              <span aria-hidden="true" className="showcase__mark"><Icon name={tip.icon} /></span>
              <span><strong>{pick(tip.title, locale)}</strong><small>{pick(tip.text, locale)}</small></span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The first page of a section: one screen, the platform's identity, the section's own scene, and its services as
 * rectangular cards that each lead to a working page. Panels show the account's own records or plain guidance, never
 * invented figures.
 */
export function SectionShowcase({
  attributes,
  cta,
  facts,
  locale,
  panels,
  photo,
  pitch,
  primary,
  route,
  search,
  secondary,
  servicesLabel,
  services,
  tag,
  title,
  userLabel,
}: SectionShowcaseProps) {
  const ar = locale === "ar";
  return (
    <main
      className={`showcase${services.length > 6 ? " showcase--dense" : ""}`}
      data-showcase-route={route}
      dir={ar ? "rtl" : "ltr"}
      style={{ "--stage-photo": `url("${photo}")`, "--cards": services.length, "--cols-md": services.length > 6 ? 4 : 3 } as CSSProperties}
      {...attributes}
    >
      <JenanHeader locale={locale} userLabel={userLabel} />

      <section className="showcase__hero stage">
        <div aria-hidden="true" className="stage__photo" />
        <div aria-hidden="true" className="stage__grade" />
        <div aria-hidden="true" className="stage__fade" />
        <div className="showcase__copy">
          <span className="showcase__tag"><Icon name={tag.icon} />{pick(tag.label, locale)}</span>
          <h1>
            <span className="is-line">{pick(title[0], locale)}</span>
            <span className="is-line is-gradient">{pick(title[1], locale)}</span>
          </h1>
          <p>{pick(pitch, locale)}</p>
          <div className="showcase__actions">
            <SectionSearch locale={locale} placeholder={pick(search.placeholder, locale)} scope={search.scope} />
            {secondary ? <Link href={secondary.href}><Icon name={secondary.icon} />{pick(secondary.label, locale)}</Link> : null}
            <Link className="is-primary" href={primary.href}><Icon name={primary.icon} />{pick(primary.label, locale)}</Link>
          </div>
        </div>
      </section>

      <nav aria-label={pick(servicesLabel, locale)} className="showcase__tiles">
        {services.map((service) => (
          <Link className={`showcase__tile tone-${service.tone}`} href={service.href} key={service.href}>
            <span aria-hidden="true" className="showcase__mark"><Icon name={service.icon} /></span>
            <h2>{pick(service.title, locale)}</h2>
            <p>{pick(service.description, locale)}</p>
            <b><span>{pick(cta, locale)}</span><Icon name="arrow" /></b>
          </Link>
        ))}
      </nav>

      <ul className="showcase__facts">
        {facts.map((fact) => (
          <li key={fact.title[1]}>
            <span aria-hidden="true" className="showcase__mark"><Icon name={fact.icon} /></span>
            <strong>{pick(fact.title, locale)}</strong>
            <small>{pick(fact.text, locale)}</small>
          </li>
        ))}
      </ul>

      <div className="showcase__panels">
        {panels.map((panel) => <Panel key={panel.title[1]} locale={locale} panel={panel} />)}
      </div>
    </main>
  );
}
