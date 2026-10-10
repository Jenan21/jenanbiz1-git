import Link from "next/link";
import type { Locale } from "@/types/i18n";

const links = [
  ["/user", "الملخص", "Overview"],
  ["/user/investments", "الاستثمارات", "Investments"],
  ["/user/unlocks", "الخدمات المجانية", "Community access"],
  ["/user/payments", "المدفوعات", "Payments"],
  ["/user/reports", "التقارير", "Reports"],
  ["/user/interface", "تخصيص الواجهة", "Interface"],
] as const;

export function UserCenterNav({ activeRoute, locale }: { activeRoute: string; locale: Locale }) {
  const ar = locale === "ar";
  return (
    <nav className="user-center-nav" aria-label={ar ? "صفحات مركز المستخدم" : "User center pages"}>
      {links.map(([href, arabic, english]) => <Link aria-current={activeRoute === href ? "page" : undefined} className={activeRoute === href ? "is-active" : ""} href={href} key={href}>{ar ? arabic : english}</Link>)}
    </nav>
  );
}