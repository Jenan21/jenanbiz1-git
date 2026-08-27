import Link from "next/link";
import type { CSSProperties } from "react";

import { Icon } from "@/components/ui/icons";
import { findPlatformModule, type CatalogCopy } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

function pick(copy: CatalogCopy, locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

export async function WorkspaceDivisions({
  locale,
  route,
}: {
  locale: Locale;
  route: string;
}) {
  const catalogModule =
    (await findPlatformModule(route)) ??
    (await findPlatformModule("dashboard"));
  const divisions = catalogModule?.services ?? [];

  return (
    <section
      className="module-divisions"
      aria-labelledby="module-divisions-title"
    >
      <header className="module-divisions-heading">
        <div>
          <span>{locale === "ar" ? "كتالوج القسم" : "Section catalog"}</span>
          <h2 id="module-divisions-title">
            {locale === "ar"
              ? "خدمات تولّد واجهاتها من بنية واحدة"
              : "Services generated from one shared structure"}
          </h2>
        </div>
        <strong
          aria-label={
            locale === "ar"
              ? `${divisions.length} خدمات`
              : `${divisions.length} services`
          }
        >
          {String(divisions.length).padStart(2, "0")}
        </strong>
      </header>

      <div className="module-division-grid">
        {divisions.map((division, index) => (
          <article
            className="module-division"
            key={division.id}
            style={{ "--division-index": index } as CSSProperties}
          >
            <div className="module-division-signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span className="module-division-icon" aria-hidden="true">
              <Icon name={division.icon} />
            </span>
            <span className="module-division-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3>{pick(division.title, locale)}</h3>
            <p>{pick(division.description, locale)}</p>
            <Link className="module-division-link" href={division.href}>
              {locale === "ar" ? "فتح الواجهة" : "Open interface"}
              <Icon name="arrow" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
