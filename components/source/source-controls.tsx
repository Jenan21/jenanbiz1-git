"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";

export function ThemeToggle({
  label,
  switchStyle = false,
}: {
  label: string;
  switchStyle?: boolean;
}) {
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
  if (switchStyle) {
    return (
      <button
        className="theme-switch"
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={theme === "light"}
      >
        <Icon name="sun" />
        <span className="theme-switch__track" aria-hidden="true">
          <i />
        </span>
      </button>
    );
  }
  return (
    <button className="btn small ghost" type="button" onClick={toggle}>
      <Icon name={theme === "light" ? "moon" : "sparkles"} />
      <span>{label}</span>
    </button>
  );
}

const services = [
  ["activity", "إدارة أعمالك", "Manage your business"],
  ["people", "أكاديمية جنان", "Jenan Academy"],
  ["wallet", "سوق جنان", "Jenan Market"],
  ["briefcase", "التوظيف الذكي", "Smart recruitment"],
] as const;

export function AuthServiceCarousel({ locale }: { locale: "ar" | "en" }) {
  return (
    <aside className="auth-services" aria-label="Jenan BIZ services">
      {services.map((service) => (
        <div className="service-card card" key={service[1]}>
          <div className="service-orb">
            <Icon name={service[0]} />
          </div>
          <div>
            <h3>{locale === "ar" ? service[1] : service[2]}</h3>
            <p>
              {locale === "ar"
                ? "الخدمة جاهزة للربط عند تفعيل مرحلتها المخصصة."
                : "Ready to connect in its dedicated implementation phase."}
            </p>
          </div>
        </div>
      ))}
    </aside>
  );
}
