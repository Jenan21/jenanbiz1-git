"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps } from "react";

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

export function AuthAccessPage({ locale, mode, languageLabel, labels }: AuthAccessPageProps) {
  const ar = locale === "ar";
  const registering = mode === "register";
  const [activity, setActivity] = useState<ActivityPayload>({
    activeUsers: 0,
    locations: [],
    windowMinutes: 15,
  });

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
    <main className="access-page" data-mode={mode}>
      <div className="access-page__scene" aria-hidden="true">
        <div className="access-page__city" />
        <div className="access-page__globe">
          <GatewayWorldMap activity={activity.locations} locale={locale} />
        </div>
      </div>
      <div className="access-page__stage">
      <header className="access-page__header">
        <Link href="/" className="access-page__logo" aria-label="Jenan Pro">
          <img className="access-page__logo-image" src="/assets/jenan-pro-logo.jpg" alt="" />
          <span className="access-page__logo-copy"><strong>Jenan <b>Pro</b></strong><small>{ar ? "أعمال أنجح · فرص أكبر" : "Business without limits"}</small></span>
        </Link>
        <nav>
          <Link href="/">{ar ? "الرئيسية" : "Home"}</Link>
          <Link href="/benefits">{ar ? "المزايا" : "Benefits"}</Link>
          <Link href="/pricing">{ar ? "الباقات" : "Plans"}</Link>
          <LanguageSwitcher locale={locale} label={languageLabel} showChevron />
        </nav>
      </header>

      <section className="access-page__story">
        <span className="access-page__signal"><i />{ar ? "منظومة أعمال عالمية" : "Global business ecosystem"}</span>
        <h1>{registering
          ? (ar ? <>منصة جنان برو<br />ابدأ أعمالك بذكاء</> : <>Jenan Pro<br />Start building intelligently</>)
          : (ar ? <>منصة جنان برو<br />مركز الأعمال الذكي</> : <>Jenan Pro<br />Intelligent Business Command</>)}</h1>
        <strong className="access-page__story-lead">{ar ? "خدمات متكاملة · تحليلات ذكية · فرص عالمية" : "Integrated services · Smart analytics · Global opportunity"}</strong>
        <p>{registering
          ? (ar ? "أنشئ هويتك داخل منصة جنان برو وابدأ الوصول إلى المشاريع والأكاديمية والسوق والبرمجيات والفرص الذكية." : "Create your Jenan Pro identity and unlock projects, academy, market, software, and intelligent opportunities.")
          : (ar ? "نمكّن الأفراد والشركات من النمو والتوسع ببيانات دقيقة ورؤى استشرافية وتقنية متقدمة تقودك إلى فرص أكبر." : "Helping people and organizations grow with precise data, forward insight, and advanced technology.")}</p>
        <div className="access-page__benefits">
          <span><Icon name="rocket" /><b>{ar ? "وصول مباشر" : "Direct access"}</b><small>{ar ? "ابدأ دون تعقيد" : "Start without friction"}</small></span>
          <span><Icon name="settings" /><b>{ar ? "إدارة موحدة" : "Unified control"}</b><small>{ar ? "كل أعمالك في مكان" : "One space for work"}</small></span>
          <span><Icon name="globe" /><b>{ar ? "فرص عالمية" : "Global reach"}</b><small>{ar ? "منظومة قابلة للتوسع" : "Ready to scale"}</small></span>
        </div>
        <blockquote>{ar ? <>“نبني جسوراً بين الطموح<br />والفرص العالمية”<cite>Jenan Pro</cite></> : <>“Building bridges between ambition<br />and global opportunity”<cite>Jenan Pro</cite></>}</blockquote>
      </section>

      <section className="access-page__form-panel" aria-labelledby="access-page-title">
        <div className="access-page__form-brand" aria-label="Jenan Pro"><img src="/assets/jenan-pro-logo.jpg" alt="" /><strong>Jenan <b>Pro</b></strong></div>
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
        <blockquote className="access-page__metrics-quote">
          {ar ? <>مستقبل<br />أكثر ازدهاراً<br />يبدأ من هنا</> : <>A more prosperous<br />future begins<br />here</>}
        </blockquote>
        <div className="access-page__metrics-summary">
          <span><Icon name="globe" /><strong>{activity.locations.length}</strong><small>{ar ? "أسواق نشطة" : "Active markets"}</small></span>
          <span><Icon name="trend" /><strong>{activity.activeUsers}</strong><small>{ar ? "جلسة نشطة" : "Active sessions"}</small></span>
        </div>
      </aside>

      <section className="access-page__trust" aria-label={ar ? "خصائص المنصة" : "Platform capabilities"}>
        <span><Icon name="shield" />{ar ? "هوية وجلسة محمية" : "Protected identity and session"}</span>
        <span><Icon name="rocket" />{ar ? "أداء سريع وموثوق" : "Fast reliable performance"}</span>
        <span><Icon name="globe" />{ar ? "وصول عالمي مرن" : "Flexible global access"}</span>
        <span><Icon name="briefcase" />{ar ? "العمل من أي مكان" : "Work from anywhere"}</span>
        <span><Icon name="activity" />{ar ? "بيانات تشغيل مترابطة" : "Connected operational data"}</span>
        <span><Icon name="brain" />{ar ? "خدمات ذكية قابلة للتوسع" : "Scalable intelligent services"}</span>
      </section>

      <footer className="access-page__footer">
        <span>{ar ? "© جنان برو · جميع الحقوق محفوظة" : "© Jenan Pro · All rights reserved"}</span>
        <Link href="/">Jenan Pro</Link>
      </footer>
      </div>
    </main>
  );
}
