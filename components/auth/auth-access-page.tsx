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
      <header className="access-page__header">
        <Link href="/" className="access-page__logo" aria-label="Jenan BIZ">
          <span className="access-page__logo-j">J</span>
          <span className="access-page__logo-copy"><strong>enan <b>BIZ</b></strong><small>{ar ? "أعمال أنجح · فرص أكبر" : "Business without limits"}</small></span>
        </Link>
        <nav>
          <Link href="/">{ar ? "الرئيسية" : "Home"}</Link>
          <Link href="/benefits">{ar ? "المزايا" : "Benefits"}</Link>
          <Link href="/pricing">{ar ? "الباقات" : "Plans"}</Link>
          <LanguageSwitcher locale={locale} label={languageLabel} showChevron />
        </nav>
      </header>

      <section className="access-page__story">
        <span className="access-page__signal"><i />{ar ? "هوية أعمال متصلة" : "Connected business identity"}</span>
        <h1>{registering
          ? (ar ? <>ابدأ مع جنان بيز<br />أنشئ حسابك الذكي</> : <>Start with Jenan BIZ<br />Create your smart account</>)
          : (ar ? <>مرحباً بعودتك<br />إلى مركز أعمالك الذكي</> : <>Welcome back<br />to your smart business command</>)}</h1>
        <p>{registering
          ? (ar ? "حساب واحد يربط المشاريع، المعرفة، السوق، وبرامج جنان في مساحة تشغيل موحدة." : "One account connects projects, knowledge, market, and Jenan Programs in one operating space.")
          : (ar ? "عودة آمنة إلى المشاريع والقرارات والخدمات المترابطة داخل مساحة تشغيل واحدة." : "A secure return to connected projects, decisions, and services in one workspace.")}</p>
        <div className="access-page__benefits">
          <span><Icon name="rocket" /><b>{ar ? "وصول مباشر" : "Direct access"}</b><small>{ar ? "ابدأ دون تعقيد" : "Start without friction"}</small></span>
          <span><Icon name="settings" /><b>{ar ? "إدارة موحدة" : "Unified control"}</b><small>{ar ? "كل أعمالك في مكان" : "One space for work"}</small></span>
          <span><Icon name="globe" /><b>{ar ? "فرص عالمية" : "Global reach"}</b><small>{ar ? "منظومة قابلة للتوسع" : "Ready to scale"}</small></span>
        </div>
        <blockquote>{ar ? "رؤية واحدة تقود إلى قرار أوضح." : "One clear view leads to a better decision."}</blockquote>
      </section>

      <section className="access-page__form-panel" aria-labelledby="access-page-title">
        <div className="access-page__form-brand" aria-label="Jenan BIZ"><span>J</span><strong>enan <b>BIZ</b></strong></div>
        <span className="access-page__code">{registering ? "ONBOARD / 02" : "ACCESS / 01"}</span>
        <h2 id="access-page-title">{registering
          ? (ar ? "إنشاء حساب" : "Create account")
          : (ar ? "تسجيل الدخول" : "Sign in")}</h2>
        <p>{registering
          ? (ar ? "أنشئ حسابك الأول وابدأ استخدام المنصة." : "Create your account and start using the platform.")
          : (ar ? "أدخل بياناتك للوصول إلى مساحة أعمالك." : "Enter your details to access your workspace.")}</p>
        <AuthForm mode={mode} locale={locale} labels={labels} />
        <div className="access-page__alternate">
          <span>{registering ? (ar ? "لديك حساب؟" : "Already registered?") : (ar ? "مستخدم جديد؟" : "New here?")}</span>
          <Link href={registering ? "/login" : "/register"}>
            {registering ? (ar ? "تسجيل الدخول" : "Sign in") : (ar ? "إنشاء حساب" : "Create account")}
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
        <div className="access-page__metrics-note"><Icon name="shield" /><span>{ar ? "المؤشرات تحمي الهوية وتعرض نشاطاً مجمعاً فقط." : "Metrics protect identity and show aggregate activity only."}</span></div>
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
        <span>{ar ? "© جنان بيز · جميع الحقوق محفوظة" : "© Jenan BIZ · All rights reserved"}</span>
        <Link href="/">Jenan BIZ</Link>
      </footer>
    </main>
  );
}
