"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Lead = {
  id: string;
  label: string;
  source: string | null;
  status: "NEW" | "QUALIFIED" | "CONTACTED" | "CONVERTED" | "LOST";
  valueMinor: number | null;
};
type PerformanceSnapshot = {
  conversionRate: number;
  converted: number;
  kpiProgress: number;
  leads: number;
  pipelineValueMinor: number;
  qualified: number;
  roi: number | null;
} | null;
type Campaign = {
  id: string;
  budgetMinor: number;
  callToAction: string | null;
  channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT";
  currency: string;
  customerType: "INDIVIDUAL" | "ORGANIZATION";
  kpiTarget: number | null;
  leads: Lead[];
  name: string;
  objective: string;
  payment: { id: string; status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" } | null;
  performanceSnapshot: PerformanceSnapshot;
  qualityScore: number;
  robotTask: { id: string; status: string; robot: { id: string; name: string } } | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
  targetAudience: string | null;
};

const channelLabels = {
  CONTENT: ["المحتوى", "Content"],
  DIRECT: ["مباشر", "Direct"],
  EMAIL: ["البريد", "Email"],
  PAID_SEARCH: ["البحث المدفوع", "Paid search"],
  SOCIAL: ["التواصل الاجتماعي", "Social"],
} as const;

function money(valueMinor: number, currency = "SAR") {
  return new Intl.NumberFormat("en", { currency, maximumFractionDigits: 0, style: "currency" }).format(valueMinor / 100);
}

export function GrowthWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [form, setForm] = useState({ budget: "0", callToAction: "", channel: "CONTENT" as Campaign["channel"], customerType: "INDIVIDUAL" as Campaign["customerType"], kpiTarget: "", name: "", objective: "", targetAudience: "" });
  const [lead, setLead] = useState({ campaignId: "", label: "", source: "", status: "NEW" as Lead["status"], value: "" });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCampaigns() {
    setLoading(true);
    const response = await fetch("/api/marketing", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { campaigns?: Campaign[]; message?: string } | null;
    if (response.ok && payload?.campaigns) setCampaigns(payload.campaigns);
    else setMessage(payload?.message ?? (ar ? "تعذر تحميل بيانات النمو." : "Growth data could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => {
    void loadCampaigns();
  });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/marketing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "createCampaign",
        budgetMinor: Math.round(Number(form.budget || 0) * 100),
        callToAction: form.callToAction || undefined,
        channel: form.channel,
        currency: "SAR",
        customerType: form.customerType,
        kpiTarget: form.kpiTarget ? Number(form.kpiTarget) : undefined,
        name: form.name,
        objective: form.objective,
        targetAudience: form.targetAudience || undefined,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => [payload.result!, ...current]);
      setForm({ budget: "0", callToAction: "", channel: "CONTENT", customerType: "INDIVIDUAL", kpiTarget: "", name: "", objective: "", targetAudience: "" });
      setMessage(ar ? "تم إنشاء الحملة مع درجة جودة أولية." : "Campaign created with an initial quality score.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إنشاء الحملة." : "Campaign could not be created."));
    }
    setSubmitting(false);
  }

  async function updateCampaignStatus(campaignId: string, status: "PAUSED") {
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateCampaignStatus", campaignId, status }) });
    const payload = (await response.json().catch(() => null)) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? payload.result! : campaign));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الحملة." : "Campaign could not be updated."));
  }

  async function confirmPaymentAndAssign(campaignId: string) {
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirmPaymentAndAssign", campaignId }) });
    const payload = (await response.json().catch(() => null)) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? payload.result! : campaign));
      setMessage(ar ? "تم تأكيد الدفع وتكليف روبوت صائد جوائز بالحملة." : "Payment confirmed and a bounty robot has been assigned.");
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر تأكيد الدفع أو تكليف الروبوت." : "Payment confirmation or robot assignment failed."));
    }
  }

  async function refreshPerformance(campaignId: string) {
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refreshPerformance", campaignId }) });
    const payload = (await response.json().catch(() => null)) as { result?: { campaign: Campaign }; message?: string } | null;
    if (response.ok && payload?.result?.campaign) setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? payload.result!.campaign : campaign));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الأداء." : "Performance could not be refreshed."));
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead.campaignId) return;
    const response = await fetch("/api/marketing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "createLead", campaignId: lead.campaignId, label: lead.label, source: lead.source || undefined, status: lead.status, valueMinor: lead.value ? Math.round(Number(lead.value) * 100) : undefined }),
    });
    const payload = (await response.json().catch(() => null)) as { result?: Lead; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => current.map((campaign) => campaign.id === lead.campaignId ? { ...campaign, leads: [payload.result!, ...campaign.leads] } : campaign));
      setLead({ campaignId: lead.campaignId, label: "", source: "", status: "NEW", value: "" });
      setMessage(ar ? "تمت إضافة العميل المحتمل وتحديث الأداء." : "Lead added and performance refreshed.");
      await refreshPerformance(lead.campaignId);
    } else {
      setMessage(payload?.message ?? (ar ? "تعذر إضافة العميل المحتمل." : "Lead could not be added."));
    }
  }

  const leads = campaigns.flatMap((campaign) => campaign.leads);
  const metrics = [
    [ar ? "الحملات النشطة" : "Active campaigns", campaigns.filter((campaign) => campaign.status === "ACTIVE").length],
    [ar ? "متوسط الجودة" : "Avg quality", campaigns.length ? Math.round(campaigns.reduce((sum, campaign) => sum + campaign.qualityScore, 0) / campaigns.length) : 0],
    [ar ? "العملاء المحتملون" : "Leads", leads.length],
    [ar ? "التحويلات" : "Conversions", leads.filter((item) => item.status === "CONVERTED").length],
  ];

  return <section className="growth-workspace" aria-busy={loading}>
    <header className="growth-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN GROWTH</span><h1>{ar ? "مركز النمو التجاري" : "Commercial growth center"}</h1><p>{ar ? "حملات موثقة بجودة، جمهور مستهدف، دعوة إجراء، أهداف KPI، وقياس أداء قابل للمراجعة." : "Quality-scored campaigns with audiences, calls to action, KPI targets, and auditable performance."}</p></div><button className="button button--secondary" onClick={() => void loadCampaigns()} type="button">{ar ? "تحديث" : "Refresh"}</button></header>
    <section className="growth-metrics" aria-label={ar ? "مؤشرات النمو" : "Growth metrics"}>{metrics.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="growth-controls"><form className="growth-form" onSubmit={createCampaign}><h2>{ar ? "حملة جديدة" : "New campaign"}</h2><input required minLength={2} maxLength={160} placeholder={ar ? "اسم الحملة" : "Campaign name"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><select aria-label={ar ? "الطلب باسم" : "Requesting as"} value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as Campaign["customerType"] })}><option value="INDIVIDUAL">{ar ? "فرد" : "Individual"}</option><option value="ORGANIZATION">{ar ? "منشأة" : "Organization"}</option></select><select aria-label={ar ? "القناة" : "Channel"} value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as Campaign["channel"] })}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{ar ? label[0] : label[1]}</option>)}</select><input min="0" type="number" placeholder={ar ? "الميزانية بالريال" : "Budget in SAR"} value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /><input min="1" type="number" placeholder={ar ? "هدف التحويلات" : "Conversion target"} value={form.kpiTarget} onChange={(event) => setForm({ ...form, kpiTarget: event.target.value })} /><input maxLength={500} placeholder={ar ? "الجمهور المستهدف" : "Target audience"} value={form.targetAudience} onChange={(event) => setForm({ ...form, targetAudience: event.target.value })} /><input maxLength={300} placeholder={ar ? "دعوة الإجراء" : "Call to action"} value={form.callToAction} onChange={(event) => setForm({ ...form, callToAction: event.target.value })} /><textarea required minLength={10} maxLength={1000} placeholder={ar ? "هدف الحملة" : "Campaign objective"} value={form.objective} onChange={(event) => setForm({ ...form, objective: event.target.value })} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جار الحفظ..." : "Saving...") : (ar ? "إنشاء حملة" : "Create campaign")}</button></form>
      <form className="growth-form" onSubmit={createLead}><h2>{ar ? "عميل محتمل" : "New lead"}</h2><select aria-label={ar ? "الحملة" : "Campaign"} required value={lead.campaignId} onChange={(event) => setLead({ ...lead, campaignId: event.target.value })}><option value="">{ar ? "اختر الحملة" : "Choose campaign"}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><input required minLength={2} maxLength={160} placeholder={ar ? "اسم أو وصف العميل" : "Lead label"} value={lead.label} onChange={(event) => setLead({ ...lead, label: event.target.value })} /><input maxLength={160} placeholder={ar ? "مصدر العميل" : "Lead source"} value={lead.source} onChange={(event) => setLead({ ...lead, source: event.target.value })} /><input min="0" type="number" placeholder={ar ? "قيمة متوقعة" : "Expected value"} value={lead.value} onChange={(event) => setLead({ ...lead, value: event.target.value })} /><select aria-label={ar ? "حالة العميل" : "Lead status"} value={lead.status} onChange={(event) => setLead({ ...lead, status: event.target.value as Lead["status"] })}>{["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"].map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="button button--primary" disabled={!campaigns.length} type="submit">{ar ? "إضافة عميل" : "Add lead"}</button></form></section>
    {message ? <p className="growth-message" role="status">{message}</p> : null}
    <section className="growth-campaigns">{loading ? <p className="growth-message">{ar ? "جار تحميل الحملات..." : "Loading campaigns..."}</p> : campaigns.map((campaign) => <article className="growth-campaign" key={campaign.id}><div className="growth-campaign__meta"><span>{ar ? channelLabels[campaign.channel][0] : channelLabels[campaign.channel][1]}</span><span>{campaign.status}</span><span>{ar ? "جودة" : "Quality"}: {campaign.qualityScore}/100</span></div><h2>{campaign.name}</h2><p>{campaign.objective}</p><small>{campaign.targetAudience ?? (ar ? "بدون جمهور محدد" : "No audience specified")}</small><small>{campaign.callToAction ?? (ar ? "بدون دعوة إجراء" : "No call to action")}</small><dl><div><dt>{ar ? "الميزانية" : "Budget"}</dt><dd>{money(campaign.budgetMinor, campaign.currency)}</dd></div><div><dt>{ar ? "العملاء" : "Leads"}</dt><dd>{campaign.performanceSnapshot?.leads ?? campaign.leads.length}</dd></div><div><dt>{ar ? "التحويل" : "Conversion"}</dt><dd>{campaign.performanceSnapshot?.conversionRate ?? 0}%</dd></div><div><dt>ROI</dt><dd>{campaign.performanceSnapshot?.roi ?? "-"}</dd></div></dl>{campaign.kpiTarget ? <p className="growth-assignment">{ar ? "تقدم KPI" : "KPI progress"}: {campaign.performanceSnapshot?.kpiProgress ?? 0}% / {campaign.kpiTarget}</p> : null}{campaign.robotTask ? <p className="growth-assignment">{ar ? `المكلف: ${campaign.robotTask.robot.name} (${campaign.robotTask.status})` : `Assigned: ${campaign.robotTask.robot.name} (${campaign.robotTask.status})`}</p> : null}{!campaign.payment ? <button className="button button--secondary" onClick={() => void confirmPaymentAndAssign(campaign.id)} type="button">{ar ? "تأكيد الدفع وتكليف روبوت" : "Confirm payment and assign robot"}</button> : campaign.status === "ACTIVE" ? <button className="button button--ghost" onClick={() => void updateCampaignStatus(campaign.id, "PAUSED")} type="button">{ar ? "إيقاف الحملة" : "Pause campaign"}</button> : null}<button className="button button--secondary" onClick={() => void refreshPerformance(campaign.id)} type="button">{ar ? "تحديث الأداء" : "Refresh performance"}</button></article>)}{!loading && !campaigns.length ? <p className="growth-message">{ar ? "لا توجد حملات بعد. أنشئ حملتك الأولى." : "No campaigns yet. Create your first campaign."}</p> : null}</section>
  </section>;
}