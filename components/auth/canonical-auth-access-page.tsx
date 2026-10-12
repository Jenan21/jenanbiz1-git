"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from "react";

import { AuthForm } from "@/components/auth/auth-form";
import {
  AuthCloseIcon,
  AuthLoginIcon,
  AuthUserPlusIcon,
  JenanLeafMark,
} from "@/components/auth/auth-icons";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { GlobalCommandHome } from "@/components/home/global-command-home";
import type { PlatformModuleDefinition } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

interface CanonicalAuthAccessPageProps {
  locale: Locale;
  mode: "login" | "register";
  modules: readonly PlatformModuleDefinition[];
  labels?: ComponentProps<typeof AuthForm>["labels"];
  recovery?: boolean;
}

// Native card size of each approved reference, the scale at which the user saw it
// on a 768px-tall screen, and how far the card sits below / beside the screen centre.
const CARD = {
  login: { width: 758, height: 766, scale: 0.8163, down: 30.5, right: 3 },
  register: { width: 752, height: 938, scale: 0.7072, down: 12, right: 0 },
} as const;
const REFERENCE_SCREEN_HEIGHT = 768;

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
  const slotRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const recovering = recovery || pathname === "/auth/forgot";

  const closePanel = useCallback(() => {
    router.replace("/");
  }, [router]);

  // Fit the card to the screen exactly like the reference and, when opened from a
  // home button, make it grow out of that button.
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const card = CARD[registering ? "register" : "login"];

    function fit() {
      const target = slotRef.current;
      if (!target) return 1;
      const fitted = Math.min(
        window.innerHeight / REFERENCE_SCREEN_HEIGHT,
        (window.innerWidth - 24) / (card.width * card.scale),
        3.2,
      );
      const zoom = Math.max(fitted, 0.45) * card.scale;
      target.style.setProperty("--auth-zoom", String(zoom));
      target.style.setProperty("--auth-slot-w", `${card.width * zoom}px`);
      target.style.setProperty("--auth-slot-h", `${card.height * zoom}px`);
      target.style.setProperty("--auth-down", `${card.down * zoom}px`);
      target.style.setProperty("--auth-right", `${card.right * zoom}px`);
      return zoom;
    }

    const zoom = fit();
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem("jenan-auth-origin");
      sessionStorage.removeItem("jenan-auth-origin");
    } catch {
      raw = null;
    }
    if (raw) {
      try {
        const origin = JSON.parse(raw) as { x: number; y: number; size: number; at: number };
        if (Date.now() - origin.at <= 5000) {
          slot.style.setProperty("--auth-from-x", `${origin.x - (window.innerWidth / 2 + card.right * zoom)}px`);
          slot.style.setProperty("--auth-from-y", `${origin.y - (window.innerHeight / 2 + card.down * zoom)}px`);
          slot.style.setProperty("--auth-from-scale", String(Math.max(origin.size / (card.width * zoom), 0.05)));
          slot.style.setProperty("--auth-duration", "560ms");
        }
      } catch {
        // Malformed value: keep the default entrance.
      }
    }
    slot.dataset.ready = "true";

    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [registering]);

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

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
    const focusTimer = window.setTimeout(() => {
      if (panel && !panel.contains(document.activeElement)) {
        panel.querySelector<HTMLElement>("input:not([type='checkbox'])")?.focus({ preventScroll: true });
      }
    }, 450);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [closePanel]);

  const [titleAccent, titleRest] = recovering
    ? ar
      ? ["استعادة", "كلمة المرور"]
      : ["Recover", "your password"]
    : registering
      ? ar
        ? ["إنشاء", "حساب جديد"]
        : ["Create", "a new account"]
      : ar
        ? ["تسجيل", "الدخول"]
        : ["Sign", "in"];

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
      <div className="access-page__stage">
        <div ref={slotRef} className="access-page__slot" data-ready="false">
          <section
            ref={panelRef}
            id="access-panel"
            role="dialog"
            aria-modal="true"
            className="access-page__form-panel"
            aria-labelledby="access-page-title"
            aria-describedby="access-page-description"
          >
            <div className="access-card__art" aria-hidden="true">
              <span className="access-card__globe" />
              <svg
                className="access-card__arcs"
                viewBox="0 0 758 766"
                preserveAspectRatio="none"
              >
                <defs>
                  <radialGradient id="access-planet-fill" cx="0.7" cy="0.2" r="0.9">
                    <stop offset="0" stopColor="#1393d8" stopOpacity=".55" />
                    <stop offset=".55" stopColor="#0a4c93" stopOpacity=".28" />
                    <stop offset="1" stopColor="#03152b" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="access-planet-rim" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#7df4ff" />
                    <stop offset=".45" stopColor="#ffffff" />
                    <stop offset="1" stopColor="#f3d98e" />
                  </linearGradient>
                </defs>
                <circle cx="-83" cy="399" r="173" fill="url(#access-planet-fill)" />
                <circle
                  cx="-83"
                  cy="399"
                  r="173"
                  fill="none"
                  stroke="url(#access-planet-rim)"
                  strokeWidth="2.2"
                />
                <circle
                  cx="-83"
                  cy="399"
                  r="182"
                  fill="none"
                  stroke="#2fd8ff"
                  strokeOpacity=".5"
                  strokeWidth="9"
                  style={{ filter: "blur(5px)" }}
                />
                <circle
                  cx="-83"
                  cy="399"
                  r="212"
                  fill="none"
                  stroke="#4fd0ff"
                  strokeOpacity=".22"
                  strokeWidth="1"
                />
                <circle
                  cx="300"
                  cy="150"
                  r="178"
                  fill="none"
                  stroke="#78c8ff"
                  strokeOpacity=".16"
                  strokeWidth="1.2"
                />
              </svg>
              <span className="access-card__specks" />
              <span className="access-card__skyline" />
            </div>
            <button
              type="button"
              className="access-page__panel-close"
              onClick={closePanel}
              aria-label={ar ? "إغلاق" : "Close"}
            >
              <AuthCloseIcon />
            </button>
            <div className="access-card__brand" aria-label="Jenan PRO">
              <JenanLeafMark className="access-card__leaf" />
              <strong className="access-card__wordmark">
                Jenan <b>PRO</b>
              </strong>
              <small className="access-card__tagline">
                {ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}
              </small>
            </div>
            <p className="access-page__code">
              <span>
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
            </p>
            <h1 id="access-page-title">
              <span className="access-page__accent">{titleAccent}</span>{" "}
              {titleRest}
            </h1>
            <p id="access-page-description" className="access-page__subtitle">
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
                <span className="access-page__or">{ar ? "أو" : "or"}</span>
                <Link
                  className="access-page__alt-link"
                  href={registering ? "/auth" : "/register"}
                >
                  {registering ? <AuthLoginIcon /> : <AuthUserPlusIcon />}
                  {registering ? (
                    <span>
                      {ar ? "لديك حساب؟" : "Already registered?"}{" "}
                      <b>{ar ? "تسجيل الدخول" : "Sign in"}</b>
                    </span>
                  ) : (
                    <span>{ar ? "إنشاء حساب جديد" : "Create a new account"}</span>
                  )}
                </Link>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
