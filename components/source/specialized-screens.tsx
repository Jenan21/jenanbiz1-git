import Link from "next/link";
import type { CSSProperties } from "react";
import { EmptyMetric, PlatformShell } from "@/components/source/source-ui";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const tr = (locale: Locale, ar: string, en: string) =>
  locale === "ar" ? ar : en;

export function FundingEligibilityScreen({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const steps: Array<[IconName, string, string, string, string]> = [
    [
      "user",
      "ملف المنشأة",
      "Business profile",
      "بيانات المنشأة والقطاع والدولة",
      "Organization, sector, and country data",
    ],
    [
      "activity",
      "الجاهزية المالية",
      "Financial readiness",
      "مؤشرات موثقة من مصادر معتمدة",
      "Verified indicators from approved sources",
    ],
    [
      "shield",
      "التحقق والامتثال",
      "Verification & compliance",
      "متطلبات الأهلية حسب الجهة والدولة",
      "Eligibility requirements by provider and country",
    ],
    [
      "sparkles",
      "فرص التمويل",
      "Funding opportunities",
      "نتائج قابلة للتفسير بعد ربط المزود",
      "Explainable results after provider integration",
    ],
  ];
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/funding-eligibility"
      userLabel={userLabel}
    >
      <section className="hero glass">
        <div className="hero-copy">
          <span className="eyebrow">
            {tr(locale, "بوابة النمو والتمويل", "Growth & funding gateway")}
          </span>
          <h1>{tr(locale, "أهلية التمويل", "Funding eligibility")}</h1>
          <p>
            {tr(
              locale,
              "واجهة استرشادية لمتطلبات الأهلية ومطابقة المنشأة بفرص التمويل مستقبلًا. لا يتم احتساب نتيجة أو تقديم طلب الآن.",
              "A guided interface for future eligibility requirements and funding matching. No score or application is processed now.",
            )}
          </p>
        </div>
        <div className="hero-art funding-orbit" aria-hidden="true" />
      </section>
      <section className="stats-row">
        {[
          tr(locale, "درجة الأهلية", "Eligibility score"),
          tr(locale, "البرامج المتاحة", "Available programs"),
          tr(locale, "المتطلبات المكتملة", "Completed requirements"),
          tr(locale, "طلبات نشطة", "Active applications"),
          tr(locale, "تغطية الدول", "Country coverage"),
        ].map((label) => (
          <EmptyMetric
            key={label}
            label={label}
            note={tr(locale, "غير محسوب", "Not calculated")}
          />
        ))}
      </section>
      <section className="eligibility-layout">
        <aside className="card eligibility-steps">
          <div className="card-title">
            {tr(locale, "مسار التقييم", "Assessment journey")}
          </div>
          {steps.map(([icon, arTitle, enTitle, arText, enText], index) => (
            <div className="eligibility-step" key={enTitle}>
              <span className="step-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Icon name={icon} />
              <div>
                <strong>{ar ? arTitle : enTitle}</strong>
                <p>{ar ? arText : enText}</p>
              </div>
            </div>
          ))}
        </aside>
        <section className="card eligibility-form-shell">
          <div className="card-head">
            <div>
              <div className="card-title">
                {tr(locale, "ملف الأهلية", "Eligibility profile")}
              </div>
              <div className="card-sub">
                {tr(
                  locale,
                  "واجهة فقط — لا يتم حفظ أو إرسال البيانات",
                  "Interface only — no data is stored or submitted",
                )}
              </div>
            </div>
            <span className="badge warn">
              {tr(locale, "غير مفعّل", "Inactive")}
            </span>
          </div>
          <div className="placeholder-form">
            {[
              [
                tr(locale, "الدولة", "Country"),
                tr(locale, "يتطلب Country Engine", "Country Engine required"),
              ],
              [
                tr(locale, "نوع المنشأة", "Organization type"),
                tr(locale, "غير محدد", "Not selected"),
              ],
              [
                tr(locale, "مرحلة النمو", "Growth stage"),
                tr(locale, "غير محدد", "Not selected"),
              ],
              [
                tr(locale, "التمويل المطلوب", "Funding need"),
                tr(locale, "غير محدد", "Not selected"),
              ],
            ].map(([label, value]) => (
              <label key={label}>
                {label}
                <span>— {value}</span>
              </label>
            ))}
          </div>
          <button className="button button--primary" disabled type="button">
            {tr(locale, "ابدأ تقييم الأهلية", "Start eligibility assessment")}
          </button>
          <div className="notice">
            {tr(
              locale,
              "النتيجة المستقبلية ستعتمد على قواعد موثقة ومزودي تمويل معتمدين، ولن ينتج الذكاء الاصطناعي قرارًا ماليًا ملزمًا.",
              "Future results will rely on verified rules and approved funding providers; AI will not issue an authoritative financial decision.",
            )}
          </div>
        </section>
      </section>
    </PlatformShell>
  );
}

const robots: Array<{
  icon: IconName;
  ar: string;
  en: string;
  categoryAr: string;
  categoryEn: string;
}> = [
  {
    icon: "briefcase",
    ar: "روبوت العمليات",
    en: "Operations Robot",
    categoryAr: "الأعمال",
    categoryEn: "Business",
  },
  {
    icon: "grid",
    ar: "روبوت المستودعات",
    en: "Warehouse Robot",
    categoryAr: "اللوجستيات",
    categoryEn: "Logistics",
  },
  {
    icon: "people",
    ar: "روبوت الخدمة",
    en: "Service Robot",
    categoryAr: "الخدمات",
    categoryEn: "Service",
  },
  {
    icon: "shield",
    ar: "روبوت الفحص",
    en: "Inspection Robot",
    categoryAr: "السلامة",
    categoryEn: "Safety",
  },
];

export function RoboticsCatalogScreen({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/software"
      userLabel={userLabel}
    >
      <section className="hero glass robotics-hero">
        <div className="hero-copy">
          <span className="eyebrow">JENAN SOFTWARE / ROBOTICS</span>
          <h1>
            {tr(
              locale,
              "الروبوتات الذكية — Jenan Robotics",
              "Intelligent Robots — Jenan Robotics",
            )}
          </h1>
          <p>
            {tr(
              locale,
              "كتالوج بصري لحلول الروبوتات المستقبلية وتصنيفاتها ومهامها. المنتجات والمواصفات وخيارات التعاقد غير مفعّلة بعد.",
              "A visual catalog for future robotic solutions, categories, and missions. Products, specifications, and commercial options are not active yet.",
            )}
          </p>
          <Link className="btn small ghost" href="/software">
            {tr(locale, "العودة إلى البرمجيات", "Back to software")}
          </Link>
        </div>
        <div className="robot-visual" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
      </section>
      <div className="tabs robot-categories">
        {[
          tr(locale, "الكل", "All"),
          tr(locale, "الأعمال", "Business"),
          tr(locale, "اللوجستيات", "Logistics"),
          tr(locale, "الخدمات", "Service"),
          tr(locale, "السلامة", "Safety"),
        ].map((item, index) => (
          <button
            className={`tab-btn ${index === 0 ? "active" : ""}`}
            type="button"
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <section className="robot-catalog">
        {robots.map((robot) => (
          <article className="card robot-card" key={robot.en}>
            <div className="robot-image-placeholder">
              <Icon name={robot.icon} />
              <span>{tr(locale, "تصور المنتج", "Product concept")}</span>
            </div>
            <div className="robot-card-body">
              <span className="badge">
                {ar ? robot.categoryAr : robot.categoryEn}
              </span>
              <h2>{ar ? robot.ar : robot.en}</h2>
              <p>
                {tr(
                  locale,
                  "بطاقة تعريف مرئية لمهمة الروبوت. الوصف والصور والبيانات الفنية بانتظار اعتماد المنتج.",
                  "A visual mission card. Description, imagery, and technical data await product approval.",
                )}
              </p>
              <div className="robot-specs">
                <span>
                  {tr(locale, "المهمة", "Mission")}
                  <b>—</b>
                </span>
                <span>
                  {tr(locale, "الحمولة", "Payload")}
                  <b>—</b>
                </span>
                <span>
                  {tr(locale, "الاستقلالية", "Autonomy")}
                  <b>—</b>
                </span>
                <span>
                  {tr(locale, "التوفر", "Availability")}
                  <b>{tr(locale, "قيد التخطيط", "Planned")}</b>
                </span>
              </div>
              <div className="robot-actions">
                <button
                  className="button button--secondary"
                  disabled
                  type="button"
                >
                  {tr(locale, "شراء", "Buy")}
                </button>
                <button
                  className="button button--secondary"
                  disabled
                  type="button"
                >
                  {tr(locale, "إيجار", "Rent")}
                </button>
                <button
                  className="button button--primary"
                  disabled
                  type="button"
                >
                  {tr(locale, "طلب عرض سعر", "Request quote")}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
      <section className="robot-detail-grid">
        <div className="card video-placeholder">
          <div className="video-play">
            <Icon name="activity" />
          </div>
          <h3>{tr(locale, "فيديو توضيحي", "Demonstration video")}</h3>
          <p>
            {tr(
              locale,
              "لا يوجد فيديو معتمد للعرض حاليًا.",
              "No approved video is currently available.",
            )}
          </p>
        </div>
        <div className="card">
          <div className="card-title">{tr(locale, "المزايا", "Benefits")}</div>
          <div className="placeholder-list">
            {[
              tr(locale, "كفاءة تشغيلية", "Operational efficiency"),
              tr(locale, "تكامل آمن", "Secure integration"),
              tr(locale, "قابلية التخصيص", "Configurable missions"),
              tr(locale, "دعم عالمي", "Global support"),
            ].map((item) => (
              <span key={item}>
                <Icon name="check" />
                {item}
                <b>—</b>
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            {tr(locale, "المواصفات", "Specifications")}
          </div>
          <div className="placeholder-list">
            {[
              tr(locale, "الأبعاد", "Dimensions"),
              tr(locale, "الطاقة", "Power"),
              tr(locale, "الاتصال", "Connectivity"),
              tr(locale, "معايير السلامة", "Safety standards"),
            ].map((item) => (
              <span key={item}>
                {item}
                <b>—</b>
              </span>
            ))}
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}

export function BountyHuntersScreen({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  return (
    <PlatformShell
      locale={locale}
      activeRoute="/admin/bounty-hunters"
      userLabel={userLabel}
      admin
    >
      <section className="hero glass bounty-hero">
        <div className="hero-copy">
          <span className="eyebrow">BOUNTY HUNTERS COMMAND CENTER</span>
          <h1>
            {tr(
              locale,
              "مركز قيادة التطور والذكاء الجمعي",
              "Evolution & Collective Intelligence Command Center",
            )}
          </h1>
          <p>
            {tr(
              locale,
              "تصور إداري لـJenan Collective Intelligence Core والأجيال والسلالات المعرفية المتخصصة. لا يوجد محرك فعلي أو Agents تعمل الآن.",
              "An administrative vision for the Jenan Collective Intelligence Core and specialized knowledge generations. No engine or active agents exist now.",
            )}
          </p>
        </div>
        <div className="collective-core" aria-hidden="true">
          <span>J</span>
          <i />
          <b />
        </div>
      </section>
      <section className="stats-row">
        {[
          tr(locale, "الأجيال النشطة", "Active generations"),
          tr(locale, "السلالات المتخصصة", "Specialized lineages"),
          tr(locale, "إصدارات المعرفة", "Knowledge versions"),
          tr(locale, "قيد التحقق", "In validation"),
          tr(locale, "خبرات متراكمة", "Accumulated expertise"),
        ].map((label) => (
          <EmptyMetric
            key={label}
            label={label}
            note={tr(locale, "لا توجد بيانات", "No data")}
          />
        ))}
      </section>
      <section className="bounty-command-grid">
        <aside className="card lineage-panel">
          <div className="card-title">
            {tr(
              locale,
              "الأجيال والسلالات المتخصصة",
              "Specialized generations & lineages",
            )}
          </div>
          {[
            ["G-00", tr(locale, "النواة الأساسية", "Foundation core")],
            ["G-01", tr(locale, "سلالة المشاريع", "Projects lineage")],
            ["G-02", tr(locale, "سلالة الأكاديمية", "Academy lineage")],
            ["G-03", tr(locale, "سلالة الإدارة", "Administration lineage")],
          ].map(([code, label], index) => (
            <div className="lineage-row" key={code}>
              <span className={`lineage-node ${index === 0 ? "active" : ""}`}>
                {code}
              </span>
              <div>
                <strong>{label}</strong>
                <small>
                  {tr(
                    locale,
                    "مخطط فقط — غير منشور",
                    "Concept only — not deployed",
                  )}
                </small>
              </div>
            </div>
          ))}
        </aside>
        <section className="card knowledge-core-panel">
          <div className="card-head">
            <div>
              <div className="card-title">
                Jenan Collective Intelligence Core
              </div>
              <div className="card-sub">Evolution Command Center</div>
            </div>
            <span className="badge warn">
              {tr(locale, "غير نشط", "Inactive")}
            </span>
          </div>
          <div className="knowledge-orbit">
            <div className="core-node">
              JENAN
              <br />
              <b>CORE</b>
            </div>
            {["Research", "Validate", "Evolve", "Promote"].map(
              (item, index) => (
                <span
                  style={{ "--orbit-index": index } as CSSProperties}
                  key={item}
                >
                  {item}
                </span>
              ),
            )}
          </div>
          <div className="notice">
            {tr(
              locale,
              "لا يتم تشغيل نماذج أو وكلاء أو مهام من هذه الواجهة.",
              "No models, agents, or tasks are executed from this interface.",
            )}
          </div>
        </section>
        <aside className="card">
          <div className="card-title">Knowledge Versions</div>
          <div className="knowledge-versions">
            {["KB — Core", "KB — Projects", "KB — Academy", "KB — Admin"].map(
              (item) => (
                <div key={item}>
                  <span>{item}</span>
                  <b>v—</b>
                  <small>{tr(locale, "غير متاح", "Unavailable")}</small>
                </div>
              ),
            )}
          </div>
        </aside>
      </section>
      <section className="grid-2">
        <div className="card">
          <div className="card-title">
            {tr(locale, "دورة المعرفة", "Knowledge lifecycle")}
          </div>
          <div className="state-flow">
            {[
              ["Validation", "التحقق"],
              ["Promotion", "الترقية"],
              ["Retirement", "التقاعد"],
            ].map(([en, arabic], index) => (
              <div key={en}>
                <span>{index + 1}</span>
                <strong>{ar ? arabic : en}</strong>
                <small>{tr(locale, "لا عناصر", "No items")}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">
            {tr(
              locale,
              "أفضل الخبرات والكفاءات المتراكمة",
              "Top accumulated expertise & competencies",
            )}
          </div>
          <div className="empty-state">
            <div>
              <span className="empty-icon">
                <Icon name="sparkles" />
              </span>
              <p>
                {tr(
                  locale,
                  "لا توجد معرفة موثقة أو خبرات مروّجة للعرض بعد.",
                  "No verified knowledge or promoted expertise is available yet.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
    </PlatformShell>
  );
}
