import Link from "next/link";

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
      <header className="software-suite__topbar">
        <Link className="software-suite__brand" href="/software">
          <span>Jenan <b>PRO</b></span>
          <small>{ar ? "برمجيات جنان" : "Jenan software"}</small>
        </Link>
        <nav aria-label={ar ? "تنقل البرمجيات" : "Software navigation"}>
          <Link href="/software/files"><Icon name="grid" />{ar ? "أدوات الملفات" : "File tools"}</Link>
          <Link href="/software/design"><Icon name="sparkles" />{ar ? "استوديو التصميم" : "Design studio"}</Link>
          <Link href="/software/business"><Icon name="briefcase" />{ar ? "إدارة الأعمال" : "Business suite"}</Link>
        </nav>
        <div className="software-suite__account">
          <Link aria-label={ar ? "التنبيهات" : "Notifications"} href="/account"><Icon name="bell" /></Link>
          <Link href="/user"><span>{userLabel.slice(0, 1).toLocaleUpperCase()}</span><small>{userLabel}</small></Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
