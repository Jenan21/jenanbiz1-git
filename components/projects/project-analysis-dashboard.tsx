"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type CreatedProject = { id: string };
type Copy = readonly [string, string];

const benefits: ReadonlyArray<{
  icon: IconName;
  note: Copy;
  title: Copy;
}> = [
  { icon: "barChart", title: ["تحليلات سوق عالمية", "Global market analysis"], note: ["بيانات موثقة وحديثة", "Verified, current data"] },
  { icon: "brain", title: ["رؤى دقيقة بالذكاء الاصطناعي", "AI-assisted insight"], note: ["دعم القرار مع مراجعة بشرية", "Decision support with human review"] },
  { icon: "grid", title: ["مقارنات القطاع والمنافسين", "Sector and competitor comparison"], note: ["فهم أعمق لفرص النجاح", "Deeper opportunity understanding"] },
  { icon: "rocket", title: ["توصيات عملية قابلة للتنفيذ", "Actionable recommendations"], note: ["من التحليل إلى القرار", "From analysis to decision"] },
];

const metricCards = [
  { icon: "barChart" as const, tone: "demand", title: ["حجم الطلب", "Demand"], note: ["يظهر بعد التحليل", "Appears after analysis"] },
  { icon: "people" as const, tone: "competition", title: ["المنافسة", "Competition"], note: ["تحتاج تحليل منافسين", "Requires competitor analysis"] },
  { icon: "wallet" as const, tone: "power", title: ["القوة الشرائية", "Purchasing power"], note: ["تحتاج بيانات سوق موثقة", "Requires verified market data"] },
  { icon: "shield" as const, tone: "risk", title: ["المخاطر", "Risk"], note: ["تُحسب من بيانات المشروع", "Calculated from project data"] },
] as const;

function text(value: readonly [string, string], locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function ProjectAnalysisDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [audience, setAudience] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: idea.trim().slice(0, 160),
          description: [
            idea.trim(),
            city ? `${ar ? "المدينة" : "City"}: ${city}` : "",
            audience ? `${ar ? "الفئة المستهدفة" : "Target audience"}: ${audience}` : "",
          ].filter(Boolean).join("\n"),
          sector,
          countryCode: "SA",
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        result?: CreatedProject;
        success?: boolean;
      } | null;
      if (!response.ok || !payload?.success || !payload.result) {
        throw new Error(payload?.message ?? (ar ? "تعذر إنشاء سجل المشروع." : "The project record could not be created."));
      }

      if (file) {
        const upload = new FormData();
        upload.set("projectId", payload.result.id);
        upload.set("file", file);
        const uploadResponse = await fetch("/api/files", {
          method: "POST",
          body: upload,
        });
        const uploadPayload = (await uploadResponse.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (!uploadResponse.ok) {
          throw new Error(
            ar
              ? `تم إنشاء المشروع، لكن تعذر رفع الملف: ${uploadPayload?.message ?? "خطأ غير معروف"}`
              : `The project was created, but the file upload failed: ${uploadPayload?.message ?? "Unknown error"}`,
          );
        }
      }

      router.push(`/projects/analysis/progress?project=${payload.result.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر بدء التحليل."
            : "The analysis could not be started.",
      );
      setBusy(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setMessage(ar ? "يجب ألا يتجاوز الملف 10 ميجابايت." : "The file must not exceed 10 MB.");
      event.target.value = "";
      return;
    }
    setMessage("");
    setFile(selected);
  }

  return (
    <main
      className="project-analysis-dashboard"
      data-project-analysis-route="/projects/analysis"
      data-project-analysis-source="USER_INPUT_REQUIRED"
      dir={ar ? "rtl" : "ltr"}
    >
      <ProjectsCommandHeader active="analysis" locale={locale} userLabel={userLabel} />

      <section className="project-analysis-dashboard__hero">
        <div className="project-analysis-dashboard__hero-copy">
          <span>{ar ? "حوّل فكرتك إلى فرصة حقيقية" : "Turn your idea into a real opportunity"}</span>
          <h1>{ar ? "تحليل مشروع" : "Project analysis"}</h1>
          <h2>{ar ? "حلّل أفكار المشاريع بذكاء قبل التنفيذ" : "Analyze project ideas intelligently before execution"}</h2>
          <p>{ar ? "احصل على تحليل شامل لفرص السوق والمنافسة والجدوى والمخاطر باستخدام بيانات مشروعك ومصادر موثقة." : "Get a complete view of market opportunity, competition, feasibility, and risk using your project data and verified sources."}</p>
        </div>
        <div className="project-analysis-dashboard__hero-scene" aria-hidden="true">
          <span><Icon name="globe" />{ar ? "فرص السوق" : "Market opportunity"}</span>
          <span><Icon name="trend" />{ar ? "تحليل المنافسة" : "Competition analysis"}</span>
          <span><Icon name="barChart" />{ar ? "اتجاهات النمو" : "Growth trends"}</span>
          <i /><i /><i />
        </div>
        <div className="project-analysis-dashboard__benefits">
          {benefits.map((benefit) => <span key={benefit.title[0]}><Icon name={benefit.icon} /><i><b>{text(benefit.title, locale)}</b><small>{text(benefit.note, locale)}</small></i></span>)}
        </div>
      </section>

      <form className="project-analysis-dashboard__form" onSubmit={submit}>
        <header><h2>{ar ? "أدخل فكرة مشروعك للتحليل" : "Enter your project idea for analysis"}</h2><span><Icon name="activity" />{ar ? "كلما كانت التفاصيل أدق كانت النتائج أكثر موثوقية" : "More detail produces more reliable results"}</span></header>
        <div className="project-analysis-dashboard__fields">
          <label className="is-idea"><span>{ar ? "فكرة المشروع *" : "Project idea *"}</span><div><Icon name="sparkles" /><input required minLength={2} maxLength={160} value={idea} onChange={(event) => setIdea(event.target.value)} placeholder={ar ? "مثال: منصة توصيل منتجات غذائية صحية..." : "Example: a healthy food delivery platform..."}/></div></label>
          <label><span>{ar ? "القطاع *" : "Sector *"}</span><div><Icon name="grid" /><select required value={sector} onChange={(event) => setSector(event.target.value)}><option value="">{ar ? "اختر القطاع" : "Select sector"}</option><option value="Technology">{ar ? "التقنية والذكاء الاصطناعي" : "Technology and AI"}</option><option value="Food">{ar ? "الأغذية والمشروبات" : "Food and beverage"}</option><option value="Real Estate">{ar ? "العقار والبناء" : "Real estate and construction"}</option><option value="Energy">{ar ? "الطاقة" : "Energy"}</option><option value="Services">{ar ? "الخدمات" : "Services"}</option></select></div></label>
          <label><span>{ar ? "المدينة *" : "City *"}</span><div><Icon name="globe" /><select required value={city} onChange={(event) => setCity(event.target.value)}><option value="">{ar ? "اختر المدينة" : "Select city"}</option><option value="Riyadh">{ar ? "الرياض" : "Riyadh"}</option><option value="Jeddah">{ar ? "جدة" : "Jeddah"}</option><option value="Dammam">{ar ? "الدمام" : "Dammam"}</option><option value="Makkah">{ar ? "مكة المكرمة" : "Makkah"}</option><option value="Madinah">{ar ? "المدينة المنورة" : "Madinah"}</option></select></div></label>
          <label><span>{ar ? "الفئة المستهدفة *" : "Target audience *"}</span><div><Icon name="people" /><select required value={audience} onChange={(event) => setAudience(event.target.value)}><option value="">{ar ? "اختر الفئة" : "Select audience"}</option><option value="Consumers">{ar ? "الأفراد والمستهلكون" : "Consumers"}</option><option value="Businesses">{ar ? "الشركات والمنشآت" : "Businesses"}</option><option value="Youth">{ar ? "الشباب والموظفون" : "Young people and employees"}</option><option value="Families">{ar ? "العائلات" : "Families"}</option></select></div></label>
          <label className="project-analysis-dashboard__upload"><input type="file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.txt" onChange={selectFile}/><Icon name="plus" /><strong>{file ? file.name : ar ? "رفع ملف" : "Upload file"}</strong><small>{ar ? "PDF، DOCX، XLSX، JPG، PNG، TXT — حتى 10 ميجابايت" : "PDF, DOCX, XLSX, JPG, PNG, TXT — up to 10 MB"}</small></label>
          <button className="project-analysis-dashboard__submit" disabled={busy} type="submit"><Icon name="sparkles" />{busy ? (ar ? "جارٍ إنشاء المشروع..." : "Creating project...") : (ar ? "ابدأ التحليل" : "Start analysis")}</button>
        </div>
        {message ? <p className="project-analysis-dashboard__message" role="alert">{message}</p> : null}
      </form>

      <section className="project-analysis-dashboard__metrics">
        <article className="is-index"><header><h2>{ar ? "مؤشر الفرصة" : "Opportunity index"}</h2></header><div className="project-analysis-dashboard__score"><span><b>—</b><small>{ar ? "بانتظار التحليل" : "Awaiting analysis"}</small></span></div><strong>{ar ? "أدخل بيانات المشروع لاحتساب المؤشر" : "Submit project data to calculate the index"}</strong></article>
        {metricCards.map((metric) => <article className={`tone-${metric.tone}`} key={metric.tone}><header><Icon name={metric.icon} /><h2>{text(metric.title, locale)}</h2></header><b>—</b><strong>{ar ? "غير متاح" : "Unavailable"}</strong><small>{text(metric.note, locale)}</small></article>)}
      </section>

      <section className="project-analysis-dashboard__lower">
        <article className="project-analysis-dashboard__trend"><header><h2>{ar ? "اتجاه الطلب في السوق" : "Market demand trend"}</h2><span>{ar ? "بعد اكتمال التحليل" : "After analysis"}</span></header><div><Icon name="trend" /><strong>{ar ? "لا توجد سلسلة زمنية موثقة" : "No verified time series yet"}</strong><small>{ar ? "ستظهر بيانات الطلب من مصادر التحليل المعتمدة." : "Demand data will appear from approved analysis sources."}</small></div></article>
        <article className="project-analysis-dashboard__map"><header><h2>{ar ? "توزيع الفرص الجغرافية" : "Geographic opportunity distribution"}</h2><span>{ar ? "المملكة العربية السعودية" : "Saudi Arabia"}</span></header><div><span><Icon name="globe" /><b>{ar ? "الخريطة بانتظار البيانات" : "Map awaiting data"}</b></span></div></article>
        <article className="project-analysis-dashboard__recommendations"><header><h2>{ar ? "أهم الرؤى والتوصيات" : "Key insights and recommendations"}</h2></header><div><span className="is-positive"><Icon name="check" /><i><b>{ar ? "نقاط القوة" : "Strengths"}</b><small>{ar ? "تظهر بعد تحليل المدخلات والمصادر." : "Appears after inputs and sources are analyzed."}</small></i></span><span className="is-warning"><Icon name="shield" /><i><b>{ar ? "التحديات" : "Challenges"}</b><small>{ar ? "لا تُفترض تحديات دون دليل." : "Challenges are not assumed without evidence."}</small></i></span><Link href="/projects/analysis/recommendations"><Icon name="rocket" /><i><b>{ar ? "التوصية الذكية" : "Smart recommendation"}</b><small>{ar ? "افتح صفحة التوصيات بعد تشغيل التحليل." : "Open recommendations after running the analysis."}</small></i></Link></div></article>
      </section>
    </main>
  );
}
