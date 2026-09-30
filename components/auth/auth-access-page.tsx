"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";

import { AuthForm } from "@/components/auth/auth-form";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
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
  sourceState?: "LIVE" | "UNAVAILABLE";
  windowMinutes: number;
}

interface AuthAccessPageProps {
  locale: Locale;
  mode: "login" | "register";
  languageLabel: string;
  labels?: ComponentProps<typeof AuthForm>["labels"];
  recovery?: boolean;
}

const distributionColors = [
  "#1fe7ff",
  "#4df6a2",
  "#f0c85b",
  "#8a63ff",
  "#ff8a45",
];

export function AuthAccessPage({
  locale,
  mode,
  languageLabel,
  labels,
  recovery = false,
}: AuthAccessPageProps) {
  const ar = locale === "ar";
  const registering = mode === "register";
  const pathname = usePathname();
  const router = useRouter();
  const gateway = pathname === "/auth";
  const recovering = recovery || pathname === "/auth/forgot";
  const [panelOpen, setPanelOpen] = useState(!gateway);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [activity, setActivity] = useState<ActivityPayload>({
    activeUsers: 0,
    locations: [],
    windowMinutes: 15,
  });
  const [activitySource, setActivitySource] = useState<
    "LOADING" | "LIVE_PLATFORM_ACTIVITY" | "UNAVAILABLE"
  >("LOADING");
  const topLocations = activity.locations.slice(0, 5);
  let distributionCursor = 0;
  const distributionGradient = topLocations.length
    ? `conic-gradient(${topLocations
        .map((location, index) => {
          const start = distributionCursor;
          distributionCursor +=
            (location.activeUsers / Math.max(activity.activeUsers, 1)) * 100;
          return `${distributionColors[index]} ${start}% ${distributionCursor}%`;
        })
        .join(", ")})`
    : "conic-gradient(rgba(89,243,255,.14) 0 100%)";

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    if (!gateway) router.replace("/auth");
  }, [gateway, router]);

  useEffect(() => {
    if (!panelOpen) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("input, button, a")
        ?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }, 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [closePanel, panelOpen]);

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/platform/activity", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const payload = (await response.json()) as ActivityPayload;
          setActivity(payload);
          setActivitySource(
            payload.sourceState === "UNAVAILABLE"
              ? "UNAVAILABLE"
              : "LIVE_PLATFORM_ACTIVITY",
          );
        } else {
          setActivitySource("UNAVAILABLE");
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setActivitySource("UNAVAILABLE");
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
    <main
      className="access-page"
      data-auth-access="PUBLIC"
      data-auth-privacy="PUBLIC_AGGREGATE"
      data-auth-route={pathname}
      data-auth-screen={gateway ? "gateway" : recovering ? "forgot" : mode}
      data-auth-source={
        recovering ? "PASSWORD_RECOVERY_SERVICE" : activitySource
      }
      data-mode={mode}
      data-panel-open={panelOpen || undefined}
    >
      <div className="access-page__stage">
        <div className="access-page__scene" aria-hidden="true">
          <div className="access-page__globe">
            <GatewayWorldMap activity={activity.locations} locale={locale} />
            <div className="access-page__network">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
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
            <span className="access-page__logo-monogram" aria-hidden="true">
              J
            </span>
            <span className="access-page__logo-copy" aria-hidden="true">
              <strong>
                Jenan <b>Pro</b>
              </strong>
              <small>
                {ar ? "أعمال بلا حدود · فرص أكبر" : "Business Without Limits"}
              </small>
            </span>
          </Link>
          <nav aria-label={ar ? "التنقل الرئيسي" : "Primary navigation"}>
            <Link href="/">{ar ? "الرئيسية" : "Home"}</Link>
            <Link href="/benefits">{ar ? "من نحن" : "About"}</Link>
            <Link href="/projects">{ar ? "خدماتنا" : "Services"}</Link>
            <Link href="/academy">{ar ? "الأكاديمية" : "Academy"}</Link>
            <Link href="/pricing">{ar ? "الأسعار" : "Pricing"}</Link>
            <Link href="/dashboard">{ar ? "مركز الأمر" : "Command center"}</Link>
            <LanguageSwitcher
              locale={locale}
              label={languageLabel}
              showChevron
            />
          </nav>
        </header>

        <section className="access-page__story">
          <span className="access-page__signal">
            <i />
            {ar ? "منظومة أعمال عالمية" : "Global business ecosystem"}
          </span>
          <strong className="access-page__story-lead">
            {ar
              ? "خدمات متكاملة · تحليلات ذكية · فرص عالمية"
              : "Integrated services · Smart analytics · Global opportunity"}
          </strong>
          <p>
            {recovering
              ? ar
                ? "استعد وصولك بأمان عبر بريدك المسجل، ثم عيّن كلمة مرور جديدة لحسابك."
                : "Recover access securely through your registered email, then set a new account password."
              : registering
              ? ar
                ? "أنشئ هويتك داخل منصة جنان برو وابدأ الوصول إلى المشاريع والأكاديمية والسوق والبرمجيات والفرص الذكية."
                : "Create your Jenan Pro identity and unlock projects, academy, market, software, and intelligent opportunities."
              : ar
                ? "نمكّن الأفراد والشركات من النمو والتوسع ببيانات دقيقة ورؤى استشرافية وتقنية متقدمة تقودك إلى فرص أكبر."
                : "Helping people and organizations grow with precise data, forward insight, and advanced technology."}
          </p>
          <div
            className="access-page__access-dock"
            aria-label={ar ? "بوابة الوصول" : "Access gateway"}
            aria-hidden={panelOpen || undefined}
          >
            {registering || gateway ? (
              <Link href="/auth/login" className="access-page__access-action">
                <Icon name="shield" />
                <span>
                  <b>{ar ? "دخول" : "Sign in"}</b>
                  <small>{ar ? "الوصول إلى حسابك" : "Access your account"}</small>
                </span>
              </Link>
            ) : (
              <button
                ref={triggerRef}
                type="button"
                className="access-page__access-action"
                onClick={() => setPanelOpen(true)}
                aria-expanded={panelOpen}
                aria-controls="access-panel"
              >
                <Icon name="shield" />
                <span>
                  <b>{ar ? "دخول" : "Sign in"}</b>
                  <small>{ar ? "الوصول إلى حسابك" : "Access your account"}</small>
                </span>
              </button>
            )}
            {registering ? (
              <button
                ref={triggerRef}
                type="button"
                className="access-page__access-action"
                onClick={() => setPanelOpen(true)}
                aria-expanded={panelOpen}
                aria-controls="access-panel"
              >
                <Icon name="people" />
                <span>
                  <b>{ar ? "إنشاء حساب" : "Create account"}</b>
                  <small>{ar ? "ابدأ رحلتك الآن" : "Start your journey"}</small>
                </span>
              </button>
            ) : (
              <Link href="/auth/register" className="access-page__access-action">
                <Icon name="people" />
                <span>
                  <b>{ar ? "إنشاء حساب" : "Create account"}</b>
                  <small>{ar ? "ابدأ رحلتك الآن" : "Start your journey"}</small>
                </span>
              </Link>
            )}
          </div>
          <div className="access-page__benefits">
            <span>
              <Icon name="rocket" />
              <b>{ar ? "وصول مباشر" : "Direct access"}</b>
              <small>{ar ? "ابدأ دون تعقيد" : "Start without friction"}</small>
            </span>
            <span>
              <Icon name="settings" />
              <b>{ar ? "إدارة موحدة" : "Unified control"}</b>
              <small>{ar ? "كل أعمالك في مكان" : "One space for work"}</small>
            </span>
            <span>
              <Icon name="globe" />
              <b>{ar ? "فرص عالمية" : "Global reach"}</b>
              <small>{ar ? "منظومة قابلة للتوسع" : "Ready to scale"}</small>
            </span>
            <span>
              <Icon name="brain" />
              <b>{ar ? "ذكاء متقدم" : "Advanced intelligence"}</b>
              <small>{ar ? "رؤى تقود القرار" : "Insight for decisions"}</small>
            </span>
          </div>
        </section>

        <blockquote className="access-page__quote">
          {ar ? (
            <>
              “نبني جسوراً بين الطموح
              <br />
              والفرص العالمية”
            </>
          ) : (
            <>
              “Building bridges between ambition
              <br />
              and global opportunity”
            </>
          )}
          <cite>Jenan Pro</cite>
        </blockquote>

        {panelOpen ? (
          <>
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
            >
              <button
                type="button"
                className="access-page__panel-close"
                onClick={closePanel}
                aria-label={ar ? "إغلاق" : "Close"}
              >
                ×
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
                  <small>{ar ? "مركز الأعمال الذكي" : "Intelligent Business Center"}</small>
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
              <h2 id="access-page-title">
                {recovering
                  ? ar
                    ? "استعادة كلمة المرور"
                    : "Recover your password"
                  : registering
                  ? ar
                    ? "إنشاء حساب جديد"
                    : "Create a new account"
                  : ar
                    ? "تسجيل الدخول"
                    : "Sign in"}
              </h2>
              <p>
                {recovering
                  ? ar
                    ? "أدخل بريدك لاستلام رمز التحقق ومتابعة استعادة الحساب."
                    : "Enter your email to receive a verification code and recover your account."
                  : registering
                  ? ar
                    ? "أنشئ هويتك داخل منصة جنان برو."
                    : "Create your identity inside Jenan Pro."
                  : ar
                    ? "ادخل إلى حسابك داخل منصة جنان برو."
                    : "Access your account inside Jenan Pro."}
              </p>
              {recovering ? (
                <PasswordRecoveryForm locale={locale} />
              ) : (
                <AuthForm mode={mode} locale={locale} labels={labels!} />
              )}
              {!recovering ? (
                <div className="access-page__alternate">
                  <span>{ar ? "أو" : "or"}</span>
                  <Link href={registering ? "/auth/login" : "/auth/register"}>
                    {registering
                      ? ar
                        ? "لديك حساب؟ تسجيل الدخول"
                        : "Already registered? Sign in"
                      : ar
                        ? "إنشاء حساب جديد"
                        : "Create a new account"}
                    <Icon name="arrow" />
                  </Link>
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        <aside
          className="access-page__metrics"
          aria-label={ar ? "مؤشرات المنصة" : "Platform metrics"}
        >
          <article>
            <span className="access-page__metric-icon">
              <Icon name="globe" />
            </span>
            <div>
              <strong>{activity.locations.length}</strong>
              <small>{ar ? "دول نشطة" : "Active countries"}</small>
            </div>
          </article>
          <article>
            <span className="access-page__metric-icon">
              <Icon name="people" />
            </span>
            <div>
              <strong>{activity.activeUsers}</strong>
              <small>{ar ? "مستخدم نشط" : "Active users"}</small>
            </div>
          </article>
          <article>
            <span className="access-page__metric-icon">
              <Icon name="activity" />
            </span>
            <div>
              <strong>{activity.windowMinutes}</strong>
              <small>{ar ? "دقيقة رصد" : "Minute window"}</small>
            </div>
          </article>
          <blockquote>
            {ar
              ? "مستقبل أكثر ازدهاراً يبدأ من هنا"
              : "A more prosperous future begins here"}
          </blockquote>
        </aside>

        <section
          className="access-page__intel"
          aria-label={ar ? "معلومات المنصة" : "Platform intelligence"}
        >
          <article className="access-page__news">
            <header>
              <h2>
                {ar ? "أحدث الأخبار والتحديثات" : "Latest news and updates"}
              </h2>
              <Link href="/dashboard">
                {ar ? "عرض الكل" : "View all"}
                <Icon name="arrow" />
              </Link>
            </header>
            <div>
              <Link
                href="/projects"
                className="access-page__news-card access-page__news-card--1"
              >
                <span>
                  <Icon name="briefcase" />
                </span>
                <small>{ar ? "فرص" : "OPPORTUNITY"}</small>
                <strong>
                  {ar
                    ? "مشاريع موثقة قابلة للنمو"
                    : "Verified projects ready to grow"}
                </strong>
                <p>
                  {ar
                    ? "مساحات عمل مترابطة تقود التنفيذ"
                    : "Connected workspaces built for delivery"}
                </p>
              </Link>
              <Link
                href="/academy"
                className="access-page__news-card access-page__news-card--2"
              >
                <span>
                  <Icon name="people" />
                </span>
                <small>{ar ? "تعلم" : "LEARNING"}</small>
                <strong>
                  {ar
                    ? "مسارات مهارية مرتبطة بالعمل"
                    : "Skills connected to real work"}
                </strong>
                <p>
                  {ar
                    ? "تعلم يقيس التقدم ويثبت الإنجاز"
                    : "Learning that measures real progress"}
                </p>
              </Link>
              <Link
                href="/software"
                className="access-page__news-card access-page__news-card--3"
              >
                <span>
                  <Icon name="brain" />
                </span>
                <small>{ar ? "تقنية" : "TECH"}</small>
                <strong>
                  {ar ? "أدوات ذكاء للأعمال" : "Business intelligence tools"}
                </strong>
                <p>
                  {ar
                    ? "تشغيل أسرع وقرارات أوضح"
                    : "Faster operations and clearer decisions"}
                </p>
              </Link>
            </div>
          </article>

          <article className="access-page__stats">
            <h2>{ar ? "إحصائيات المنصة" : "Platform statistics"}</h2>
            <div>
              <span>
                <Icon name="user" />
                <strong>{activity.activeUsers}</strong>
                <small>{ar ? "مستخدم نشط" : "Active users"}</small>
              </span>
              <span>
                <Icon name="globe" />
                <strong>{activity.locations.length}</strong>
                <small>{ar ? "دول نشطة" : "Active countries"}</small>
              </span>
              <span>
                <Icon name="briefcase" />
                <strong>9</strong>
                <small>{ar ? "أقسام رئيسية" : "Main divisions"}</small>
              </span>
              <span>
                <Icon name="activity" />
                <strong>{activity.windowMinutes}</strong>
                <small>{ar ? "دقيقة رصد" : "Minute window"}</small>
              </span>
            </div>
          </article>

          <article className="access-page__distribution">
            <h2>{ar ? "توزيع المستخدمين" : "User distribution"}</h2>
            <div
              className="access-page__donut"
              style={
                { "--distribution": distributionGradient } as CSSProperties
              }
            >
              <strong>{activity.activeUsers}</strong>
              <small>{ar ? "مستخدم" : "users"}</small>
            </div>
            <ul>
              {topLocations.length ? (
                topLocations.map((location, index) => (
                  <li key={location.countryCode}>
                    <i style={{ background: distributionColors[index] }} />
                    <span>{location.countryName[locale]}</span>
                    <b>
                      {Math.round(
                        (location.activeUsers /
                          Math.max(activity.activeUsers, 1)) *
                          100,
                      )}
                      %
                    </b>
                  </li>
                ))
              ) : (
                <li className="access-page__empty">
                  <span>
                    {ar
                      ? "لا توجد جلسات نشطة حالياً"
                      : "No active sessions now"}
                  </span>
                </li>
              )}
            </ul>
          </article>
        </section>

        <section
          className="access-page__trust"
          aria-label={ar ? "خصائص المنصة" : "Platform capabilities"}
        >
          <span>
            <Icon name="briefcase" />
            {ar ? "العمل من أي مكان" : "Work from anywhere"}
          </span>
          <span>
            <Icon name="rocket" />
            {ar ? "أداء سريع وموثوق" : "Fast reliable performance"}
          </span>
          <span>
            <Icon name="globe" />
            {ar ? "شبكة فرص عالمية" : "Global opportunity network"}
          </span>
          <span>
            <Icon name="activity" />
            {ar ? "بيانات دقيقة وموثوقة" : "Accurate trusted data"}
          </span>
          <span>
            <Icon name="brain" />
            {ar ? "ذكاء اصطناعي متقدم" : "Advanced artificial intelligence"}
          </span>
        </section>

        <footer className="access-page__footer">
          <span className="access-page__footer-brand">
            <b>Jenan <em>PRO</em></b>
            <small>{ar ? "أعمال بلا حدود" : "Business Without Limits"}</small>
          </span>
          <nav>
            <Link href="/benefits">{ar ? "المزايا" : "Benefits"}</Link>
            <Link href="/pricing">{ar ? "الباقات" : "Plans"}</Link>
            <Link href={registering ? "/auth/login" : "/auth/register"}>
              {registering
                ? ar
                  ? "تسجيل الدخول"
                  : "Sign in"
                : ar
                  ? "إنشاء حساب"
                  : "Create account"}
            </Link>
          </nav>
          <span>
            {ar
              ? "© 2026 منصة جنان برو. جميع الحقوق محفوظة."
              : "© 2026 Jenan Pro. All rights reserved."}
            <a
              className="access-page__map-credit"
              href="https://github.com/VictorCazanave/svg-maps"
              rel="noreferrer"
              target="_blank"
            >
              SVG Maps · CC BY 4.0
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
