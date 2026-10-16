type Copy = readonly [string, string];

export interface NavItem {
  href: string;
  label: Copy;
}

/** The main sections of the platform, in the order they appear in the header. */
export const MAIN_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", label: ["المشاريع والاستثمار", "Projects and investment"] },
  { href: "/software", label: ["البرمجيات والحلول", "Software and solutions"] },
  { href: "/business", label: ["منظومة الأعمال", "Business ecosystem"] },
  { href: "/user", label: ["بياناتي", "My data"] },
  { href: "/notifications", label: ["الإشعارات", "Notifications"] },
  { href: "/benefits", label: ["من نحن", "About us"] },
];

/**
 * Which header item a page belongs to. The first matching prefix wins, so a page that lives under another path
 * (investments under /user, the studio under software) is listed before the section that would otherwise claim it.
 */
const BELONGS_TO: ReadonlyArray<readonly [string, string]> = [
  ["/user/investment", "/projects"],
  ["/user/investments", "/projects"],
  ["/projects", "/projects"],
  ["/software", "/software"],
  ["/studio", "/software"],
  ["/academy", "/business"],
  ["/market", "/business"],
  ["/talent", "/business"],
  ["/marketing", "/business"],
  ["/business", "/business"],
  ["/user", "/user"],
  ["/account", "/user"],
  ["/notifications", "/notifications"],
  ["/pricing", "/benefits"],
  ["/benefits", "/benefits"],
  ["/programs", "/dashboard"],
  ["/dashboard", "/dashboard"],
];

/** The header item that stands for the page being shown, or undefined when no item does. */
export function activeNavHref(pathname: string): string | undefined {
  return BELONGS_TO.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1];
}
const ROLE_LABELS: Record<string, Copy> = {
  SUPER_ADMIN: ["مالك المنصة", "Platform owner"],
  ADMIN: ["مدير النظام", "Administrator"],
  ELITE_COMMITTEE: ["فريق المنصة", "Platform team"],
  MANAGER: ["فريق المنصة", "Platform team"],
  SUPERVISOR: ["فريق المنصة", "Platform team"],
  EMPLOYEE: ["فريق المنصة", "Platform team"],
};
const MEMBER: Copy = ["عضو", "Member"];

/** The label under the person's name; an unknown role reads as an ordinary member. */
export function roleLabel(role: string | undefined, index: 0 | 1): string {
  return (ROLE_LABELS[role ?? ""] ?? MEMBER)[index];
}
