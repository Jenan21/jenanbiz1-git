"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";

import { AuthForm } from "@/components/auth/auth-form";
import {
  GatewayWorldMap,
  type GatewayActivityLocation,
} from "@/components/auth/gateway-world-map";
import { Icon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

interface ActivityPayload {
  activeUsers: number;
  locations: GatewayActivityLocation[];
  windowMinutes: number;
}

interface AuthAccessPageProps {
  locale: Locale;
  mode: "login" | "register";
  languageLabel: string;
  labels: ComponentProps<typeof AuthForm>["labels"];
}

const distributionColors = ["#1fe7ff", "#4df6a2", "#f0c85b", "#8a63ff", "#ff8a45"];

export function AuthAccessPage({ locale, mode, languageLabel, labels }: AuthAccessPageProps) {
  const ar = locale === "ar";
  const registering = mode === "register";
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [activity, setActivity] = useState<ActivityPayload>({
    activeUsers: 0,
    locations: [],
    windowMinutes: 15,
  });
  const topLocations = activity.locations.slice(0, 5);
  let distributionCursor = 0;
  const distributionGradient = topLocations.length
    ? `conic-gradient(${topLocations.map((location, index) => {
        const start = distributionCursor;
        distributionCursor +=
          (location.activeUsers / Math.max(activity.activeUsers, 1)) * 100;
        return `${distributionColors[index]} ${start}% ${distributionCursor}%`;
      }).join(", ")})`
    : "conic-gradient(rgba(89,243,255,.14) 0 100%)";

  useEffect(() => {
    if (!panelOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("input, button, a")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }, 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [panelOpen]);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
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
    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="access-page" data-mode={mode} data-panel-open={panelOpen || undefined}>
      <div className="access-page__stage">
      <div className="access-page__scene" aria-hidden="true">
        <div className="access-page__globe">
          <GatewayWorldMap activity={activity.locations} locale={locale} />
          <div className="access-page__network"><i /><i /><i /><i /><i /><i /></div>
          <div className="access-page__world-signals">
            {activity.locations.slice(0, 6).map((location) => (
              <span key={location.countryCode}>
                <b>{location.countryName[locale]}</b>
                <small>+{location.activeUsers}</small>
              </span>
            ))}
          </div>
        </div>
        <div className="access-page__city" />
      </div>
      <header className="access-page__header">
        <Link href="/" className="access-page__logo" aria-label="Jenan Pro">
          <span className="access-page__logo-monogram" aria-hidden="true">J</span>
          <span className="access-page__logo-copy" aria-hidden="true">
            <strong>Jenan <b>Pro</b></strong>
            <small>{ar ? "أعمال بلا حدود · فرص أكبر" : "Business Without Limits"}</small>
          </span>
        </Link>
        <nav aria-label={ar ? "إعدادات اللغة" : "Language settings"}>
          <LanguageSwitcher locale={locale} label={languageLabel} showChevron />
        </nav>
      </header>

      <section className="access-page__story">
        <span className="access-page__signal"><i />{ar ? "منظومة أعمال عالمية" : "Global business ecosystem"}</span>
        <strong className="access-page__story-lead">{ar ? "خدمات متكاملة · تحليلات ذكية · فرص عالمية" : "Integrated services · Smart analytics · Global opportunity"}</strong>
        <p>{registering
          ? (ar ? "أنشئ هويتك داخل منصة جنان برو وابدأ الوصول إلى المشاريع والأكاديمية والسوق والبرمجيات والفرص الذكية." : "Create your Jenan Pro identity and unlock projects, academy, market, software, and intelligent opportunities.")
          : (ar ? "نمكّن الأفراد والشركات من النمو والتوسع ببيانات دقيقة ورؤى استشرافية وتقنية متقدمة تقودك إلى فرص أكبر." : "Helping people and organizations grow with precise data, forward insight, and advanced technology.")}</p>
        <div className="access-page__benefits">
          <span><Icon name="rocket" /><b>{ar ? "وصول مباشر" : "Direct access"}</b><small>{ar ? "ابدأ دون تعقيد" : "Start without friction"}</small></span>
          <span><Icon name="settings" /><b>{ar ? "إدارة موحدة" : "Unified control"}</b><small>{ar ? "كل أعمالك في مكان" : "One space for work"}</small></span>
          <span><Icon name="globe" /><b>{ar ? "فرص عالمية" : "Global reach"}</b><small>{ar ? "منظومة قابلة للتوسع" : "Ready to scale"}</small></span>
          <span><Icon name="brain" /><b>{ar ? "ذكاء متقدم" : "Advanced intelligence"}</b><small>{ar ? "رؤى تقود القرار" : "Insight for decisions"}</small></span>
        </div>
      </section>

      <blockquote className="access-page__quote">{ar ? <>“نبني جسوراً بين الطموح<br />والفرص العالمية”</> : <>“Building bridges between ambition<br />and global opportunity”</>}<cite>Jenan Pro</cite></blockquote>

      <div className="access-page__access-dock" aria-label={ar ? "بوابة الوصول" : "Access gateway"}>
        {registering ? (
          <Link href="/login" className="access-page__access-action">
            <Icon name="shield" />
            <span>{ar ? "دخول" : "Sign in"}</span>
          </Link>
        ) : (
          <button ref={triggerRef} type="button" className="access-page__access-action" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen} aria-controls="access-panel">
            <Icon name="shield" />
            <span>{ar ? "دخول" : "Sign in"}</span>
          </button>
        )}
        <span className="access-page__access-orbit" aria-hidden="true" />
        {registering ? (
          <button ref={triggerRef} type="button" className="access-page__access-action" onClick={() => setPanelOpen(true)} aria-expanded={panelOpen} aria-controls="access-panel">
            <Icon name="people" />
            <span>{ar ? "حساب جديد" : "New account"}</span>
          </button>
        ) : (
          <Link href="/register" className="access-page__access-action">
            <Icon name="people" />
            <span>{ar ? "حساب جديد" : "New account"}</span>
          </Link>
        )}
      </div>

      {panelOpen ? (
        <>
          <button type="button" tabIndex={-1} className="access-page__panel-scrim" onClick={() => setPanelOpen(false)} aria-label={ar ? "إغلاق نافذة الوصول" : "Close access panel"} />
          <section ref={panelRef} id="access-panel" role="dialog" aria-modal="true" className="access-page__form-panel" aria-labelledby="access-page-title">
            <button type="button" className="access-page__panel-close" onClick={() => setPanelOpen(false)} aria-label={ar ? "إغلاق" : "Close"}>×</button>
            <span className="access-page__code">{registering ? (ar ? "إنشاء الهوية الذكية" : "SMART IDENTITY") : (ar ? "تسجيل الدخول الذكي" : "SMART ACCESS")}</span>
            <h2 id="access-page-title">{registering
              ? (ar ? "إنشاء حساب جديد" : "Create a new account")
              : (ar ? "مرحباً بعودتك" : "Welcome back")}</h2>
            <p>{registering
              ? (ar ? "أنشئ هويتك داخل منصة جنان برو." : "Create your identity inside Jenan Pro.")
              : (ar ? "سجّل الدخول إلى حسابك لمتابعة أعمالك وفرصك." : "Sign in to continue your work and opportunities.")}</p>
            <AuthForm mode={mode} locale={locale} labels={labels} />
            <div className="access-page__alternate">
              <span>{ar ? "أو" : "or"}</span>
              <Link href={registering ? "/login" : "/register"}>
                {registering ? (ar ? "لديك حساب؟ تسجيل الدخول" : "Already registered? Sign in") : (ar ? "إنشاء حساب جديد" : "Create a new account")}
                <Icon name="arrow" />
              </Link>
            </div>
          </section>
        </>
      ) : null}

      <aside className="access-page__metrics" aria-label={ar ? "مؤشرات المنصة" : "Platform metrics"}>
        <article>
          <span className="access-page__metric-icon"><Icon name="globe" /></span>
          <div><strong>{activity.locations.length}</strong><small>{ar ? "دول نشطة" : "Active countries"}</small></div>
        </article>
        <article>
          <span className="access-page__metric-icon"><Icon name="people" /></span>
          <div><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم نشط" : "Active users"}</small></div>
        </article>
        <article>
          <span className="access-page__metric-icon"><Icon name="activity" /></span>
          <div><strong>{activity.windowMinutes}</strong><small>{ar ? "دقيقة رصد" : "Minute window"}</small></div>
        </article>
        <blockquote>{ar ? "مستقبل أكثر ازدهاراً يبدأ من هنا" : "A more prosperous future begins here"}</blockquote>
      </aside>

      <section className="access-page__intel" aria-label={ar ? "معلومات المنصة" : "Platform intelligence"}>
        <article className="access-page__news">
          <header><h2>{ar ? "أحدث الأخبار والتحديثات" : "Latest news and updates"}</h2><Link href="/dashboard">{ar ? "عرض الكل" : "View all"}<Icon name="arrow" /></Link></header>
          <div>
            <Link href="/projects" className="access-page__news-card access-page__news-card--1"><span><Icon name="briefcase" /></span><small>{ar ? "فرص" : "OPPORTUNITY"}</small><strong>{ar ? "مشاريع موثقة قابلة للنمو" : "Verified projects ready to grow"}</strong><p>{ar ? "مساحات عمل مترابطة تقود التنفيذ" : "Connected workspaces built for delivery"}</p></Link>
            <Link href="/academy" className="access-page__news-card access-page__news-card--2"><span><Icon name="people" /></span><small>{ar ? "تعلم" : "LEARNING"}</small><strong>{ar ? "مسارات مهارية مرتبطة بالعمل" : "Skills connected to real work"}</strong><p>{ar ? "تعلم يقيس التقدم ويثبت الإنجاز" : "Learning that measures real progress"}</p></Link>
            <Link href="/software" className="access-page__news-card access-page__news-card--3"><span><Icon name="brain" /></span><small>{ar ? "تقنية" : "TECH"}</small><strong>{ar ? "أدوات ذكاء للأعمال" : "Business intelligence tools"}</strong><p>{ar ? "تشغيل أسرع وقرارات أوضح" : "Faster operations and clearer decisions"}</p></Link>
          </div>
        </article>

        <article className="access-page__stats">
          <h2>{ar ? "إحصائيات المنصة" : "Platform statistics"}</h2>
          <div>
            <span><Icon name="user" /><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم نشط" : "Active users"}</small></span>
            <span><Icon name="globe" /><strong>{activity.locations.length}</strong><small>{ar ? "دول نشطة" : "Active countries"}</small></span>
            <span><Icon name="briefcase" /><strong>9</strong><small>{ar ? "أقسام رئيسية" : "Main divisions"}</small></span>
            <span><Icon name="activity" /><strong>{activity.windowMinutes}</strong><small>{ar ? "دقيقة رصد" : "Minute window"}</small></span>
          </div>
        </article>

        <article className="access-page__distribution">
          <h2>{ar ? "توزيع المستخدمين" : "User distribution"}</h2>
          <div className="access-page__donut" style={{ "--distribution": distributionGradient } as CSSProperties}><strong>{activity.activeUsers}</strong><small>{ar ? "مستخدم" : "users"}</small></div>
          <ul>{topLocations.length ? topLocations.map((location, index) => <li key={location.countryCode}><i style={{ background: distributionColors[index] }} /><span>{location.countryName[locale]}</span><b>{Math.round(location.activeUsers / Math.max(activity.activeUsers, 1) * 100)}%</b></li>) : <li className="access-page__empty"><span>{ar ? "لا توجد جلسات نشطة حالياً" : "No active sessions now"}</span></li>}</ul>
        </article>
      </section>

      <section className="access-page__trust" aria-label={ar ? "خصائص المنصة" : "Platform capabilities"}>
        <span><Icon name="briefcase" />{ar ? "العمل من أي مكان" : "Work from anywhere"}</span>
        <span><Icon name="rocket" />{ar ? "أداء سريع وموثوق" : "Fast reliable performance"}</span>
        <span><Icon name="globe" />{ar ? "شبكة فرص عالمية" : "Global opportunity network"}</span>
        <span><Icon name="activity" />{ar ? "بيانات دقيقة وموثوقة" : "Accurate trusted data"}</span>
        <span><Icon name="brain" />{ar ? "ذكاء اصطناعي متقدم" : "Advanced artificial intelligence"}</span>
      </section>

      <footer className="access-page__footer">
        <nav><Link href="/benefits">{ar ? "الخصوصية" : "Privacy"}</Link><Link href="/pricing">{ar ? "الشروط والأحكام" : "Terms"}</Link><Link href={registering ? "/login" : "/register"}>{registering ? (ar ? "تسجيل الدخول" : "Sign in") : (ar ? "إنشاء حساب" : "Create account")}</Link></nav>
        <span>{ar ? "© 2026 منصة جنان برو. جميع الحقوق محفوظة." : "© 2026 Jenan Pro. All rights reserved."}</span>
      </footer>
      </div>
    </main>
  );
}
