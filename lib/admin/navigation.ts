import type { IconName } from "@/components/ui/icons";

export interface AdminNavItem {
  href: string;
  icon: IconName;
  label: {
    ar: string;
    en: string;
  };
}

export const adminNavItems: readonly AdminNavItem[] = [
  {
    href: "/admin",
    label: { ar: "نظرة تشغيلية", en: "Operations Overview" },
    icon: "dashboard",
  },
  {
    href: "/admin/operations",
    label: { ar: "مركز العمليات", en: "Operations Center" },
    icon: "activity",
  },
  {
    href: "/admin/dashboard",
    label: { ar: "لوحة التحكم", en: "Control Dashboard" },
    icon: "grid",
  },
  {
    href: "/admin/academy",
    label: { ar: "أكاديمية الإدارة", en: "Admin Academy" },
    icon: "graduation",
  },
  {
    href: "/admin/branches",
    label: { ar: "شبكة الفروع", en: "Branch Network" },
    icon: "building",
  },
  {
    href: "/admin/users",
    label: { ar: "المستخدمون", en: "Users" },
    icon: "people",
  },
  {
    href: "/admin/robots",
    label: { ar: "الروبوتات", en: "Automation Agents" },
    icon: "brain",
  },
  {
    href: "/admin/robot-coverage",
    label: { ar: "تغطية الروبوتات", en: "Robot Coverage" },
    icon: "activity",
  },
  {
    href: "/admin/committee",
    label: { ar: "اللجنة", en: "Committee" },
    icon: "shield",
  },
  {
    href: "/admin/decisions",
    label: { ar: "القرارات", en: "Decisions" },
    icon: "check",
  },
  {
    href: "/admin/reports",
    label: { ar: "التقارير", en: "Reports" },
    icon: "barChart",
  },
  {
    href: "/admin/finance",
    label: { ar: "المالية والتكاليف", en: "Finance & Costs" },
    icon: "wallet",
  },
  {
    href: "/admin/robot-knowledge",
    label: { ar: "قاعدة المعرفة", en: "Knowledge Base" },
    icon: "graduation",
  },
  {
    href: "/admin/intel",
    label: { ar: "إشارات الذكاء", en: "Intelligence Signals" },
    icon: "sparkles",
  },
  {
    href: "/admin/data-center",
    label: { ar: "مركز البيانات", en: "Data Center" },
    icon: "globe",
  },
  {
    href: "/admin/global-health",
    label: { ar: "صحة المنصة", en: "Platform Health" },
    icon: "activity",
  },
  {
    href: "/admin/map-provider",
    label: { ar: "تكاملات الخرائط", en: "Map Integrations" },
    icon: "globe",
  },
  {
    href: "/admin/bounty-hunters",
    label: { ar: "لوحة المكافآت", en: "Rewards Board" },
    icon: "rocket",
  },
  {
    href: "/admin/social-growth",
    label: { ar: "النمو الاجتماعي", en: "Social Growth" },
    icon: "trend",
  },
];
