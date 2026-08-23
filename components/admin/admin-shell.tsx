"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const navItems = [
  { href: "/admin", label: { ar: "نظرة عامة", en: "Overview" }, icon: "▣" },
  { href: "/admin/operations", label: { ar: "العمليات", en: "Operations" }, icon: "▤" },
  { href: "/admin/dashboard", label: { ar: "لوحة التحكم", en: "Control" }, icon: "◫" },
  { href: "/admin/branches", label: { ar: "الفروع", en: "Branches" }, icon: "▣" },
  { href: "/admin/users", label: { ar: "المستخدمون", en: "Users" }, icon: "◉" },
  { href: "/admin/robots", label: { ar: "صائدو الجوائز", en: "Bounty Scouts" }, icon: "◎" },
  { href: "/admin/committee", label: { ar: "اللجنة", en: "Committee" }, icon: "◌" },
  { href: "/admin/decisions", label: { ar: "القرارات", en: "Decisions" }, icon: "✓" },
  { href: "/admin/reports", label: { ar: "التقارير", en: "Reports" }, icon: "◔" },
  { href: "/admin/robot-knowledge", label: { ar: "المعرفة", en: "Knowledge" }, icon: "◍" },
  { href: "/admin/intel", label: { ar: "الذكاء", en: "Intelligence" }, icon: "◐" },
  { href: "/admin/data-center", label: { ar: "مركز البيانات", en: "Data Center" }, icon: "◭" },
  { href: "/admin/global-health", label: { ar: "الصحة العامة", en: "Global Health" }, icon: "◎" },
  { href: "/admin/bounty-hunters", label: { ar: "لوحة الجوائز", en: "Reward Board" }, icon: "★" },
  { href: "/admin/social-growth", label: { ar: "النمو الاجتماعي", en: "Social Growth" }, icon: "◉" },
];

const texts = {
  ar: {
    brand: "إدارة جينان",
    layer: "طبقة التحكم",
    eyebrow: "عمليات الذكاء",
    heading: "مركز التحكم",
    live: "مباشر",
    deploy: "نشر",
    toggle: "EN",
  },
  en: {
    brand: "Jenan Admin",
    layer: "Control Layer",
    eyebrow: "INTELLIGENCE OPS",
    heading: "Admin command center",
    live: "live",
    deploy: "Deploy",
    toggle: "AR",
  },
} as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLang] = useState<"ar" | "en">(() => {
    if (typeof window === "undefined") return "ar";
    const saved = localStorage.getItem("jenan-admin-lang");
    return saved === "ar" || saved === "en" ? saved : "ar";
  });

  useEffect(() => {
    localStorage.setItem("jenan-admin-lang", lang);
  }, [lang]);

  const t = texts[lang];

  return (
    <div className="admin-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
      <aside className="admin-sidebar glass">
        <div className="admin-brand">
          <div className="admin-brand-mark">J</div>
          <div>
            <strong>{t.brand}</strong>
            <small>{t.layer}</small>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span>{item.icon}</span>
                {item.label[lang]}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar glass">
          <div>
            <small className="admin-topbar__eyebrow">{t.eyebrow}</small>
            <h2>{t.heading}</h2>
          </div>
          <div className="admin-topbar__actions">
            <span className="pill"><span className="live-dot" /> {t.live}</span>
            <button
              type="button"
              className="btn small secondary"
              onClick={() => setLang((prev) => (prev === "ar" ? "en" : "ar"))}
              aria-label="Toggle language"
            >
              {t.toggle}
            </button>
            <button className="btn small primary">{t.deploy}</button>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
