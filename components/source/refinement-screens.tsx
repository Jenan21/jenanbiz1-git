import Link from "next/link";
import { EmptyMetric, PlatformShell } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const tx = (l: Locale, ar: string, en: string) => (l === "ar" ? ar : en);
const empty = (l: Locale) => tx(l, "غير محسوب", "Not calculated");

function FinanceVisual() {
  return (
    <div className="finance-visual" aria-hidden="true">
      <div className="finance-screen">
        <Icon name="activity" />
        <i />
        <i />
        <i />
      </div>
      <div className="finance-ledger">
        <Icon name="check" />
        <span />
        <span />
        <span />
      </div>
      <div className="finance-base">
        <b />
        <b />
        <b />
      </div>
    </div>
  );
}

export function RefinedFundingScreen({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const factors = [
    "جودة الملف",
    "التدفقات النقدية",
    "الالتزامات الحالية",
    "مدة النشاط",
    "الاستقرار المالي",
    "اكتمال المستندات",
  ];
  const steps = [
    "بيانات المنشأة",
    "الجدارة المالية",
    "التحقق والامتثال",
    "فرص التمويل",
    "تجهيز الملف",
  ];
  const fields = [
    "السجل التجاري",
    "تاريخ التأسيس",
    "نوع المنشأة",
    "القطاع",
    "المدينة",
    "الإيرادات / القوائم",
    "المستندات المرفوعة",
  ];
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/funding-eligibility"
      userLabel={userLabel}
    >
      <section className="premium-hero finance-hero glass">
        <div className="hero-copy">
          <span className="eyebrow">JENAN FINANCE READINESS</span>
          <h1>
            {tx(
              locale,
              "مركز أهلية التمويل الذكي",
              "Intelligent Funding Eligibility Center",
            )}
          </h1>
          <p>
            {tx(
              locale,
              "نقيس جاهزية منشأتك، نحدد فرص التحسين، ونجهز ملفك للجهات التمويلية. الخدمة لا تضمن الحصول على التمويل؛ القرار النهائي للمموّل.",
              "We measure readiness, identify improvements, and prepare your profile. Funding is not guaranteed; the provider makes the final decision.",
            )}
          </p>
          <div className="trust-pills">
            <span>
              <Icon name="shield" />
              {tx(locale, "آمن", "Secure")}
            </span>
            <span>
              <Icon name="eye" />
              {tx(locale, "واضح", "Transparent")}
            </span>
            <span>
              <Icon name="check" />
              {tx(locale, "موثّق", "Verified")}
            </span>
          </div>
        </div>
        <FinanceVisual />
      </section>
      <section className="stats-row finance-stats">
        {[
          "درجة جاهزية التمويل",
          "الجهات المناسبة",
          "المنتجات التمويلية",
          "مستوى المخاطر",
          "تجهيز الملف",
        ].map((label) => (
          <EmptyMetric
            key={label}
            label={
              locale === "ar"
                ? label
                : ({
                    "درجة جاهزية التمويل": "Readiness score",
                    "الجهات المناسبة": "Matching providers",
                    "المنتجات التمويلية": "Funding products",
                    "مستوى المخاطر": "Risk level",
                    "تجهيز الملف": "Profile readiness",
                  }[label] ?? label)
            }
            note={empty(locale)}
          />
        ))}
      </section>
      <section className="finance-main-grid">
        <div className="card readiness-card">
          <div className="card-title">
            {tx(locale, "درجة جاهزية التمويل", "Funding readiness score")}
          </div>
          <div className="readiness-body">
            <div className="readiness-ring">
              <strong>—</strong>
              <span>{empty(locale)}</span>
              <small>{tx(locale, "من 100", "of 100")}</small>
            </div>
            <div className="factor-grid">
              {factors.map((factor, index) => (
                <div key={factor}>
                  <Icon
                    name={
                      (
                        [
                          "user",
                          "activity",
                          "wallet",
                          "briefcase",
                          "shield",
                          "check",
                        ] as IconName[]
                      )[index]
                    }
                  />
                  <span>
                    {locale === "ar"
                      ? factor
                      : [
                          "Profile quality",
                          "Cash flow",
                          "Current obligations",
                          "Operating history",
                          "Financial stability",
                          "Document completion",
                        ][index]}
                  </span>
                  <b>{empty(locale)}</b>
                </div>
              ))}
            </div>
          </div>
          <p className="readiness-note">
            {tx(
              locale,
              "أكمل بيانات منشأتك لاحتساب درجة الجاهزية.",
              "Complete your business profile to calculate readiness.",
            )}
          </p>
        </div>
        <div className="card journey-card">
          <div className="card-title">
            {tx(locale, "رحلة التقييم", "Assessment journey")}
          </div>
          <div className="journey-line">
            {steps.map((step, index) => (
              <div key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i>
                  <Icon
                    name={
                      (
                        [
                          "user",
                          "activity",
                          "shield",
                          "sparkles",
                          "briefcase",
                        ] as IconName[]
                      )[index]
                    }
                  />
                </i>
                <div>
                  <strong>
                    {locale === "ar"
                      ? step
                      : [
                          "Business data",
                          "Financial eligibility",
                          "Verification & compliance",
                          "Funding opportunities",
                          "Profile preparation",
                        ][index]}
                  </strong>
                  <small>
                    {tx(locale, "بانتظار البيانات", "Awaiting data")}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="finance-lower-grid">
        <div className="card enterprise-data">
          <div className="card-head">
            <div>
              <div className="card-title">
                {tx(
                  locale,
                  "بيانات المنشأة والمستندات",
                  "Business data & documents",
                )}
              </div>
              <div className="card-sub">
                {tx(
                  locale,
                  "عرض تمهيدي فقط — لا يوجد حفظ أو رفع الآن",
                  "Preview only — no saving or upload",
                )}
              </div>
            </div>
            <button className="btn small ghost" disabled>
              {tx(locale, "تعديل", "Edit")}
            </button>
          </div>
          <div className="data-fields">
            {fields.map((field, index) => (
              <div key={field}>
                <span>
                  {locale === "ar"
                    ? field
                    : [
                        "Commercial registration",
                        "Foundation date",
                        "Organization type",
                        "Sector",
                        "City",
                        "Revenue / statements",
                        "Uploaded documents",
                      ][index]}
                </span>
                <b>—</b>
              </div>
            ))}
          </div>
          <div className="document-empty">
            <Icon name="briefcase" />
            <strong>
              {tx(locale, "لم يتم رفع أي مستندات", "No documents uploaded")}
            </strong>
            <small>
              {tx(
                locale,
                "ستظهر قائمة المستندات المطلوبة هنا.",
                "Required documents will appear here.",
              )}
            </small>
          </div>
        </div>
        <aside className="card ai-advisor-card">
          <div className="card-head">
            <div>
              <div className="card-title">Jenan AI Advisor</div>
              <div className="card-sub">
                {tx(
                  locale,
                  "مستشار تحسين الجاهزية",
                  "Readiness improvement advisor",
                )}
              </div>
            </div>
            <span className="badge">BETA</span>
          </div>
          <div className="advisor-orb">
            <Icon name="sparkles" />
          </div>
          {[
            ["نقاط التحسين", "Improvement points"],
            ["المستندات الناقصة", "Missing documents"],
            ["مجالات رفع الجاهزية", "Readiness opportunities"],
            ["منتجات وجهات محتملة", "Potential providers"],
          ].map(([ar, en], index) => (
            <div className="advisor-row" key={en}>
              <Icon
                name={
                  (
                    [
                      "activity",
                      "briefcase",
                      "sparkles",
                      "people",
                    ] as IconName[]
                  )[index]
                }
              />
              <span>{locale === "ar" ? ar : en}</span>
              <b>{tx(locale, "غير متوفر", "Unavailable")}</b>
            </div>
          ))}
          <div className="notice">
            {tx(
              locale,
              "Jenan يقدم تحليلًا إرشاديًا؛ القرار النهائي للجهة الممولة.",
              "Jenan provides guidance; the funding provider makes the final decision.",
            )}
          </div>
        </aside>
      </section>
    </PlatformShell>
  );
}

const robotCatalog = [
  {
    slug: "restro-bot",
    model: "J-Restro Bot",
    ar: "خدمة المطاعم والضيافة",
    en: "Restaurant & hospitality",
    icon: "briefcase" as IconName,
  },
  {
    slug: "clean-pro",
    model: "J-Clean Pro",
    ar: "التنظيف الذكي",
    en: "Smart cleaning",
    icon: "sparkles" as IconName,
  },
  {
    slug: "delivery-max",
    model: "J-Delivery Max",
    ar: "التوصيل والنقل الداخلي",
    en: "Indoor delivery",
    icon: "grid" as IconName,
  },
  {
    slug: "secure-vision",
    model: "J-Secure Vision",
    ar: "الأمن والمراقبة",
    en: "Security & monitoring",
    icon: "shield" as IconName,
  },
];

function RobotIllustration({
  icon,
  large = false,
}: {
  icon: IconName;
  large?: boolean;
}) {
  return (
    <div className={`robot-product-visual ${large ? "large" : ""}`}>
      <div className="robot-head">
        <i />
        <i />
      </div>
      <div className="robot-body">
        <Icon name={icon} />
      </div>
      <div className="robot-wheel" />
    </div>
  );
}

export function RefinedRoboticsCatalog({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const categories = [
    "الكل",
    "المطاعم والضيافة",
    "خدمة العملاء والاستقبال",
    "التنظيف",
    "المستودعات",
    "التوصيل والنقل الداخلي",
    "الأمن والمراقبة",
    "المصانع",
    "الفحص والصيانة",
    "التعليم والعروض",
    "أخرى",
  ];
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/software"
      userLabel={userLabel}
    >
      <section className="premium-hero robotics-premium-hero glass">
        <div className="robotics-hero-copy">
          <span className="eyebrow">JENAN SOFTWARE / ROBOTICS</span>
          <h1>
            Jenan Robotics —{" "}
            {tx(locale, "الروبوتات الذكية", "Intelligent Robotics")}
          </h1>
          <p>
            {tx(
              locale,
              "حلول روبوتية متقدمة لأتمتة المهام ورفع الكفاءة في مختلف القطاعات.",
              "Advanced robotic solutions for task automation and operational efficiency.",
            )}
          </p>
          <div className="robotics-advisor">
            <div className="advisor-title">
              <span>Jenan Robotics Advisor</span>
              <b>BETA</b>
              <strong>
                {tx(
                  locale,
                  "ما المهمة التي تريد أتمتتها؟",
                  "What task do you want to automate?",
                )}
              </strong>
            </div>
            <div className="advisor-prompt">
              {tx(
                locale,
                "أحتاج روبوتًا لخدمة الطعام داخل مطعم 500 متر",
                "I need a food-service robot for a 500 m² restaurant",
              )}
            </div>
            <div className="advisor-filters">
              {[
                "القطاع",
                "نوع المهمة",
                "الدولة",
                "شراء / إيجار",
                "الميزانية",
                "بيئة العمل",
              ].map((item, index) => (
                <span key={item}>
                  {locale === "ar"
                    ? item
                    : [
                        "Sector",
                        "Task type",
                        "Country",
                        "Buy / rent",
                        "Budget",
                        "Environment",
                      ][index]}
                </span>
              ))}
              <button className="button button--primary" disabled>
                {tx(locale, "ابحث عن روبوت مناسب", "Find a suitable robot")}
              </button>
            </div>
          </div>
        </div>
        <RobotIllustration icon="sparkles" large />
      </section>
      <section className="robot-category-strip">
        {categories.map((cat, index) => (
          <button
            type="button"
            className={index === 0 ? "active" : ""}
            key={cat}
          >
            <Icon
              name={
                (
                  [
                    "grid",
                    "briefcase",
                    "people",
                    "sparkles",
                    "grid",
                    "arrow",
                    "shield",
                    "settings",
                    "activity",
                    "people",
                    "plus",
                  ] as IconName[]
                )[index]
              }
            />
            <span>
              {locale === "ar"
                ? cat
                : [
                    "All",
                    "Hospitality",
                    "Reception",
                    "Cleaning",
                    "Warehouses",
                    "Delivery",
                    "Security",
                    "Factories",
                    "Inspection",
                    "Education",
                    "Other",
                  ][index]}
            </span>
          </button>
        ))}
      </section>
      <div className="catalog-heading">
        <div>
          <span className="eyebrow">JENAN ROBOTICS CATALOG</span>
          <h2>{tx(locale, "الروبوتات المميزة", "Featured robots")}</h2>
        </div>
        <span className="badge warn">
          {tx(locale, "بيانات المورد غير متوفرة", "Provider data unavailable")}
        </span>
      </div>
      <section className="premium-robot-grid">
        {robotCatalog.map((robot) => (
          <article className="premium-robot-card card" key={robot.slug}>
            <div className="robot-thumbnail">
              <RobotIllustration icon={robot.icon} />
              <span className="media-badge">
                <Icon name="activity" />
              </span>
            </div>
            <div className="robot-summary">
              <span className="badge">
                {locale === "ar" ? robot.ar : robot.en}
              </span>
              <h3>{robot.model}</h3>
              <p>
                {tx(
                  locale,
                  "نموذج مرئي لمهمة روبوتية متخصصة. البيانات النهائية بانتظار المورد المعتمد.",
                  "A visual concept for a specialized robot mission. Final data awaits an approved provider.",
                )}
              </p>
              <div className="robot-capabilities">
                <span>
                  {tx(locale, "المهمة", "Mission")} <b>—</b>
                </span>
                <span>
                  {tx(locale, "الدولة / التوفر", "Country / availability")}{" "}
                  <b>{tx(locale, "غير متوفر", "Unavailable")}</b>
                </span>
                <span>
                  {tx(locale, "خيار التعاقد", "Commercial option")}{" "}
                  <b>{tx(locale, "شراء أو إيجار", "Buy or rent")}</b>
                </span>
              </div>
              <div className="capability-tags">
                <i>{tx(locale, "تشغيل ذكي", "Smart operation")}</i>
                <i>{tx(locale, "سلامة", "Safety")}</i>
                <i>{tx(locale, "دعم", "Support")}</i>
              </div>
              <Link
                href={`/software/robotics/${robot.slug}`}
                className="button button--primary"
              >
                {tx(locale, "عرض الروبوت", "View robot")} <Icon name="arrow" />
              </Link>
            </div>
          </article>
        ))}
      </section>
    </PlatformShell>
  );
}

export function RobotDetailScreen({
  locale,
  userLabel,
  slug,
}: {
  locale: Locale;
  userLabel: string;
  slug: string;
}) {
  const robot =
    robotCatalog.find((item) => item.slug === slug) ?? robotCatalog[0];
  const tabs = [
    "نظرة عامة",
    "المزايا",
    "المواصفات",
    "حالات الاستخدام",
    "متطلبات المكان",
    "التركيب والتدريب",
    "الصيانة والدعم",
  ];
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/software"
      userLabel={userLabel}
    >
      <div className="detail-breadcrumb">
        <Link href="/software">{tx(locale, "البرمجيات", "Software")}</Link>
        <span>›</span>
        <Link href="/software/robotics">
          {tx(locale, "الروبوتات الذكية", "Robotics")}
        </Link>
        <span>›</span>
        <b>{robot.model}</b>
      </div>
      <section className="robot-detail-hero">
        <div className="card primary-media">
          <div className="media-stage">
            <RobotIllustration icon={robot.icon} large />
            <button className="play-button" type="button" disabled>
              <Icon name="activity" />
            </button>
            <span>
              {tx(
                locale,
                "لا يوجد فيديو معتمد حاليًا",
                "No approved video available",
              )}
            </span>
          </div>
          <div className="media-thumbnails">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item}>
                <RobotIllustration icon={robot.icon} />
              </div>
            ))}
          </div>
        </div>
        <div className="card robot-detail-copy">
          <span className="eyebrow">JENAN ROBOTICS / PRODUCT CONCEPT</span>
          <h1>{robot.model}</h1>
          <p>{locale === "ar" ? robot.ar : robot.en}</p>
          <div className="detail-facts">
            {[
              ["الاستخدام", "Use"],
              ["القطاع", "Sector"],
              ["الموديل", "Model"],
              ["سعة الحمولة", "Payload"],
              ["وقت التشغيل", "Runtime"],
              ["بيئة التشغيل", "Environment"],
            ].map(([ar, en]) => (
              <div key={en}>
                <span>{locale === "ar" ? ar : en}</span>
                <b>— {tx(locale, "غير متوفر", "Unavailable")}</b>
              </div>
            ))}
          </div>
        </div>
        <aside className="card contract-panel">
          <div className="card-title">
            {tx(locale, "خيارات التعاقد", "Commercial options")}
          </div>
          {[
            ["شراء", "Buy"],
            ["إيجار شهري", "Monthly rental"],
            ["طلب عرض سعر", "Request quote"],
          ].map(([ar, en], index) => (
            <label key={en}>
              <input type="radio" disabled suppressHydrationWarning />
              <span>
                <strong>{locale === "ar" ? ar : en}</strong>
                <small>
                  {index === 2
                    ? tx(locale, "احصل على عرض مخصص", "Get a tailored offer")
                    : tx(locale, "غير متوفر حاليًا", "Currently unavailable")}
                </small>
              </span>
            </label>
          ))}
          <button className="button button--primary" disabled>
            {tx(locale, "طلب عرض سعر", "Request a quote")}
          </button>
          <div className="notice">
            {tx(
              locale,
              "لا يوجد Payment أو Rental Engine في هذه المرحلة.",
              "No payment or rental engine exists in this phase.",
            )}
          </div>
        </aside>
      </section>
      <nav className="detail-tabs">
        {tabs.map((tab, index) => (
          <button
            type="button"
            className={index === 0 ? "active" : ""}
            key={tab}
          >
            {locale === "ar"
              ? tab
              : [
                  "Overview",
                  "Benefits",
                  "Specifications",
                  "Use cases",
                  "Site requirements",
                  "Installation & training",
                  "Maintenance & support",
                ][index]}
          </button>
        ))}
      </nav>
      <section className="detail-content-grid">
        <div className="card">
          <div className="card-title">
            {tx(locale, "أهم المزايا", "Key benefits")}
          </div>
          <div className="detail-empty-list">
            {[
              "الملاحة الذكية",
              "السلامة التشغيلية",
              "إدارة المهام",
              "التكامل المستقبلي",
            ].map((item, index) => (
              <div key={item}>
                <Icon name="check" />
                <span>
                  {locale === "ar"
                    ? item
                    : [
                        "Smart navigation",
                        "Operational safety",
                        "Task management",
                        "Future integration",
                      ][index]}
                </span>
                <b>—</b>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            {tx(
              locale,
              "المواصفات والمتطلبات",
              "Specifications & requirements",
            )}
          </div>
          <div className="detail-empty-list">
            {[
              "ساعات التشغيل",
              "الحمولة / السعة",
              "متطلبات المكان",
              "التركيب والتدريب",
              "الصيانة والضمان",
              "التوفر حسب الدولة",
              "المورد",
            ].map((item, index) => (
              <div key={item}>
                <span>
                  {locale === "ar"
                    ? item
                    : [
                        "Operating hours",
                        "Payload / capacity",
                        "Site requirements",
                        "Installation & training",
                        "Maintenance & warranty",
                        "Country availability",
                        "Provider",
                      ][index]}
                </span>
                <b>{tx(locale, "غير متوفر", "Unavailable")}</b>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
