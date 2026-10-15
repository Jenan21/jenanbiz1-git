type Copy = readonly [string, string];

export interface NavItem {
  href: string;
  label: Copy;
}

/** The sections of the platform, in the order they appear in the header. */
export const MAIN_NAV: readonly NavItem[] = [
  { href: "/dashboard", label: ["الرئيسية", "Home"] },
  { href: "/projects", label: ["المشاريع", "Projects"] },
  { href: "/academy", label: ["الأكاديمية", "Academy"] },
  { href: "/software", label: ["البرمجيات", "Software"] },
  { href: "/market", label: ["السوق", "Market"] },
  { href: "/talent", label: ["الوظائف", "Talent"] },
  { href: "/marketing", label: ["التسويق", "Marketing"] },
  { href: "/benefits", label: ["من نحن", "About"] },
];

/** Pages that belong to a section without living under its path. */
const BELONGS_TO: ReadonlyArray<readonly [string, string]> = [
  ["/user", "/dashboard"],
  ["/account", "/dashboard"],
  ["/programs", "/dashboard"],
  ["/studio", "/software"],
  ["/pricing", "/benefits"],
];

/** The header item that stands for the page being shown, or undefined when no item does. */
export function activeNavHref(pathname: string): string | undefined {
  const own = MAIN_NAV.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (own) return own.href;
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
