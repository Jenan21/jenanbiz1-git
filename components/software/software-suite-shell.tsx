import Link from "next/link";

import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

export function SoftwareSuiteShell({
  children,
  locale,
  userLabel,
}: {
  children: React.ReactNode;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  return (
    <div className="software-suite" dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />
      <nav aria-label={ar ? "تنقل البرمجيات" : "Software navigation"} className="section-subnav" dir={ar ? "rtl" : "ltr"}>
        <Link href="/software"><Icon name="cube" />{ar ? "برمجيات جنان" : "Jenan Software"}</Link>
        <Link href="/software/files"><Icon name="grid" />{ar ? "أدوات الملفات" : "File tools"}</Link>
        <Link href="/software/design"><Icon name="sparkles" />{ar ? "استوديو التصميم" : "Design studio"}</Link>
        <Link href="/software/business"><Icon name="briefcase" />{ar ? "إدارة الأعمال" : "Business suite"}</Link>
      </nav>
      <main>{children}</main>
    </div>
  );
}
