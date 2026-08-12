import Link from "next/link";
import { LogoPlaceholder } from "@/components/layout/logo-placeholder";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function Sidebar({
  items,
  activeHref,
  footerLabel,
  className,
}: {
  items: NavItem[];
  activeHref: string;
  footerLabel: string;
  className?: string;
}) {
  return (
    <aside className={cn("sidebar", className)}>
      <LogoPlaceholder />
      <nav>
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className={cn(
              "sidebar__link",
              activeHref === item.href && "is-active",
            )}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {activeHref === item.href && <i />}
          </Link>
        ))}
      </nav>
      <div className="sidebar__footer">
        <span className="status-dot" />
        {footerLabel}
      </div>
    </aside>
  );
}
