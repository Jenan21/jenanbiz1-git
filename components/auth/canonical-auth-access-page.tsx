"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  type ComponentProps,
} from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { GlobalCommandHome } from "@/components/home/global-command-home";
import { Icon } from "@/components/ui/icons";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

interface CanonicalAuthAccessPageProps {
  locale: Locale;
  mode: "login" | "register";
  modules: readonly PlatformModuleDefinition[];
  labels?: ComponentProps<typeof AuthForm>["labels"];
  recovery?: boolean;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function CanonicalAuthAccessPage({
  locale,
  mode,
  modules,
  labels,
  recovery = false,
}: CanonicalAuthAccessPageProps) {
  const ar = locale === "ar";
  const registering = mode === "register";
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const recovering = recovery || pathname === "/auth/forgot";

  const closePanel = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusTimer = window.setTimeout(() => {
      panel
        ?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled])")
        ?.focus({ preventScroll: true });
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closePanel();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.checkVisibility());
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [closePanel]);

  const title = recovering
    ? ar
      ? "استعادة كلمة المرور"
      : "Recover your password"
    : registering
      ? ar
        ? "إنشاء حساب جديد"
        : "Create a new account"
      : ar
        ? "تسجيل الدخول"
        : "Sign in";

  return (
    <div
      className="access-page canonical-auth"
      data-auth-access="PUBLIC"
      data-auth-privacy="SENSITIVE_FORM"
      data-auth-route={pathname}
      data-auth-screen={recovering ? "forgot" : mode}
      data-auth-source={
        recovering ? "PASSWORD_RECOVERY_SERVICE" : "CANONICAL_PUBLIC_SCENE"
      }
      data-mode={mode}
    >
      <div className="canonical-auth__background" aria-hidden="true" inert>
        <GlobalCommandHome locale={locale} modules={modules} />
      </div>
      <button
        type="button"
        tabIndex={-1}
        className="access-page__panel-scrim"
        onClick={closePanel}
        aria-label={ar ? "إغلاق نافذة الوصول" : "Close access panel"}
      />
      <section
        ref={panelRef}
        id="access-panel"
        role="dialog"
        aria-modal="true"
        className="access-page__form-panel"
        aria-labelledby="access-page-title"
        aria-describedby="access-page-description"
      >
        <span className="access-page__panel-world" aria-hidden="true" />
        <span className="access-page__panel-city" aria-hidden="true" />
        <button
          type="button"
          className="access-page__panel-close"
          onClick={closePanel}
          aria-label={ar ? "إغلاق" : "Close"}
        >
          <Icon name="x" />
        </button>
        <div className="access-page__panel-brand" aria-label="Jenan PRO">
          <span className="access-page__panel-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            <strong>
              Jenan <b>PRO</b>
            </strong>
            <small>
              {ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}
            </small>
          </span>
        </div>
        <span className="access-page__code">
          {recovering
            ? ar
              ? "استعادة الوصول الآمن"
              : "SECURE RECOVERY"
            : registering
              ? ar
                ? "إنشاء الهوية الذكية"
                : "SMART IDENTITY"
              : ar
                ? "بوابة الدخول"
                : "ACCESS GATEWAY"}
        </span>
        <h1 id="access-page-title">{title}</h1>
        <p id="access-page-description">
          {recovering
            ? ar
              ? "أدخل بريدك لاستلام رمز التحقق ومتابعة استعادة الحساب."
              : "Enter your email to receive a verification code and recover your account."
            : registering
              ? ar
                ? "أنشئ حسابك داخل منصة جنان برو"
                : "Create your account inside Jenan Pro"
              : ar
                ? "ادخل إلى حسابك داخل منصة جنان برو"
                : "Access your account inside Jenan Pro"}
        </p>
        {recovering ? (
          <PasswordRecoveryForm locale={locale} />
        ) : (
          <AuthForm mode={mode} locale={locale} labels={labels!} />
        )}
        {!recovering ? (
          <div className="access-page__alternate">
            <span>{ar ? "أو" : "or"}</span>
            <Link href={registering ? "/auth" : "/register"}>
              <Icon name="arrow" />
              {registering
                ? ar
                  ? "لديك حساب؟ تسجيل الدخول"
                  : "Already registered? Sign in"
                : ar
                  ? "إنشاء حساب جديد"
                  : "Create a new account"}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}