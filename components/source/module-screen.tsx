import {
  EmptyMetric,
  EmptyPanel,
  FeatureCard,
  PlatformShell,
  WorldNetwork,
} from "@/components/source/source-ui";
import type { IconName } from "@/components/ui/icons";
import { Icon } from "@/components/ui/icons";
import Link from "next/link";
import type { Locale } from "@/types/i18n";
import { ProjectsWorkspace } from "@/components/source/projects-workspace";

type Pair = [string, string];
const labels: Record<
  string,
  { title: Pair; eyebrow: Pair; description: Pair }
> = {
  "/dashboard": {
    title: ["مركز أعمالك العالمي", "Your global business command"],
    eyebrow: ["لوحة القيادة", "Command dashboard"],
    description: [
      "مساحة موحدة لمتابعة أعمالك. تظهر المؤشرات بعد ربط مصادرها الحقيقية.",
      "One workspace for your business. Metrics appear after real sources are connected.",
    ],
  },
  "/projects": {
    title: ["مركز المشاريع", "Projects center"],
    eyebrow: ["نظّم ونفّذ", "Organize and deliver"],
    description: [
      "مساحة واحدة لفهم فكرة المشروع، تقييمها، ثم تجهيزها للتنفيذ.",
      "One workspace to shape an idea, assess it, and prepare it for delivery.",
    ],
  },
  "/academy": {
    title: ["أكاديمية جنان", "Jenan Academy"],
    eyebrow: ["تعلم عالمي", "Learn globally"],
    description: [
      "واجهة اكتشاف تعليمية؛ المحتوى والتسجيل غير مفعّلين في هذه المرحلة.",
      "A learning discovery shell; content and enrollment are not active in this phase.",
    ],
  },
  "/studio": {
    title: ["استوديو جنان AI", "Jenan AI Studio"],
    eyebrow: ["مساحة الإبداع", "Creative workspace"],
    description: [
      "غلاف بصري للأدوات المستقبلية فقط؛ لم يتم تنفيذ AI Gateway.",
      "A visual shell for future tools only; no AI Gateway has been implemented.",
    ],
  },
  "/talent": {
    title: ["شبكة المواهب", "Talent network"],
    eyebrow: ["خبرات بلا حدود", "Expertise without borders"],
    description: [
      "واجهة استكشاف عالمية دون ملفات وهمية أو وظائف توظيف.",
      "A global discovery shell without fake profiles or hiring functions.",
    ],
  },
  "/market": {
    title: ["السوق العالمي", "Global market"],
    eyebrow: ["اكتشف الفرص", "Discover opportunities"],
    description: [
      "واجهة سوق فقط؛ الأسعار والقوائم تتطلب مزود بيانات حقيقي.",
      "A market shell only; pricing and listings require a real data provider.",
    ],
  },
  "/software": {
    title: ["حلول البرمجيات", "Software solutions"],
    eyebrow: ["ابنِ أعمالك", "Build your business"],
    description: [
      "كتالوج مرئي للحلول المستقبلية دون شراء أو تفعيل.",
      "A visual catalog for future solutions without purchasing or activation.",
    ],
  },
  "/marketing": {
    title: ["مركز التسويق", "Marketing center"],
    eyebrow: ["نمو ذكي", "Intelligent growth"],
    description: [
      "غلاف بصري للحملات والتحليلات، دون تنفيذ وظائف أو ربط منصات.",
      "A visual shell for campaigns and analytics, without functions or platform connections.",
    ],
  },
  "/account": {
    title: ["حسابك", "Your account"],
    eyebrow: ["الملف والإعدادات", "Profile and settings"],
    description: [
      "واجهة إعدادات الحساب الحالية؛ لا تغيّر بياناتك في هذه المرحلة المرئية.",
      "Your current account settings shell; no data is changed in this visual phase.",
    ],
  },
  "/pricing": {
    title: ["خطط Jenan BIZ", "Jenan BIZ plans"],
    eyebrow: ["اختر ما يناسب نموك", "Choose for your growth"],
    description: [
      "واجهة الخطط فقط؛ لا توجد أسعار أو مدفوعات حقيقية في هذه المرحلة.",
      "Plans interface only; no real pricing or payments exist in this phase.",
    ],
  },
  "/benefits": {
    title: ["مزايا Jenan BIZ", "Jenan BIZ benefits"],
    eyebrow: ["منظومة أعمال موحدة", "One business ecosystem"],
    description: [
      "عرض مرئي لفئات القيمة دون ادعاءات أو أرقام غير موثقة.",
      "A visual overview of value categories without unsupported claims or metrics.",
    ],
  },
  "/admin": {
    title: ["مركز القيادة العالمي", "Global command center"],
    eyebrow: ["إدارة المنصة", "Platform administration"],
    description: [
      "غلاف إداري للمؤشرات الحقيقية عند توفرها؛ لا توجد بيانات تجريبية.",
      "An admin shell for real metrics when available; no sample data is shown.",
    ],
  },
  "/admin/data-center": {
    title: ["مركز البيانات", "Data center"],
    eyebrow: ["مصادر المنصة", "Platform sources"],
    description: [
      "حالة المصادر والاتصالات ستظهر هنا بعد ربطها فعليًا.",
      "Source and connection status appears here after real integration.",
    ],
  },
  "/admin/global-health": {
    title: ["الصحة العالمية", "Global health"],
    eyebrow: ["مراقبة المنصة", "Platform observability"],
    description: [
      "لا توجد مقاييس معروضة دون مصدر مراقبة حقيقي.",
      "No metrics are displayed without a real observability source.",
    ],
  },
  "/admin/bounty-hunters": {
    title: ["صائدو الجوائز", "Bounty hunters"],
    eyebrow: ["برنامج المجتمع", "Community program"],
    description: [
      "واجهة إدارية فقط؛ البرنامج غير مفعّل في هذه المرحلة.",
      "Admin shell only; the program is not active in this phase.",
    ],
  },
  "/admin/social-growth": {
    title: ["النمو الاجتماعي", "Social growth"],
    eyebrow: ["قنوات المجتمع", "Community channels"],
    description: [
      "التحليلات الاجتماعية غير متاحة حتى ربط مصادر معتمدة.",
      "Social analytics remain unavailable until approved sources are connected.",
    ],
  },
};

const cards: Array<{ icon: IconName; ar: string; en: string }> = [
  { icon: "grid", ar: "مساحة العمل", en: "Workspace" },
  { icon: "people", ar: "المجتمع والفرق", en: "Community & teams" },
  { icon: "activity", ar: "النشاط والتحليلات", en: "Activity & analytics" },
  { icon: "sparkles", ar: "الأدوات الذكية", en: "Intelligent tools" },
];

const projectCards: Array<{ icon: IconName; ar: string; en: string }> = [
  { icon: "activity", ar: "تحليل الفكرة", en: "Idea analysis" },
  { icon: "briefcase", ar: "دراسة الجدوى", en: "Feasibility" },
  { icon: "grid", ar: "خطة التنفيذ", en: "Delivery plan" },
  { icon: "people", ar: "فريق المشروع", en: "Project team" },
];

export function ModuleScreen({
  locale,
  route,
  userLabel,
  admin = false,
}: {
  locale: Locale;
  route: string;
  userLabel: string;
  admin?: boolean;
}) {
  const ar = locale === "ar";
  const i = ar ? 0 : 1;
  const cfg = labels[route] ?? labels["/dashboard"];
  const awaiting = ar ? "بانتظار مصدر حقيقي" : "Awaiting real source";
  const projectView = route === "/projects";
  const visibleCards = projectView ? projectCards : cards;
  return (
    <PlatformShell
      locale={locale}
      activeRoute={route}
      userLabel={userLabel}
      admin={admin}
    >
      <section className={`hero glass ${projectView ? "projects-hero" : ""}`}>
        <div className="hero-copy">
          <span className="eyebrow">{cfg.eyebrow[i]}</span>
          <h1>{cfg.title[i]}</h1>
          <p>{cfg.description[i]}</p>
          {projectView && (
            <Link className="button button--primary hero-action" href="#project-flow">
              {ar ? "استكشف مسار المشروع" : "Explore the project path"}
            </Link>
          )}
        </div>
        <div className="hero-art" aria-hidden="true" />
      </section>
      {projectView && (
        <section className="card project-status" aria-labelledby="project-status-title">
          <div>
            <span className="eyebrow eyebrow--small">{ar ? "حالة القسم" : "Section status"}</span>
            <h2 id="project-status-title">{ar ? "مساحة تشغيلية" : "Operational workspace"}</h2>
            <p>
              {ar
                ? "يمكنك إنشاء مشاريعك ومتابعة مراحلها وتقييماتها من هذه المساحة. تعرض القائمة بيانات حسابك فقط."
                : "Create projects and follow their phases and assessments here. The list shows your account data only."}
            </p>
          </div>
          <span className="badge badge--preview">{ar ? "متصل" : "Connected"}</span>
        </section>
      )}
      <section className="stats-row">
        {(ar
          ? ["الإجمالي", "النشط", "هذا الشهر", "الأداء", "التغطية"]
          : ["Total", "Active", "This month", "Performance", "Coverage"]
        ).map((label) => (
          <EmptyMetric key={label} label={label} note={awaiting} />
        ))}
      </section>
      {route === "/software" && (
        <Link href="/software/robotics" className="card robotics-entry">
          <span className="feature-icon">
            <Icon name="settings" />
          </span>
          <div>
            <span className="eyebrow">JENAN ROBOTICS</span>
            <h2>{ar ? "الروبوتات الذكية" : "Intelligent robotics"}</h2>
            <p>
              {ar
                ? "استكشف كتالوج الروبوتات وتصنيفاتها ومهامها المستقبلية."
                : "Explore the future robot catalog, categories, and missions."}
            </p>
          </div>
          <span className="entry-arrow">→</span>
        </Link>
      )}
      <section className="feature-grid" aria-label={ar ? "مساحات المشروع" : "Project areas"}>
        {visibleCards.map((card) => (
          <FeatureCard
            key={card.en}
            icon={card.icon}
            title={ar ? card.ar : card.en}
            description={
              ar
                ? projectView
                  ? "منطقة جاهزة للبيانات الفعلية."
                  : "واجهة مرئية فقط؛ الوظائف غير مفعّلة في هذه المرحلة."
                : projectView
                  ? "Ready for real project data."
                  : "Visual interface only; functions are not active in this phase."
            }
            status={ar ? (projectView ? "قريباً" : "واجهة فقط") : projectView ? "Coming soon" : "Interface only"}
          />
        ))}
      </section>
      {projectView && (
        <section className="project-flow" id="project-flow" aria-labelledby="project-flow-title">
          <div className="section-heading">
            <span className="eyebrow eyebrow--small">{ar ? "من الفكرة إلى التنفيذ" : "From idea to delivery"}</span>
            <h2 id="project-flow-title">{ar ? "مسار المشروع" : "Project path"}</h2>
            <p>{ar ? "تسلسل واضح يساعدك على معرفة الخطوة التالية." : "A clear sequence that keeps the next step visible."}</p>
          </div>
          <div className="project-flow-grid">
            {(ar
              ? [
                  ["01", "الفكرة", "عرّف المشكلة والفرصة."],
                  ["02", "التقييم", "اختبر الجدوى والأثر المتوقع."],
                  ["03", "التنفيذ", "حوّل الخطة إلى نتائج قابلة للمتابعة."],
                ]
              : [
                  ["01", "Idea", "Define the problem and opportunity."],
                  ["02", "Assessment", "Test feasibility and expected impact."],
                  ["03", "Delivery", "Turn the plan into trackable outcomes."],
                ]
            ).map(([number, title, description]) => (
              <article className="project-step" key={number}>
                <span className="project-step-number" aria-hidden="true">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {projectView && <ProjectsWorkspace locale={locale} />}
      <section className="grid-2">
        <EmptyPanel
          title={ar ? "النشاط الأخير" : "Recent activity"}
          message={
            ar
              ? "لا يوجد نشاط لعرضه حتى الآن."
              : "There is no activity to display yet."
          }
        />
        <section className="card">
          <div className="card-title">
            {ar ? "الحضور العالمي" : "Global presence"}
          </div>
          <div className="world-panel">
            <WorldNetwork />
          </div>
          <div className="notice">
            {ar
              ? "تتطلب الخريطة مصدر بيانات حقيقيًا."
              : "The map requires a real data source."}
          </div>
        </section>
      </section>
    </PlatformShell>
  );
}
