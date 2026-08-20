import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/source/source-controls";
import { Icon, type IconName } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import type { Locale } from "@/types/i18n";

interface AuthShellProps {
  locale: Locale;
  languageLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  alternateText: string;
  alternateLabel: string;
  alternateHref: string;
  children: ReactNode;
}

const navigation = [
  ["الدعم", "Support"],
  ["الموارد", "Resources"],
  ["الأسعار", "Pricing"],
  ["خدماتنا", "Services"],
  ["عن جنان", "About"],
  ["الرئيسية", "Home"],
] as const;

const services: Array<
  [IconName, string, string, string, string, string, string]
> = [
  [
    "barChart",
    "تحليل المشاريع",
    "تحليلات متقدمة وذكاء اصطناعي",
    "لدعم قراراتك الاستثمارية",
    "Project analysis",
    "Advanced analysis and AI",
    "To support investment decisions",
  ],
  [
    "pieChart",
    "دراسة الجدوى",
    "دراسات احترافية وتقارير دقيقة",
    "لمشاريعك المستقبلية",
    "Feasibility studies",
    "Professional studies and reports",
    "For your future projects",
  ],
  [
    "graduation",
    "أكاديمية جنان",
    "تعلم من الخبراء وطوّر مهاراتك",
    "في عالم الأعمال",
    "Jenan Academy",
    "Learn from experts",
    "In the world of business",
  ],
  [
    "cart",
    "سوق جنان",
    "فرص، شراكات، واستثمارات",
    "في مكان واحد",
    "Jenan Market",
    "Opportunities and partnerships",
    "In one place",
  ],
];

const statusItems: Array<[IconName, string, string]> = [
  ["shield", "موثوق ومعتمد", "Trusted and certified"],
  ["globe", "الدول المتاحة", "Available countries"],
  ["trend", "المشاريع المدارة", "Managed projects"],
  ["building", "الشركات المسجلة", "Registered companies"],
  ["people", "مستخدمون نشطون", "Active users"],
];

export function AuthShell(props: AuthShellProps) {
  const ar = props.locale === "ar";
  const loginActive = props.alternateHref === "/register";

  return (
    <main className="auth-v2">
      <header className="auth-v2__header">
        <Link href="/login" className="auth-v2__brand" aria-label="Jenan BIZ">
          <Image
            src="/assets/jenan-biz-logo-transparent.png"
            alt="Jenan BIZ"
            width={997}
            height={611}
            priority
          />
        </Link>
        <nav
          className="auth-v2__nav"
          aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}
        >
          {navigation.map(([arabic, english], index) => (
            <span
              className={index === navigation.length - 1 ? "active" : ""}
              key={english}
            >
              {ar ? arabic : english}
            </span>
          ))}
        </nav>
        <div className="auth-v2__tools">
          <button type="button" className="auth-v2__explore" disabled>
            {ar ? "استكشف المنصة" : "Explore platform"}
            <Icon name="rocket" />
          </button>
          <ThemeToggle label={ar ? "المظهر" : "Theme"} switchStyle />
          <LanguageSwitcher
            locale={props.locale}
            label={props.languageLabel}
            showChevron
          />
        </div>
      </header>

      <section className="auth-v2__status glass">
        {statusItems.map(([icon, arabic, english]) => (
          <div className="auth-v2__status-item" key={english}>
            <span className="auth-v2__status-icon">
              <Icon name={icon} />
            </span>
            <span>
              <small>{ar ? arabic : english}</small>
              <strong>—</strong>
              <em>{ar ? "مزود غير متصل" : "Provider unavailable"}</em>
            </span>
          </div>
        ))}
      </section>

      <section className="auth-v2__scene">
        <Image
          className="auth-v2__map"
          src="/assets/world-network-map-transparent-2560x1440.png"
          alt=""
          fill
          sizes="100vw"
          priority
        />
        <div className="auth-v2__map-depth" aria-hidden="true" />

        <aside className="auth-v2__services">
          {services.map(
            ([icon, titleAr, textAr, detailAr, titleEn, textEn, detailEn]) => (
              <article className="auth-v2__service glass" key={titleEn}>
                <Icon name="chevron" />
                <div>
                  <h2>{ar ? titleAr : titleEn}</h2>
                  <p>
                    {ar ? textAr : textEn}
                    <br />
                    {ar ? detailAr : detailEn}
                  </p>
                </div>
                <span>
                  {icon === "barChart" ? (
                    <svg
                      className="auth-v2__service-art"
                      viewBox="0 0 36 36"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient
                          id="service-bar-gradient"
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop stopColor="#8ed8ff" />
                          <stop offset="1" stopColor="#0878ed" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M5 31V19h6v12H5Zm10 0V11h6v20h-6Zm10 0V5h6v26h-6Z"
                        fill="url(#service-bar-gradient)"
                      />
                      <path
                        d="M3 31h30"
                        fill="none"
                        stroke="#8ed8ff"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  ) : (
                    <Icon name={icon} />
                  )}
                </span>
              </article>
            ),
          )}
        </aside>

        <section className="auth-v2__card glass">
          <Image
            className="auth-v2__card-logo"
            src="/assets/jenan-biz-logo-transparent.png"
            alt="Jenan BIZ"
            width={997}
            height={611}
            priority
          />
          <h1>{ar ? "مرحباً بك في جنان بيز" : "Welcome to Jenan BIZ"}</h1>
          <p>
            {ar
              ? "منصة الأعمال الذكية لحلول عالمية بلا حدود"
              : "The intelligent business platform for borderless global solutions"}
          </p>
          <nav className="auth-v2__tabs">
            <Link className={loginActive ? "active" : ""} href="/login">
              {ar ? "تسجيل الدخول" : "Sign in"}
            </Link>
            <Link className={!loginActive ? "active" : ""} href="/register">
              {ar ? "إنشاء حساب" : "Create account"}
            </Link>
          </nav>
          {props.children}
          {loginActive && (
            <div className="auth-v2__social">
              <p>{ar ? "أو سجل الدخول باستخدام" : "Or sign in with"}</p>
              <div>
                <button type="button" disabled>
                  <span className="auth-v2__google">G</span> Google
                </button>
                <button type="button" disabled>
                  <span className="auth-v2__microsoft" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  Microsoft
                </button>
                <button type="button" disabled>
                  <span className="auth-v2__apple" aria-hidden="true">
                    ●
                  </span>
                  Apple
                </button>
              </div>
            </div>
          )}
          <p className="auth-v2__alternate">
            {props.alternateText}{" "}
            <Link href={props.alternateHref}>{props.alternateLabel}</Link>
          </p>
        </section>

        <aside className="auth-v2__activity glass">
          <header>
            <h2>{ar ? "نشاط عالمي مباشر" : "Live global activity"}</h2>
            <span>{ar ? "مزود غير متصل" : "Provider unavailable"}</span>
          </header>
          <div className="auth-v2__activity-map">
            <Image
              src="/assets/world-network-map-transparent-2560x1440.png"
              alt=""
              fill
              sizes="420px"
            />
          </div>
          <div className="auth-v2__activity-metrics">
            {[
              ar ? "الصفقات اليوم" : "Today's deals",
              ar ? "المستخدمون الآن" : "Users now",
              ar ? "المشاريع النشطة" : "Active projects",
            ].map((item) => (
              <div key={item}>
                <span>{item}</span>
                <strong>—</strong>
                <small>{ar ? "غير متاح" : "Unavailable"}</small>
              </div>
            ))}
          </div>
          <div className="auth-v2__activity-list">
            <h3>{ar ? "آخر التفاعلات" : "Latest activity"}</h3>
            {[1, 2, 3].map((item) => (
              <p key={item}>
                <span className="auth-v2__flag">—</span>
                <b>{ar ? "بيانات النشاط غير متاحة" : "Activity unavailable"}</b>
                <small>
                  {ar ? "بانتظار مزود حقيقي" : "Awaiting real provider"}
                </small>
              </p>
            ))}
          </div>
          <button type="button" disabled>
            {ar ? "عرض كل النشاط" : "View all activity"}
          </button>
        </aside>
      </section>

      <footer className="auth-v2__ticker glass">
        <div className="auth-v2__ticker-label">
          <Icon name="activity" />
          <span>
            {ar ? "تحديث الأسواق" : "Market update"}
            <small>{ar ? "مزود غير متصل" : "Provider unavailable"}</small>
          </span>
        </div>
        {["الذهب", "النفط الخام", "BTC / USD", "مؤشر الدولار"].map((item) => (
          <div className="auth-v2__ticker-item" key={item}>
            <span className="auth-v2__ticker-orb">—</span>
            <b>{item}</b>
            <strong>—</strong>
            <small>{ar ? "غير متاح" : "Unavailable"}</small>
          </div>
        ))}
      </footer>
    </main>
  );
}
