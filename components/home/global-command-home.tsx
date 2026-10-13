"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  GatewayWorldMap,
  type GatewayActivityLocation,
} from "@/components/auth/gateway-world-map";
import { CinematicServices } from "@/components/home/cinematic-services";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

interface ActivityPayload {
  activeUsers: number;
  generatedAt: string;
  locations: GatewayActivityLocation[];
  windowMinutes: number;
}

// Remember where the clicked button is so the auth panel can grow out of it.
function rememberAuthOrigin(link: HTMLAnchorElement) {
  const stage = link.closest(".global-home__stage");
  if (!stage) return;
  const k = window.innerWidth / stage.getBoundingClientRect().width;
  const rect = link.getBoundingClientRect();
  link.dataset.opening = "true";
  try {
    sessionStorage.setItem(
      "jenan-auth-origin",
      JSON.stringify({
        x: (rect.left + rect.width / 2) * k,
        y: (rect.top + rect.height / 2) * k,
        size: rect.width * k,
        at: Date.now(),
      }),
    );
  } catch {
    // Storage can be unavailable; the panel then uses its default entrance.
  }
}

export function GlobalCommandHome({
  locale,
  modules,
}: {
  locale: Locale;
  modules: readonly PlatformModuleDefinition[];
}) {
  const ar = locale === "ar";
  const [activity, setActivity] = useState<ActivityPayload>({
    activeUsers: 0,
    generatedAt: "",
    locations: [],
    windowMinutes: 15,
  });
  const serviceCount = modules.reduce(
    (total, module) => total + module.services.length,
    0,
  );

  const capabilities = [
    { icon: "barChart" as const, title: ar ? "تحليلات ذكية" : "Smart analytics", note: ar ? "لقرارات أفضل" : "For better decisions" },
    { icon: "globe" as const, title: ar ? "فرص عالمية" : "Global opportunity", note: ar ? "للنمو والتوسع" : "For growth and reach" },
    { icon: "brain" as const, title: ar ? "تقنيات متقدمة" : "Advanced technology", note: ar ? "بذكاء قابل للتوسع" : "Intelligence that scales" },
    { icon: "shield" as const, title: ar ? "بيئة آمنة" : "Secure environment", note: ar ? "لأعمالك وبياناتك" : "For work and data" },
  ];

  const rootRef = useRef<HTMLElement>(null);

  // One fixed design composition scaled to the screen; the canvas then grows on the remaining axis so it always fills the window.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function fit() {
      const host = root?.parentElement;
      const width = host?.clientWidth || window.innerWidth;
      const height = host?.clientHeight || window.innerHeight;
      const scale = Math.min(width / 1661, height / 947);
      root?.style.setProperty("--home-scale", String(scale));
      root?.style.setProperty("--stage-w", `${Math.ceil(width / scale)}px`);
      root?.style.setProperty("--stage-h", `${Math.ceil(height / scale)}px`);
      // taller-than-design windows: the main scene floats in the middle, the lower block stays anchored to the bottom
      root?.style.setProperty(
        "--dy",
        `${Math.max(0, Math.ceil(height / scale) - 947) * 0.5}px`,
      );
      root?.style.setProperty(
        "--hero-boost",
        String(Math.min(1.3, Math.max(1, width / scale / 1661))),
      );
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function refreshActivity() {
      try {
        const response = await fetch("/api/platform/activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) setActivity((await response.json()) as ActivityPayload);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to refresh public activity");
        }
      }
    }
    void refreshActivity();
    const interval = window.setInterval(refreshActivity, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="global-home" ref={rootRef}>
      <div className="global-home__stage">
        <div className="global-home__atmosphere" aria-hidden="true" />

        <header className="global-home__header">
          <Link className="global-home__brand" href="/" aria-label="Jenan Pro">
            <span className="global-home__brand-art" aria-hidden="true" />
          </Link>
          <div className="global-home__tools">
            <LanguageSwitcher
              locale={locale}
              label={ar ? "Switch to English" : "التبديل إلى العربية"}
              variant="pair"
            />
          </div>
        </header>

        <section className="global-home__hero-copy">
          <h1 className="global-home__sr-only">Jenan PRO</h1>
          <p className="global-home__statement">
            {(ar
              ? ["بيانات دقيقة", "رؤى ذكية", "نمو مستدام"]
              : ["Accurate data", "Smart insights", "Sustainable growth"]
            ).map((phrase, index) => (
              <span key={phrase} data-tone={index}>{phrase}</span>
            ))}
          </p>
          <strong>
            {(ar
              ? ["خدمات متكاملة", "تحليلات ذكية", "نمو بلا حدود"]
              : ["Integrated services", "Smart analytics", "Growth without limits"]
            ).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </strong>
        </section>

        <nav
          className="global-home__access"
          aria-label={ar ? "الدخول وإنشاء الحساب" : "Sign in and create account"}
        >
          <Link
            className="global-home__access-btn"
            href="/login"
            onClick={(event) => rememberAuthOrigin(event.currentTarget)}
          >
            <svg className="global-home__access-icon" viewBox="0 0 19 24" aria-hidden="true">
              <circle cx="9.5" cy="6.3" r="5" />
              <path d="M1.7 22.2v-2.1a5.9 5.9 0 0 1 5.9-5.9h3.8a5.9 5.9 0 0 1 5.9 5.9v2.1" />
            </svg>
            <strong>{ar ? "دخول" : "Sign in"}</strong>
            <svg className="global-home__access-arrow" viewBox="0 0 14 12" aria-hidden="true">
              <path d="M1.1 6h11.8M8.1 1.2 12.9 6l-4.8 4.8" />
            </svg>
          </Link>
          <Link
            className="global-home__access-btn global-home__access-btn--register"
            href="/register"
            onClick={(event) => rememberAuthOrigin(event.currentTarget)}
          >
            <svg className="global-home__access-icon" viewBox="0 0 23 24" aria-hidden="true">
              <circle cx="10" cy="6.3" r="5" />
              <path d="M2.2 22.2v-2.1a5.9 5.9 0 0 1 5.9-5.9h4.4a5.9 5.9 0 0 1 1.7 .3M17 15.9v7.2M13.4 19.5h7.2" />
            </svg>
            <strong>{ar ? "إنشاء حساب" : "Create account"}</strong>
            <svg className="global-home__access-arrow" viewBox="0 0 14 12" aria-hidden="true">
              <path d="M1.1 6h11.8M8.1 1.2 12.9 6l-4.8 4.8" />
            </svg>
          </Link>
        </nav>

        <section className="global-home__world" aria-label={ar ? "انتشار المنصة العالمي" : "Global platform activity"}>
          <div className="global-home__globe">
            <div className="global-home__earth-texture" aria-hidden="true" />
            <GatewayWorldMap activity={activity.locations} locale={locale} />
            <div className="global-home__network" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </div>
          </div>
          <div className="global-home__city" aria-hidden="true" />
        </section>

        <aside className="global-home__kpis" aria-label={ar ? "مؤشرات المنصة" : "Platform indicators"}>
          <article><Icon name="activity" /><span><strong>{serviceCount}</strong><small>{ar ? "خدمة متاحة" : "Available services"}</small></span></article>
          <article><Icon name="people" /><span><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم نشط" : "Active users"}</small></span></article>
          <article><Icon name="globe" /><span><strong>{activity.locations.length}</strong><small>{ar ? "دول نشطة" : "Active countries"}</small></span></article>
          <blockquote>{ar ? "مستقبل أكثر ازدهاراً يبدأ من هنا" : "A more prosperous future begins here"}</blockquote>
        </aside>

        <section className="global-home__capabilities" aria-label={ar ? "قدرات المنصة" : "Platform capabilities"}>
          {capabilities.map((item) => <article key={item.title}><span><Icon name={item.icon} /></span><strong>{item.title}</strong><small>{item.note}</small></article>)}
        </section>

        <blockquote className="global-home__quote">
          {ar ? <>“نبني جسوراً بين الطموح<br />والفرص العالمية”</> : <>“Building bridges between ambition<br />and global opportunity”</>}
          <cite>Jenan Pro</cite>
        </blockquote>

        <CinematicServices locale={locale} />

        <footer className="global-home__footer"><span className="global-home__footer-brand"><b>Jenan <em>Pro</em></b><small>Business Without Limits</small></span><nav><Link href="/benefits">{ar ? "الخصوصية" : "Privacy"}</Link><Link href="/pricing">{ar ? "الشروط والأحكام" : "Terms"}</Link><Link href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link></nav><span>{ar ? "© 2026 منصة جنان برو. جميع الحقوق محفوظة." : "© 2026 Jenan Pro. All rights reserved."}</span></footer>
      </div>
    </main>
  );
}
