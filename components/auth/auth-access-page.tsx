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
      <div className="access-page__map" aria-hidden="true">
        <GatewayWorldMap activity={activity.locations} locale={locale} />
      </div>
      <header className="access-page__header">
        <Link href="/" className="access-page__logo" aria-label="Jenan BIZ" />
        <nav>
          <Link href="/">{ar ? "الرئيسية" : "Home"}</Link>
          <Link href="/benefits">{ar ? "المزايا" : "Benefits"}</Link>
          <LanguageSwitcher locale={locale} label={languageLabel} showChevron />
        </nav>
      </header>

      <section className="access-page__story">
        <span className="access-page__signal"><i />{ar ? "منظومة أعمال عالمية" : "Global business ecosystem"}</span>
        <h1>{registering
          ? (ar ? "ابدأ رحلتك نحو فرص أوسع" : "Begin your path to wider opportunity")
          : (ar ? "عد إلى أعمالك من أي مكان" : "Return to your business from anywhere")}</h1>
        <p>{registering
          ? (ar ? "هوية واحدة تفتح لك خدمات المشاريع، المعرفة، السوق، والبرامج." : "One identity unlocks projects, knowledge, market, and programs.")
          : (ar ? "وصول آمن إلى منظومة أعمالك وقراراتك وخدماتك المترابطة." : "Secure access to your connected operations, decisions, and services.")}</p>
        <div className="access-page__benefits">
          <span><Icon name="globe" /><b>{ar ? "وصول عالمي" : "Global access"}</b></span>
          <span><Icon name="shield" /><b>{ar ? "هوية محمية" : "Protected identity"}</b></span>
          <span><Icon name="activity" /><b>{ar ? "بيانات مترابطة" : "Connected data"}</b></span>
        </div>
        <div className="access-page__activity">
          <i />
          <strong>{activity.activeUsers}</strong>
          <span>{ar ? `مستخدم نشط خلال ${activity.windowMinutes} دقيقة` : `active users in the last ${activity.windowMinutes} minutes`}</span>
        </div>
      </section>

      <section className="access-page__form-panel" aria-labelledby="access-page-title">
        <div className="access-page__form-brand" aria-hidden="true" />
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

      <footer className="access-page__footer">
        <span><Icon name="shield" />{ar ? "اتصال مشفر وجلسة آمنة" : "Encrypted connection and secure session"}</span>
        <Link href="/">Jenan BIZ</Link>
      </footer>
    </main>
  );
}
