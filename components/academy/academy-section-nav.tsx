import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const links: ReadonlyArray<{
  href: string;
  icon: IconName;
  label: readonly [string, string];
}> = [
  { href: "/academy", icon: "dashboard", label: ["الرئيسية", "Academy"] },
  { href: "/academy/sections", icon: "grid", label: ["الأقسام", "Sections"] },
  { href: "/academy/courses", icon: "graduation", label: ["الدورات", "Courses"] },
  { href: "/academy/paths", icon: "rocket", label: ["المسارات", "Paths"] },
  { href: "/academy/journey", icon: "trend", label: ["رحلتي", "My journey"] },
  { href: "/academy/webinars", icon: "people", label: ["الندوات", "Webinars"] },
  { href: "/academy/research", icon: "brain", label: ["الأبحاث", "Research"] },
  { href: "/academy/assessments", icon: "check", label: ["الاختبارات", "Assessments"] },
  { href: "/academy/certificates", icon: "shield", label: ["الشهادات", "Certificates"] },
  { href: "/academy/profile", icon: "user", label: ["ملفي", "Profile"] },
];

export function AcademySectionNav({ activeRoute, locale }: { activeRoute: string; locale: Locale }) {
  const ar = locale === "ar";
  return (
    <nav className="academy-section-nav" aria-label={ar ? "أقسام الأكاديمية" : "Academy sections"}>
      {links.map((item) => {
        const active = activeRoute === item.href
          || (item.href !== "/academy" && activeRoute.startsWith(`${item.href}/`))
          || (item.href === "/academy/courses" && activeRoute.startsWith("/academy/course/"));
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "is-active" : ""}
            href={item.href}
            key={item.href}
          >
            <Icon name={item.icon} />
            {ar ? item.label[0] : item.label[1]}
          </Link>
        );
      })}
    </nav>
  );
}