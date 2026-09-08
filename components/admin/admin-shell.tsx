"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { JenanLogo } from "@/components/custom/platform-shell";

const navItems = [
  { href: "/admin", label: { ar: "نظرة عامة", en: "Overview" }, icon: "▣" },
  { href: "/admin/operations", label: { ar: "العمليات", en: "Operations" }, icon: "▤" },
  { href: "/admin/dashboard", label: { ar: "لوحة التحكم", en: "Control" }, icon: "◫" },
  { href: "/admin/academy", label: { ar: "الأكاديمية", en: "Academy" }, icon: "◈" },
  { href: "/admin/branches", label: { ar: "الفروع", en: "Branches" }, icon: "▣" },
  { href: "/admin/users", label: { ar: "المستخدمون", en: "Users" }, icon: "◉" },
  { href: "/admin/robots", label: { ar: "صائدو الجوائز", en: "Bounty Scouts" }, icon: "◎" },
  { href: "/admin/committee", label: { ar: "اللجنة", en: "Committee" }, icon: "◌" },
  { href: "/admin/decisions", label: { ar: "القرارات", en: "Decisions" }, icon: "✓" },
  { href: "/admin/reports", label: { ar: "التقارير", en: "Reports" }, icon: "◔" },
  { href: "/admin/finance", label: { ar: "المالية والتكاليف", en: "Finance & costs" }, icon: "₿" },
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
  const [lang, setLang] = useState<"ar" | "en">("ar");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const locale = document.cookie
          .split(";")
          .map((item) => item.trim())
          .find((item) => item.startsWith("locale="))
          ?.split("=")[1];
        const saved = localStorage.getItem("jenan-admin-lang");
        const nextLocale = locale === "ar" || locale === "en" ? locale : saved === "ar" || saved === "en" ? saved : "ar";
        setLang(nextLocale);
      } catch {
        setLang("ar");
      }
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("jenan-admin-lang", lang);
    } catch {
      // Ignore storage restrictions in private browsing or locked environments.
    }
  }, [lang]);

  const t = texts[lang];

  return (
    <div className="admin-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
      <aside className="admin-sidebar glass">
        <div className="admin-brand">
          <JenanLogo compact />
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
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label[lang]}
              >
                <span aria-hidden="true">{item.icon}</span>
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
              aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
            >
              {t.toggle}
            </button>
            <Link href="/admin/operations" className="btn small primary" aria-label={t.deploy}>
              {t.deploy}
            </Link>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
