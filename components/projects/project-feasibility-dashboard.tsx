import Link from "next/link";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];

const professionalSections: ReadonlyArray<{
  icon: IconName;
  title: Copy;
}> = [
  { icon: "barChart", title: ["دراسة السوق والتحليل التنافسي", "Market and competitive study"] },
  { icon: "wallet", title: ["التوقعات المالية والجدوى الاقتصادية", "Financial forecasts and economic feasibility"] },
  { icon: "settings", title: ["النموذج التشغيلي وخطة التشغيل", "Operating model and plan"] },
  { icon: "building", title: ["الدراسة الفنية والتقنية", "Technical study"] },
  { icon: "people", title: ["تحليل SWOT ونقاط القوة والضعف", "SWOT analysis"] },
  { icon: "trend", title: ["تحليل نقطة التعادل", "Break-even analysis"] },
  { icon: "sparkles", title: ["التوصيات الاستراتيجية", "Strategic recommendations"] },
  { icon: "activity", title: ["الجدول الزمني للتنفيذ", "Delivery timeline"] },
];

const benefits: ReadonlyArray<{
  icon: IconName;
  note: Copy;
  title: Copy;
}> = [
  { icon: "rocket", title: ["تسريع نجاح مشروعك", "Accelerate project success"], note: ["خطة تنفيذ واضحة", "Clear delivery plan"] },
  { icon: "barChart", title: ["تحليل عميق وقرارات مدروسة", "Deep analysis and sound decisions"], note: ["مؤشرات حقيقية", "Evidence-based indicators"] },
  { icon: "people", title: ["مناسبة للمستثمرين والجهات الرسمية", "Investor and authority ready"], note: ["صياغة احترافية", "Professional structure"] },
  { icon: "activity", title: ["دقة وموثوقية بمعايير عالمية", "Reliable global standards"], note: ["مراجعة بشرية", "Human review"] },
];

const comparisonRows: ReadonlyArray<{
  label: Copy;
  professional: Copy;
  simple: Copy;
}> = [
  { label: ["دراسة السوق والتحليل التنافسي", "Market and competitive analysis"], simple: ["تحليل عام للسوق", "General market review"], professional: ["تحليل شامل للسوق والمنافسين", "Comprehensive market and competitor analysis"] },
  { label: ["التوقعات المالية والجدوى الاقتصادية", "Financial forecasts"], simple: ["توقعات مالية أساسية", "Basic financial forecasts"], professional: ["نماذج مالية مفصلة وسيناريوهات", "Detailed models and scenarios"] },
  { label: ["النموذج التشغيلي وخطة التشغيل", "Operating model"], simple: ["نموذج تشغيل مبسط", "Simplified operating model"], professional: ["نموذج تفصيلي وخطة تشغيلية", "Detailed model and operating plan"] },
  { label: ["الدراسة الفنية والتقنية", "Technical study"], simple: ["مراجعة عامة", "General review"], professional: ["تحليل فني شامل", "Complete technical analysis"] },
  { label: ["تحليل SWOT", "SWOT analysis"], simple: ["تحليل مختصر", "Concise analysis"], professional: ["تحليل متكامل مع خطة معالجة", "Complete analysis and response plan"] },
  { label: ["تحليل نقطة التعادل", "Break-even"], simple: ["حساب مبسط", "Simplified calculation"], professional: ["تحليل وحساسية وسيناريوهات", "Analysis, sensitivity, and scenarios"] },
  { label: ["التوصيات الاستراتيجية", "Strategic recommendations"], simple: ["توصيات عامة", "General recommendations"], professional: ["توصيات وخطة تطوير", "Recommendations and growth plan"] },
  { label: ["الجدول الزمني للتنفيذ", "Delivery timeline"], simple: ["جدول مبدئي", "Initial timeline"], professional: ["جدول مرحلي ومؤشرات أداء", "Phased timeline and milestones"] },
];

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function ProjectFeasibilityDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";

  return (
    <main
      className="project-feasibility-dashboard"
      data-project-feasibility-route="/projects/feasibility"
      data-project-feasibility-source="USER_INPUT_REQUIRED"
      dir={ar ? "rtl" : "ltr"}
    >
      <ProjectsCommandHeader active="feasibility" locale={locale} userLabel={userLabel} />

      <section className="project-feasibility-dashboard__hero">
        <div className="project-feasibility-dashboard__hero-copy">
          <span>{ar ? "دراسات احترافية بمعايير عالمية" : "Professional studies to global standards"}</span>
          <h1>{ar ? "إعداد دراسات الجدوى" : "Feasibility studies"}</h1>
          <h2>{ar ? "حوّل فكرتك إلى مشروع ناجح بخطة واضحة وأرقام دقيقة" : "Turn your idea into a successful project with a clear plan and accurate numbers"}</h2>
          <p>{ar ? "دراسات جدوى متكاملة تساعدك على اتخاذ القرار الصحيح وجذب المستثمرين والحصول على التمويل وتحقيق أعلى فرص النجاح." : "Complete feasibility studies that support sound decisions, investor readiness, and sustainable success."}</p>
        </div>
        <div className="project-feasibility-dashboard__hero-scene" aria-hidden="true">
          <span><Icon name="pieChart" /></span>
          <i /><i /><i />
        </div>
        <div className="project-feasibility-dashboard__benefits">
          {benefits.map((benefit) => <span key={benefit.title[0]}><Icon name={benefit.icon} /><i><b>{pick(benefit.title, locale)}</b><small>{pick(benefit.note, locale)}</small></i></span>)}
        </div>
      </section>

      <section className="project-feasibility-dashboard__choices">
        <article className="is-simple">
          <div><span><Icon name="barChart" /></span><i><h2>{ar ? "دراسة مبسطة" : "Simplified study"}</h2><p>{ar ? "مناسبة لدراسة الفكرة بشكل سريع وتقييم أولي للمشروع" : "A rapid review and early project assessment"}</p></i></div>
          <ul><li><Icon name="activity" />{ar ? "المدة: 3–5 أيام" : "3–5 day delivery"}</li><li><Icon name="mail" />{ar ? "15–25 صفحة" : "15–25 pages"}</li><li><Icon name="wallet" />{ar ? "السعر يظهر من الباقة المعتمدة" : "Price comes from the approved plan"}</li></ul>
          <Link href="/projects/feasibility/simple/new">{ar ? "اطلب الدراسة المبسطة" : "Request simplified study"} <Icon name="arrow" /></Link>
        </article>
        <article className="is-professional">
          <div><span><Icon name="sparkles" /></span><i><h2>{ar ? "دراسة احترافية دقيقة ومفصلة" : "Professional detailed study"}</h2><p>{ar ? "دراسة شاملة تغطي الجوانب الفنية والمالية والتسويقية" : "A comprehensive technical, financial, and market study"}</p></i></div>
          <ul><li><Icon name="activity" />{ar ? "المدة: 10–15 يومًا" : "10–15 day delivery"}</li><li><Icon name="mail" />{ar ? "60–120 صفحة" : "60–120 pages"}</li><li><Icon name="wallet" />{ar ? "السعر يظهر من الباقة المعتمدة" : "Price comes from the approved plan"}</li></ul>
          <Link href="/projects/feasibility/pro/new">{ar ? "اطلب الدراسة الاحترافية" : "Request professional study"} <Icon name="arrow" /></Link>
        </article>
        <aside>
          <h2>{ar ? "نموذج من نتائج الدراسة الاحترافية" : "Professional output preview"}</h2>
          <div className="project-feasibility-dashboard__sample-metrics">
            {[ar ? "معدل الربحية" : "Profit margin", ar ? "فترة الاسترداد" : "Payback period", ar ? "القيمة الحالية الصافية" : "Net present value", ar ? "العائد على الاستثمار" : "Return on investment"].map((label) => <span key={label}><Icon name="trend" /><b>—</b><small>{label}</small></span>)}
          </div>
          <div className="project-feasibility-dashboard__sample-chart"><Icon name="barChart" /><strong>{ar ? "المخطط ينتظر مدخلات الدراسة" : "Chart awaiting study inputs"}</strong><small>{ar ? "لن تُعرض توقعات تجريبية باعتبارها نتائج." : "Sample forecasts are not presented as real results."}</small></div>
        </aside>
      </section>

      <section className="project-feasibility-dashboard__details">
        <article className="project-feasibility-dashboard__comparison">
          <header><h2>{ar ? "المحاور المشمولة في الدراسة" : "Included study areas"}</h2></header>
          <div className="is-head"><span>{ar ? "المحور" : "Area"}</span><span>{ar ? "الدراسة المبسطة" : "Simplified"}</span><span>{ar ? "الدراسة الاحترافية" : "Professional"}</span></div>
          {comparisonRows.map((row) => <div key={row.label[0]}><strong>{pick(row.label, locale)}</strong><span><Icon name="check" />{pick(row.simple, locale)}</span><span><Icon name="check" />{pick(row.professional, locale)}</span></div>)}
        </article>
        <article className="project-feasibility-dashboard__sections">
          <header><h2>{ar ? "أقسام الدراسة الاحترافية" : "Professional study sections"}</h2></header>
          <div>{professionalSections.map((section) => <span key={section.title[0]}><Icon name={section.icon} /><strong>{pick(section.title, locale)}</strong></span>)}</div>
        </article>
        <article className="project-feasibility-dashboard__outputs">
          <header><h2>{ar ? "نماذج من مخرجات الدراسة" : "Study deliverable examples"}</h2></header>
          <div>{[ar ? "تحليل السوق" : "Market analysis", ar ? "التحليل المالي" : "Financial analysis", ar ? "الدراسة الفنية" : "Technical study", ar ? "النموذج التشغيلي" : "Operating model", ar ? "التوصيات والخطة الزمنية" : "Recommendations and timeline"].map((label, index) => <span key={label}><Icon name={index % 2 ? "pieChart" : "barChart"} /><strong>{label}</strong><small>{ar ? "يُنشأ من بيانات الدراسة" : "Generated from study data"}</small></span>)}</div>
        </article>
      </section>

      <section className="project-feasibility-dashboard__footer-tools">
        <div><h2>{ar ? "أدوات وخدمات إضافية" : "Additional tools and services"}</h2><span><button disabled><Icon name="barChart" />{ar ? "طباعة التقرير" : "Print report"}</button><button disabled><Icon name="mail" />{ar ? "إرسال بالبريد" : "Email"}</button><button disabled><Icon name="people" />{ar ? "مشاركة" : "Share"}</button><button disabled><Icon name="pieChart" />{ar ? "تنزيل PDF" : "Download PDF"}</button></span></div>
        <div><h2>{ar ? "التسليم بصيغ متعددة" : "Multiple delivery formats"}</h2><span><i>PDF</i><i>DOCX</i><i>XLSX</i><i>PPTX</i></span><small>{ar ? "تتفعّل الصيغ المدعومة بعد اكتمال الدراسة." : "Supported formats activate after study completion."}</small></div>
        <Link href="/user/payments"><Icon name="wallet" /><span><strong>{ar ? "الدفع والفواتير من لوحة المستخدم" : "Payments and invoices in the user center"}</strong><small>{ar ? "إدارة آمنة وواضحة للمدفوعات" : "Secure, transparent payment management"}</small></span><Icon name="arrow" /></Link>
      </section>
    </main>
  );
}
