"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { adminNavItems } from "@/lib/admin/navigation";

const texts = {
  ar: {
    brand: "إدارة Jenan Pro",
    layer: "طبقة التحكم",
    eyebrow: "عمليات الذكاء",
    heading: "مركز التحكم",
    live: "مباشر",
    operations: "العمليات",
    toggle: "EN",
  },
  en: {
    brand: "Jenan Pro Admin",
    layer: "Control Layer",
    eyebrow: "INTELLIGENCE OPS",
    heading: "Admin command center",
    live: "live",
    operations: "Operations",
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
        const nextLocale =
          locale === "ar" || locale === "en"
            ? locale
            : saved === "ar" || saved === "en"
              ? saved
              : "ar";
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
          <span aria-hidden="true">J</span>
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
                aria-current={isActive ? "page" : undefined}
                aria-label={item.label[lang]}
              >
                <span aria-hidden="true">
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
              aria-label={
                lang === "ar" ? "Switch to English" : "التبديل إلى العربية"
              }
            >
              {t.toggle}
            </button>
            <Link href="/admin/operations" className="btn small primary">
              {t.operations}
            </Link>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </div>
    </div>
  );
}
