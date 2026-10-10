import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type ProjectSection = "analysis" | "feasibility" | "start";

const navigation: ReadonlyArray<{
  href: string;
  icon: IconName;
  label: Copy;
}> = [
  { href: "/dashboard", icon: "dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", icon: "briefcase", label: ["المشاريع", "Projects"] },
  { href: "/academy", icon: "graduation", label: ["الأكاديمية", "Academy"] },
  { href: "/software", icon: "grid", label: ["البرمجيات", "Software"] },
  { href: "/market", icon: "barChart", label: ["السوق", "Market"] },
  { href: "/talent", icon: "people", label: ["المواهب", "Talent"] },
  { href: "/marketing", icon: "megaphone", label: ["التسويق", "Marketing"] },
];

const sections: ReadonlyArray<{
  href: string;
  icon: IconName;
  id: ProjectSection;
  label: Copy;
}> = [
  { href: "/projects/analysis", icon: "barChart", id: "analysis", label: ["تحليل مشروع", "Project analysis"] },
  { href: "/projects/start", icon: "rocket", id: "start", label: ["بدء مشروع", "Start project"] },
  { href: "/projects/feasibility", icon: "pieChart", id: "feasibility", label: ["إعداد دراسات الجدوى", "Feasibility studies"] },
];

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function ProjectsCommandHeader({
  active,
  locale,
  userLabel,
}: {
  active: ProjectSection;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <>
      <header className="project-command-header">
        <Link className="project-command-header__brand" href="/dashboard">
          <strong>Jenan <b>PRO</b></strong>
          <small>{ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}</small>
        </Link>
        <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
          {navigation.map((item) => (
            <Link
              className={item.href === "/projects" ? "is-active" : undefined}
              href={item.href}
              key={item.href}
            >
              <Icon name={item.icon} />
              {pick(item.label, locale)}
            </Link>
          ))}
        </nav>
        <div className="project-command-header__tools">
          <button disabled type="button" aria-label={ar ? "البحث غير متاح حاليًا" : "Search unavailable"}>
            <Icon name="search" />
          </button>
          <button disabled type="button" aria-label={ar ? "لا توجد تنبيهات جديدة" : "No new notifications"}>
            <Icon name="bell" />
          </button>
          <LanguageSwitcher locale={locale} label={ar ? "Switch to English" : "التبديل إلى العربية"} />
          <span className="user-chip">{userLabel}</span>
          <LogoutButton label={ar ? "خروج" : "Logout"} />
        </div>
      </header>
      <nav className="project-command-subnav" aria-label={ar ? "خدمات المشاريع" : "Project services"}>
        <Link href="/projects">{ar ? "المشاريع" : "Projects"} <Icon name="chevron" /></Link>
        {sections.map((section) => (
          <Link className={active === section.id ? "is-active" : undefined} href={section.href} key={section.id}>
            <Icon name={section.icon} />
            {pick(section.label, locale)}
          </Link>
        ))}
      </nav>
    </>
  );
}
