"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { adminNavItems } from "@/lib/admin/navigation";

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
    const saved = localStorage.getItem("jenan-admin-lang");
    const locale = document.cookie.match(
      /(?:^|;\s*)locale=(ar|en)(?:;|$)/,
    )?.[1];
    const nextLanguage =
      saved === "ar" || saved === "en" ? saved : locale === "en" ? "en" : "ar";
    const frame = window.requestAnimationFrame(() => setLang(nextLanguage));
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
          {adminNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-nav-item ${isActive ? "active" : ""}`}
              >
                <span>
                  <Icon name={item.icon} />
                </span>
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
            <span className="pill">
              <span className="live-dot" /> {t.live}
            </span>
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
