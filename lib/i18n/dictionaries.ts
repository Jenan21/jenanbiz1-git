import type { Locale } from "@/types/i18n";

const ar = {
  common: {
    navigation: "التنقل الرئيسي",
    placeholder: "مسار أولي — سيُطوّر لاحقًا.",
  },
  home: { title: "Jenan BIZ", description: "نواة منصة أعمال قابلة للتوسع." },
  auth: {
    login: "تسجيل الدخول",
    register: "إنشاء حساب",
    placeholder: "واجهة المصادقة ستُنفذ في مرحلة لاحقة.",
  },
  dashboard: { title: "لوحة التحكم" },
  admin: { title: "الإدارة" },
} as const;

export type Dictionary = {
  [Section in keyof typeof ar]: { [Key in keyof (typeof ar)[Section]]: string };
};

const en: Dictionary = {
  common: {
    navigation: "Main navigation",
    placeholder: "Initial route — to be developed later.",
  },
  home: {
    title: "Jenan BIZ",
    description: "A scalable business platform core.",
  },
  auth: {
    login: "Sign in",
    register: "Create account",
    placeholder: "Authentication UI will be implemented in a later phase.",
  },
  dashboard: { title: "Dashboard" },
  admin: { title: "Admin" },
};

export const dictionaries: Record<Locale, Dictionary> = { ar, en };
