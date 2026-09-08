"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Assessment = { id: string; countryCode: "SA" | "US"; organizationType: "INDIVIDUAL" | "ORGANIZATION"; growthStage: "IDEA" | "EARLY" | "OPERATING" | "GROWING"; requestedAmountMinor: number; monthlyRevenueMinor: number; yearsOperating: number; score: number; createdAt: string };

export function FundingWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [countryCode, setCountryCode] = useState<Assessment["countryCode"]>("SA");
  const [organizationType, setOrganizationType] = useState<Assessment["organizationType"]>("INDIVIDUAL");
  const [growthStage, setGrowthStage] = useState<Assessment["growthStage"]>("IDEA");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [monthlyRevenue, setMonthlyRevenue] = useState("");
  const [yearsOperating, setYearsOperating] = useState("0");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/funding", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { assessments?: Assessment[]; message?: string } | null;
    if (response.ok && payload?.assessments) setAssessments(payload.assessments);
    else setMessage(payload?.message ?? (ar ? "تعذر تحميل سجل التقييمات." : "Assessment history could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => { void load(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = Number(requestedAmount);
    const revenue = Number(monthlyRevenue || "0");
    const years = Number(yearsOperating);
    if (!Number.isFinite(requested) || requested <= 0 || !Number.isFinite(revenue) || revenue < 0 || !Number.isInteger(years) || years < 0) {
      setMessage(ar ? "تحقق من مبالغك وعدد سنوات التشغيل." : "Check the amounts and years operating.");
      return;
    }
    setSubmitting(true); setMessage("");
    const response = await fetch("/api/funding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ countryCode, organizationType, growthStage, requestedAmountMinor: Math.round(requested * 100), monthlyRevenueMinor: Math.round(revenue * 100), yearsOperating: years }) });
    const payload = await response.json().catch(() => null) as { assessment?: Assessment; message?: string } | null;
    if (response.ok && payload?.assessment) { setAssessments((current) => [payload.assessment!, ...current]); setMessage(ar ? "تم حفظ التقييم الذاتي." : "Your self-assessment was saved."); }
    else setMessage(payload?.message ?? (ar ? "تعذر إكمال التقييم." : "Assessment could not be completed."));
    setSubmitting(false);
  }

  const latest = assessments[0];
  const currency = countryCode === "SA" ? "SAR" : "USD";
  const formatAmount = (minor: number, assessmentCurrency = currency) => new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { style: "currency", currency: assessmentCurrency }).format(minor / 100);
  return <section className="funding-workspace" aria-busy={loading}>
    <header className="funding-workspace__header"><div><span className="eyebrow eyebrow--small">FUNDING / READINESS</span><h1>{ar ? "تقييم جاهزية التمويل" : "Funding readiness assessment"}</h1><p>{ar ? "تقييم ذاتي شفاف يعتمد على البيانات التي تدخلها. لا يمثل موافقة تمويل ولا يقدم طلبًا لجهة خارجية." : "A transparent self-assessment based on the data you provide. It is not a financing approval or an application to an external provider."}</p></div><button className="button button--secondary" onClick={() => void load()} type="button">{ar ? "تحديث السجل" : "Refresh history"}</button></header>
    <form className="funding-form" onSubmit={submit}><select aria-label={ar ? "الدولة" : "Country"} value={countryCode} onChange={(event) => setCountryCode(event.target.value as Assessment["countryCode"])}><option value="SA">{ar ? "السعودية" : "Saudi Arabia"}</option><option value="US">{ar ? "الولايات المتحدة" : "United States"}</option></select><select aria-label={ar ? "نوع طالب التمويل" : "Applicant type"} value={organizationType} onChange={(event) => setOrganizationType(event.target.value as Assessment["organizationType"])}><option value="INDIVIDUAL">{ar ? "فرد" : "Individual"}</option><option value="ORGANIZATION">{ar ? "منشأة" : "Organization"}</option></select><select aria-label={ar ? "مرحلة النمو" : "Growth stage"} value={growthStage} onChange={(event) => setGrowthStage(event.target.value as Assessment["growthStage"])}><option value="IDEA">{ar ? "فكرة" : "Idea"}</option><option value="EARLY">{ar ? "بداية" : "Early"}</option><option value="OPERATING">{ar ? "تشغيل" : "Operating"}</option><option value="GROWING">{ar ? "نمو" : "Growing"}</option></select><input required inputMode="decimal" placeholder={ar ? `التمويل المطلوب (${currency})` : `Funding requested (${currency})`} value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} /><input inputMode="decimal" placeholder={ar ? `متوسط الإيراد الشهري (${currency})` : `Average monthly revenue (${currency})`} value={monthlyRevenue} onChange={(event) => setMonthlyRevenue(event.target.value)} /><input required type="number" min="0" max="100" placeholder={ar ? "سنوات التشغيل" : "Years operating"} value={yearsOperating} onChange={(event) => setYearsOperating(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ التقييم..." : "Assessing...") : (ar ? "إكمال التقييم" : "Complete assessment")}</button></form>
    {message ? <p className="funding-message" role="status">{message}</p> : null}
    <div className="funding-summary"><article><span>{ar ? "آخر درجة" : "Latest score"}</span><strong>{latest ? `${latest.score}/100` : "-"}</strong></article><article><span>{ar ? "إجمالي التقييمات" : "Assessments"}</span><strong>{assessments.length}</strong></article><article><span>{ar ? "منهجية الدرجة" : "Scoring method"}</span><strong>{ar ? "إيراد + مدة + طلب + مرحلة" : "Revenue + age + request + stage"}</strong></article></div>
    <section className="funding-history"><h2>{ar ? "سجل التقييمات" : "Assessment history"}</h2>{assessments.map((assessment) => <article key={assessment.id}><div><strong>{assessment.score}/100</strong><span>{assessment.countryCode} · {assessment.growthStage}</span></div><div><span>{ar ? "المطلوب" : "Requested"}</span><strong>{formatAmount(assessment.requestedAmountMinor, assessment.countryCode === "SA" ? "SAR" : "USD")}</strong></div><div><span>{new Intl.DateTimeFormat(ar ? "ar-SA" : "en-US", { dateStyle: "medium" }).format(new Date(assessment.createdAt))}</span></div></article>)}{!loading && !assessments.length ? <p className="funding-message">{ar ? "لا توجد تقييمات محفوظة بعد." : "No saved assessments yet."}</p> : null}</section>
  </section>;
}