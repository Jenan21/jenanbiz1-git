"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export function ThemeToggle({ label, switchStyle = false }: { label: string; switchStyle?: boolean }) {
  const [theme, setTheme] = useState<"balanced-dark" | "light">(
    "balanced-dark",
  );

  useEffect(() => {
    const saved = localStorage.getItem("jenan-theme");
    const initial = saved === "light" ? "light" : "balanced-dark";
    document.documentElement.dataset.theme = initial;
    const frame = window.requestAnimationFrame(() => setTheme(initial));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = theme === "light" ? "balanced-dark" : "light";
    setTheme(next);
    localStorage.setItem("jenan-theme", next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <button
      className={`btn small ghost ${switchStyle ? "theme-switch" : ""}`}
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={theme === "light"}
    >
      <Icon name={theme === "light" ? "moon" : "sparkles"} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

const services = [
  ["activity", "تحليل المشاريع", "Project intelligence"],
  ["briefcase", "دراسة الجدوى", "Feasibility studies"],
  ["people", "أكاديمية جنان", "Jenan Academy"],
  ["wallet", "سوق جنان", "Jenan Market"],
  ["settings", "Jenan Studio", "Creative studio"],
  ["user", "Jenan Talent", "Talent intelligence"],
  ["grid", "Jenan Software", "Business software"],
  ["sparkles", "الإعلان والتسويق", "Marketing & growth"],
] as const;

export function AuthServiceCarousel({ locale }: { locale: "ar" | "en" }) {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setOffset((value) => (value + 4) % services.length),
      5600,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <aside className="auth-services" aria-label="Jenan BIZ services">
      {[0, 1, 2, 3].map((index) => {
        const service = services[(offset + index) % services.length];
        return (
          <div className="service-card card" key={service[1]}>
            <div className="service-orb">
              <Icon name={service[0]} />
            </div>
            <div>
              <h3>{locale === "ar" ? service[1] : service[2]}</h3>
              <p>
                {locale === "ar"
                  ? "واجهة جاهزة، وتُفعّل الوظائف في مرحلتها المخصصة."
                  : "UI ready; functionality arrives in its dedicated phase."}
              </p>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
