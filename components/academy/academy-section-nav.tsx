import Link from "next/link";
import type { Locale } from "@/types/i18n";

const links = [
  ["/academy", "الرئيسية", "Academy"],
  ["/academy/courses", "الدورات", "Courses"],
  ["/academy/webinars", "الندوات", "Webinars"],
  ["/academy/studies", "الدراسات", "Studies"],
  ["/academy/research", "الأبحاث", "Research"],
  ["/academy/paths", "المسارات", "Paths"],
] as const;

export function AcademySectionNav({ activeRoute, locale }: { activeRoute: string; locale: Locale }) {
  const ar = locale === "ar";
  return <nav className="academy-section-nav" aria-label={ar ? "أقسام الأكاديمية" : "Academy sections"}>{links.map(([href, arabic, english]) => <Link aria-current={activeRoute === href ? "page" : undefined} className={activeRoute === href ? "is-active" : ""} href={href} key={href}>{ar ? arabic : english}</Link>)}</nav>;
}