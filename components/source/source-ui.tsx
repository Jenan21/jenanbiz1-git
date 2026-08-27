import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/source/source-controls";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { readPlatformCatalog } from "@/lib/platform/catalog";
import type { Locale } from "@/types/i18n";

export function JenanLogo({ compact = false }: { compact?: boolean } = {}) {
  return (
    <Link
      href="/dashboard"
      className="logo-wrap"
      aria-label="Jenan BIZ"
      data-compact={compact || undefined}
    >
      <Image
        src="/assets/jenan-biz-logo-transparent.png"
        alt="Jenan BIZ"
        width={152}
        height={96}
        priority
      />
    </Link>
  );
}

function JenanHeaderMark() {
  return (
    <Link href="/dashboard" className="platform-context__logo" aria-label="Jenan BIZ">
      <span aria-hidden="true" />
    </Link>
  );
}

export function WorldNetwork() {
  const points = [
    [173, 151],
    [254, 257],
    [459, 150],
    [489, 240],
    [625, 153],
    [714, 273],
  ];
  return (
    <svg viewBox="0 0 900 420" aria-hidden="true" className="world-svg">
      <g fill="none" stroke="currentColor">
        <ellipse cx="450" cy="210" rx="390" ry="150" opacity=".16" />
        <ellipse cx="450" cy="210" rx="390" ry="75" opacity=".1" />
        <path d="M63 210h774" opacity=".1" />
      </g>
      <g fill="currentColor" opacity=".18">
        <path d="M105 142 150 105l58 9 34 28-17 35-40 7-25 48-50-17-20-34z" />
        <path d="M238 226 277 217l30 21-7 36-23 36-13 60-29 20-19-31 12-44-18-36z" />
        <path d="M380 128 430 105l55 11 36 35-28 24-35-7-17 20-43-10-26-24z" />
        <path d="M433 190 481 188l38 34 7 47-36 52-35-24-21-46-30-27z" />
        <path d="M520 113 620 94l90 27 35 35-27 25-55-11-28 22-49-9-21-33-53-11z" />
        <path d="M666 246 714 231l42 17 19 31-25 30-44-4-30-24z" />
      </g>
      <g fill="var(--brand)">
        {points.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />
        ))}
      </g>
      <g fill="none" stroke="var(--brand)" opacity=".55">
        <path d="M173 151 Q330 35 459 150" />
        <path d="M459 150 Q560 80 625 153" />
        <path d="M625 153 Q735 178 714 273" />
        <path d="M254 257 Q352 175 459 150" />
        <path d="M489 240 Q585 175 714 273" />
      </g>
    </svg>
  );
}

const adminNav = [
  ["/admin", "مركز القيادة", "Command Center", "shield"],
  ["/admin/data-center", "مركز البيانات", "Data Center", "grid"],
  ["/admin/global-health", "الصحة العالمية", "Global Health", "activity"],
  ["/admin/bounty-hunters", "صائدو الجوائز", "Bounty Hunters", "sparkles"],
  ["/admin/social-growth", "الانتشار المراقب", "Governed Outreach", "globe"],
] as const satisfies ReadonlyArray<readonly [string, string, string, IconName]>;

export async function PlatformShell({
  locale,
  activeRoute,
  userLabel,
  admin = false,
  immersive = false,
  children,
}: {
  locale: Locale;
  activeRoute: string;
  userLabel: string;
  admin?: boolean;
  immersive?: boolean;
  children: ReactNode;
}) {
  const ar = locale === "ar";
  const catalog = admin ? null : await readPlatformCatalog();
  const navigation: ReadonlyArray<readonly [string, string, string, IconName]> =
    admin
      ? adminNav
      : catalog!.modules.map(
          (module) =>
            [
              module.route,
              module.title[0],
              module.title[1],
              module.icon,
            ] as const,
        );
  const current = navigation.find(([href]) => href === activeRoute);
  const currentModule = catalog?.modules.find(
    (module) => module.route === activeRoute,
  );
  return (
    <div className={"source-app" + (immersive ? " source-app--immersive" : "")}>
      <div
        className={
          "shell shell--platform" + (immersive ? " shell--immersive" : "")
        }
      >
        <div className="platform-layout">
          <aside className="platform-sidebar glass">
            <div className="platform-sidebar__mode">
              <span>{admin ? "ADMIN CONTROL" : "JENAN WORKSPACE"}</span>
              <strong>
                {admin
                  ? ar
                    ? "مركز إدارة المنصة"
                    : "Platform administration"
                  : ar
                    ? "منظومة الأعمال"
                    : "Business ecosystem"}
              </strong>
            </div>
            <nav
              className="platform-nav"
              aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
            >
              {navigation.map(([href, arabic, english, icon]) => (
                <Link
                  href={href}
                  key={href}
                  aria-current={activeRoute === href ? "page" : undefined}
                  className={`platform-nav__link ${activeRoute === href ? "active" : ""}`}
                >
                  <span className="platform-nav__icon">
                    <Icon name={icon} />
                  </span>
                  <span>{ar ? arabic : english}</span>
                  <i aria-hidden="true" />
                </Link>
              ))}
            </nav>
            <div className="platform-sidebar__footer">
              <span className="platform-sidebar__status">
                <i />
                {ar ? "واجهة تصميمية — غير تشغيلية" : "Design shell — inactive"}
              </span>
              {admin && (
                <Link href="/dashboard" className="platform-sidebar__switch">
                  <Icon name="arrow" />
                  {ar ? "العودة إلى المنصة" : "Return to platform"}
                </Link>
              )}
            </div>
          </aside>
          <div className="platform-workspace">
            <header className="platform-header glass">
              <div className="platform-context">
                <JenanHeaderMark />
                {!immersive && <span>{admin ? "JENAN ADMIN" : "JENAN BIZ"}</span>}
                <strong>
                  {current ? (ar ? current[1] : current[2]) : "Jenan BIZ"}
                </strong>
              </div>
              {immersive && currentModule && (
                <div className="platform-header__signal" aria-label={ar ? "حالة القسم" : "Section status"}>
                  <span><i />{currentModule.code}</span>
                  <strong>{ar ? currentModule.eyebrow[0] : currentModule.eyebrow[1]}</strong>
                  <small>
                    {currentModule.services.length.toLocaleString(ar ? "ar-SA" : "en-US")} {ar ? "مسارات متخصصة" : "SPECIALIZED PATHS"}
                  </small>
                </div>
              )}
              <div className="top-tools">
                <ThemeToggle label={ar ? "المظهر" : "Theme"} />
                <LanguageSwitcher
                  locale={locale}
                  label={ar ? "Switch to English" : "التبديل إلى العربية"}
                />
                <span className="user-chip">{userLabel}</span>
                <LogoutButton label={ar ? "خروج" : "Logout"} />
              </div>
            </header>
            <main className="platform-body">{children}</main>
            {!immersive && <MarketUnavailable locale={locale} />}
            {!immersive && (
              <p className="footer-note">
                {ar
                  ? "Jenan BIZ — لا تُعرض أرقام تشغيلية إلا من مصادر حقيقية"
                  : "Jenan BIZ — operational metrics require real sources"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketUnavailable({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  return (
    <div className="bottom-ticker glass market-unavailable">
      <div className="ticker-label">
        {ar ? "الأسواق العالمية" : "Global markets"}
        <span>{ar ? "مزود بيانات مباشر مطلوب" : "Live provider required"}</span>
      </div>
      <div className="ticker-track">
        {["S&P 500", "NASDAQ", "XAU/USD", "WTI", "EUR/USD", "BTC/USD"].map(
          (item) => (
            <div className="ticker-item" key={item}>
              <strong>{item}</strong>
              <span>—</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function EmptyMetric({ label, note }: { label: string; note: string }) {
  return (
    <div className="card stat-card">
      <div className="metric-label">{label}</div>
      <div className="placeholder-value">
        <b>—</b> {note}
      </div>
      <div className="spark-line" aria-hidden="true" />
    </div>
  );
}
export function FeatureCard({
  icon,
  title,
  description,
  status,
}: {
  icon: IconName;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <article className="card feature-card">
      <div className="feature-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span className="badge">{status}</span>
    </article>
  );
}
export function EmptyPanel({
  title,
  message,
  icon = "activity",
}: {
  title: string;
  message: string;
  icon?: IconName;
}) {
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      <div className="empty-state">
        <div>
          <span className="empty-icon">
            <Icon name={icon} />
          </span>
          <p>{message}</p>
        </div>
      </div>
    </section>
  );
}
