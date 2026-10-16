import Link from "next/link";
import type { ReactNode } from "react";

import { AcademySectionNav } from "@/components/academy/academy-section-nav";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

export function AcademyShell({
  activeRoute,
  children,
  locale,
  userLabel,
}: {
  activeRoute: string;
  children: ReactNode;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <div className="academy-portal academy-portal--shared" dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />
      <div className="academy-strip">
        <form action="/academy/search" className="academy-strip__search" method="get">
          <Icon name="search" />
          <input
            aria-label={ar ? "البحث في الأكاديمية" : "Search the academy"}
            name="query"
            placeholder={ar ? "ابحث في الأكاديمية..." : "Search the academy..."}
            type="search"
          />
        </form>
        <Link href="/academy/downloads"><Icon name="grid" />{ar ? "المكتبة والتنزيلات" : "Library and downloads"}</Link>
        <Link href="/academy/profile"><Icon name="user" />{ar ? "ملفي التعليمي" : "My learning profile"}</Link>
      </div>

      <main className="academy-portal__main">
        <AcademySectionNav activeRoute={activeRoute} locale={locale} />
        {children}
      </main>
    </div>
  );
}