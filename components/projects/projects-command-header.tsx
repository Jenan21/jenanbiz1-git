import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { JenanHeader } from "@/components/shell/jenan-header";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type ProjectSection = "analysis" | "feasibility" | "start";

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
  compact = false,
  locale,
  userLabel,
}: {
  active: ProjectSection;
  compact?: boolean;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <>
      <JenanHeader locale={locale} userLabel={userLabel} />
      <nav className={`project-command-subnav${compact ? " is-flow" : ""}`} aria-label={ar ? "خدمات المشاريع" : "Project services"}>
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
