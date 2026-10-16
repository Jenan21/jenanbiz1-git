import Link from "next/link";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

export type ShowcaseService = {
  description: Copy;
  href: string;
  icon: IconName;
  title: Copy;
  tone: "blue" | "cyan" | "emerald" | "gold" | "pink" | "violet";
};

export type ShowcaseFact = { icon: IconName; text: Copy; title: Copy };

export type SectionShowcaseProps = {
  /** Extra data attributes a page must keep for its tests and tooling. */
  attributes?: Record<`data-${string}`, string>;
  facts: readonly ShowcaseFact[];
  locale: Locale;
  pitch: Copy;
  primary: { href: string; icon: IconName; label: Copy };
  route: string;
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

/**
 * The first page of a section: one screen, the platform's identity, and the section's own services laid out as
 * rectangular tiles that each lead to a working page. It states what the section does; it never shows invented figures.
 */
export function SectionShowcase({
  attributes,
  facts,
  locale,
  pitch,
  primary,
  route,
  secondary,
  servicesLabel,
  services,
  tag,
  title,
  userLabel,
}: SectionShowcaseProps) {
  const ar = locale === "ar";
  return (
    <main className="showcase" data-showcase-route={route} dir={ar ? "rtl" : "ltr"} {...attributes}>
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
            <Link className="is-primary" href={primary.href}><Icon name={primary.icon} />{pick(primary.label, locale)}</Link>
            {secondary ? <Link href={secondary.href}><Icon name={secondary.icon} />{pick(secondary.label, locale)}</Link> : null}
          </div>
        </div>
        <ul className="showcase__facts">
          {facts.map((fact) => (
            <li className="stage-glass" key={fact.title[1]}>
              <span aria-hidden="true" className="showcase__mark"><Icon name={fact.icon} /></span>
              <strong>{pick(fact.title, locale)}</strong>
              <small>{pick(fact.text, locale)}</small>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label={pick(servicesLabel, locale)} className="showcase__tiles">
        {services.map((service, index) => (
          <Link className={`showcase__tile tone-${service.tone}`} href={service.href} key={service.href}>
            <span aria-hidden="true" className="showcase__photo" />
            <span aria-hidden="true" className="showcase__index">{String(index + 1).padStart(2, "0")}</span>
            <span aria-hidden="true" className="showcase__mark"><Icon name={service.icon} /></span>
            <h2>{pick(service.title, locale)}</h2>
            <p>{pick(service.description, locale)}</p>
            <b aria-hidden="true"><Icon name="arrow" /></b>
          </Link>
        ))}
      </nav>
    </main>
  );
}
