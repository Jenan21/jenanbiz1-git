"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

type Copy = readonly [string, string];
type CreatedProject = { id: string };

const evaluationMetrics: ReadonlyArray<{
  icon: IconName;
  title: Copy;
  tone: string;
}> = [
  { icon: "rocket", title: ["مؤشر الجاهزية", "Readiness"], tone: "cyan" },
  { icon: "barChart", title: ["جاذبية السوق", "Market attractiveness"], tone: "green" },
  { icon: "settings", title: ["القدرة التقنية", "Technical capacity"], tone: "teal" },
  { icon: "wallet", title: ["الجدوى المالية", "Financial viability"], tone: "blue" },
  { icon: "shield", title: ["مستوى المخاطر", "Risk level"], tone: "gold" },
  { icon: "people", title: ["قوة الفريق", "Team strength"], tone: "mint" },
  { icon: "trend", title: ["قابلية التوسع", "Scalability"], tone: "sky" },
];

function pick(value: Copy, locale: Locale) {
  return locale === "ar" ? value[0] : value[1];
}

export function ProjectEvaluationDashboard({
  locale,
  userLabel,
}: {
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [budget, setBudget] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > 10 * 1024 * 1024) {
      event.target.value = "";
      setFile(null);
      setMessage(ar ? "يجب ألا يتجاوز الملف 10 ميجابايت." : "The file must not exceed 10 MB.");
      return;
    }
    setFile(selected);
    setMessage("");
  }

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
          name: name.trim(),
          sector,
          countryCode: "SA",
          description: [
            `${ar ? "المدينة" : "City"}: ${city}`,
            `${ar ? "السوق المستهدف" : "Target market"}: ${targetMarket}`,
            `${ar ? "الميزانية التقديرية" : "Estimated budget"}: ${budget} SAR`,
          ].join("\n"),
          currency: "SAR",
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
              ? `تم إنشاء المشروع، لكن تعذر استيراد الملف: ${uploadPayload?.message ?? "خطأ غير معروف"}`
              : `The project was created, but importing the file failed: ${uploadPayload?.message ?? "Unknown error"}`,
          );
        }
      }

      router.push(`/projects/evaluation/progress?project=${payload.result.id}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر بدء التقييم."
            : "The evaluation could not be started.",
      );
      setBusy(false);
    }
  }

  return (
    <main
      className="project-evaluation-dashboard"
      data-project-evaluation-route="/projects/evaluation"
      data-project-evaluation-source="USER_INPUT_REQUIRED"
      dir={ar ? "rtl" : "ltr"}
    >
      <ProjectsCommandHeader active="evaluation" locale={locale} userLabel={userLabel} />

      <section className="project-evaluation-dashboard__hero">
        <div className="project-evaluation-dashboard__hero-copy">
          <span>{ar ? "من الفكرة إلى الواقع" : "From idea to informed decision"}</span>
          <h1>{ar ? "تقييم مشروع" : "Project evaluation"}</h1>
          <h2>{ar ? "قيّم جاهزية مشروعك وفرص نجاحه" : "Evaluate readiness and success potential"}</h2>
          <p>{ar ? "تحليل شامل ومتعمق لمشروعك باستخدام مؤشرات ذكية ومنهجيات عالمية لتقييم الجدوى والفرص والمخاطر ونقاط القوة لاتخاذ قرارات استثمارية أكثر دقة وثقة." : "A comprehensive evidence-based evaluation of feasibility, opportunity, risk, strengths, and investment readiness."}</p>
        </div>
        <div className="project-evaluation-dashboard__hero-scene" aria-hidden="true">
          <span><b>—</b><small>/100</small></span>
          <i /><i /><i />
        </div>
        <aside>
          <span><Icon name="barChart" /><i><b>{ar ? "مؤشر الجاهزية" : "Readiness indicator"}</b><small>{ar ? "قياس جاهزية المشروع للتنفيذ" : "Measures execution readiness"}</small></i></span>
          <span><Icon name="shield" /><i><b>{ar ? "تحليل المخاطر" : "Risk analysis"}</b><small>{ar ? "تحديد المخاطر ووضع الحلول" : "Identify risks and responses"}</small></i></span>
          <span><Icon name="trend" /><i><b>{ar ? "العائد المتوقع" : "Expected return"}</b><small>{ar ? "يتطلب بيانات مالية موثقة" : "Requires verified financial data"}</small></i></span>
          <span><Icon name="settings" /><i><b>{ar ? "قوة التشغيل" : "Operating strength"}</b><small>{ar ? "تقييم الخطة والفريق" : "Evaluate plan and team"}</small></i></span>
        </aside>
      </section>

      <form className="project-evaluation-dashboard__form" onSubmit={submit}>
        <header><h2>{ar ? "إدخال بيانات المشروع للتقييم" : "Enter project data for evaluation"}</h2></header>
        <div className="project-evaluation-dashboard__fields">
          <label><span>{ar ? "اسم المشروع *" : "Project name *"}</span><div><Icon name="sparkles" /><input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder={ar ? "أدخل اسم المشروع" : "Enter project name"}/></div></label>
          <label><span>{ar ? "القطاع *" : "Sector *"}</span><div><Icon name="grid" /><select required value={sector} onChange={(event) => setSector(event.target.value)}><option value="">{ar ? "اختر القطاع" : "Select sector"}</option><option value="Technology">{ar ? "التقنية والذكاء الاصطناعي" : "Technology and AI"}</option><option value="Food">{ar ? "الأغذية والمشروبات" : "Food and beverage"}</option><option value="Real Estate">{ar ? "العقار والبناء" : "Real estate and construction"}</option><option value="Energy">{ar ? "الطاقة" : "Energy"}</option><option value="Services">{ar ? "الخدمات" : "Services"}</option></select></div></label>
          <label><span>{ar ? "المدينة *" : "City *"}</span><div><Icon name="globe" /><select required value={city} onChange={(event) => setCity(event.target.value)}><option value="">{ar ? "اختر المدينة" : "Select city"}</option><option value="Riyadh">{ar ? "الرياض" : "Riyadh"}</option><option value="Jeddah">{ar ? "جدة" : "Jeddah"}</option><option value="Dammam">{ar ? "الدمام" : "Dammam"}</option><option value="Makkah">{ar ? "مكة المكرمة" : "Makkah"}</option></select></div></label>
          <label><span>{ar ? "السوق المستهدف *" : "Target market *"}</span><div><Icon name="people" /><select required value={targetMarket} onChange={(event) => setTargetMarket(event.target.value)}><option value="">{ar ? "اختر السوق" : "Select market"}</option><option value="Consumers">{ar ? "الأفراد والمستهلكون" : "Consumers"}</option><option value="Businesses">{ar ? "الشركات والمنشآت" : "Businesses"}</option><option value="Government">{ar ? "الجهات الحكومية" : "Government"}</option></select></div></label>
          <label><span>{ar ? "الميزانية التقديرية *" : "Estimated budget *"}</span><div><Icon name="wallet" /><input required min="1" inputMode="numeric" type="number" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={ar ? "مثال: 500000 ريال" : "Example: 500000 SAR"}/></div></label>
          <label className="project-evaluation-dashboard__import"><input type="file" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.txt" onChange={selectFile}/><Icon name="plus" /><strong>{file ? file.name : ar ? "استيراد بيانات" : "Import data"}</strong></label>
          <button type="submit" disabled={busy}><Icon name="sparkles" />{busy ? (ar ? "جارٍ إنشاء المشروع..." : "Creating project...") : (ar ? "ابدأ التقييم" : "Start evaluation")}</button>
        </div>
        {message ? <p role="alert">{message}</p> : null}
      </form>

      <section className="project-evaluation-dashboard__metrics">
        <article className="is-overall"><header><h2>{ar ? "النتيجة الإجمالية" : "Overall score"}</h2></header><div><span><b>—</b><small>/100</small></span></div><strong>{ar ? "بانتظار التقييم" : "Awaiting evaluation"}</strong></article>
        {evaluationMetrics.map((metric) => <article className={`tone-${metric.tone}`} key={metric.tone}><header><Icon name={metric.icon} /><h2>{pick(metric.title, locale)}</h2></header><b>—<small>/100</small></b><span><i /></span><strong>{ar ? "غير متاح" : "Unavailable"}</strong><small>{ar ? "يُحسب من الأدلة والمدخلات" : "Calculated from evidence and inputs"}</small></article>)}
      </section>

      <section className="project-evaluation-dashboard__lower">
        <article className="project-evaluation-dashboard__radar">
          <header><h2>{ar ? "توزيع نقاط التقييم" : "Evaluation score distribution"}</h2></header>
          <div><span><i /><i /><i /><i /><i /><i /></span><strong>{ar ? "الرادار ينتظر درجات التقييم" : "Radar awaiting evaluation scores"}</strong></div>
        </article>
        <article className="project-evaluation-dashboard__forecast">
          <header><h2>{ar ? "التوقعات المالية للمشروع" : "Project financial forecast"}</h2><span>{ar ? "بعد إدخال الخطة المالية" : "After financial inputs"}</span></header>
          <div><Icon name="barChart" /><strong>{ar ? "لا توجد توقعات مالية موثقة" : "No verified financial forecast"}</strong><small>{ar ? "استخدم مسار دراسة الجدوى لإدخال الافتراضات والحسابات." : "Use the feasibility flow to enter assumptions and calculations."}</small></div>
        </article>
        <article className="project-evaluation-dashboard__risk">
          <header><h2>{ar ? "تحليل المخاطر والعائد" : "Risk and return analysis"}</h2></header>
          <div><span><i /><i /><i /><i /></span><strong>{ar ? "بانتظار تقييم المخاطر" : "Awaiting risk assessment"}</strong></div>
        </article>
        <article className="project-evaluation-dashboard__recommendations">
          <header><h2>{ar ? "التوصيات الذكية" : "Smart recommendations"}</h2></header>
          <div><span className="is-positive"><Icon name="shield" /><i><b>{ar ? "نقاط القوة" : "Strengths"}</b><small>{ar ? "تظهر بعد اكتمال محاور التقييم." : "Appears after evaluation areas are complete."}</small></i></span><span className="is-warning"><Icon name="activity" /><i><b>{ar ? "نقاط التحسين" : "Improvement areas"}</b><small>{ar ? "لا تُستنتج دون أدلة مكتملة." : "Not inferred without complete evidence."}</small></i></span><span><Icon name="rocket" /><i><b>{ar ? "التوصية النهائية" : "Final recommendation"}</b><small>{ar ? "قرار بشري موثق بعد اكتمال التقييم." : "A documented human decision after completion."}</small></i></span></div>
        </article>
      </section>
    </main>
  );
}
