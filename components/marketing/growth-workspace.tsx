"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import type { Locale } from "@/types/i18n";

type Lead = { id: string; label: string; source: string | null; status: "NEW" | "QUALIFIED" | "CONTACTED" | "CONVERTED" | "LOST"; valueMinor: number | null };
type Campaign = { id: string; name: string; objective: string; channel: "CONTENT" | "EMAIL" | "SOCIAL" | "PAID_SEARCH" | "DIRECT"; customerType: "INDIVIDUAL" | "ORGANIZATION"; status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"; budgetMinor: number; currency: string; leads: Lead[]; payment: { id: string; status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" } | null; robotTask: { id: string; status: string; robot: { id: string; name: string } } | null };

const channelLabels = {
  CONTENT: ["المحتوى", "Content"],
  EMAIL: ["البريد", "Email"],
  SOCIAL: ["التواصل الاجتماعي", "Social"],
  PAID_SEARCH: ["البحث المدفوع", "Paid search"],
  DIRECT: ["مباشر", "Direct"],
} as const;

export function GrowthWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [channel, setChannel] = useState<Campaign["channel"]>("CONTENT");
  const [customerType, setCustomerType] = useState<Campaign["customerType"]>("INDIVIDUAL");
  const [budget, setBudget] = useState("0");
  const [leadCampaignId, setLeadCampaignId] = useState("");
  const [leadLabel, setLeadLabel] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadStatus, setLeadStatus] = useState<Lead["status"]>("NEW");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCampaigns() {
    setLoading(true);
    const response = await fetch("/api/marketing", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { campaigns?: Campaign[]; message?: string } | null;
    if (response.ok && payload?.campaigns) setCampaigns(payload.campaigns);
    else setMessage(payload?.message ?? (ar ? "تعذر تحميل بيانات النمو." : "Growth data could not be loaded."));
    setLoading(false);
  }

  const loadOnMount = useEffectEvent(() => { void loadCampaigns(); });

  useEffect(() => {
    const timeout = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setMessage("");
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createCampaign", name, objective, channel, customerType, budgetMinor: Math.round(Number(budget || 0) * 100), currency: "SAR" }) });
    const payload = await response.json().catch(() => null) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => [payload.result!, ...current]);
      setName(""); setObjective(""); setBudget("0");
      setMessage(ar ? "تم إنشاء الحملة كمسودة." : "Campaign created as a draft.");
    } else setMessage(payload?.message ?? (ar ? "تعذر إنشاء الحملة." : "Campaign could not be created."));
    setSubmitting(false);
  }

  async function updateCampaignStatus(campaignId: string, status: "PAUSED") {
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateCampaignStatus", campaignId, status }) });
    const payload = await response.json().catch(() => null) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? payload.result! : campaign));
    else setMessage(payload?.message ?? (ar ? "تعذر تحديث الحملة." : "Campaign could not be updated."));
  }

  async function confirmPaymentAndAssign(campaignId: string) {
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirmPaymentAndAssign", campaignId }) });
    const payload = await response.json().catch(() => null) as { result?: Campaign; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => current.map((campaign) => campaign.id === campaignId ? payload.result! : campaign));
      setMessage(ar ? "تم تأكيد الدفع وتكليف روبوت صائد جوائز بالحملة." : "Payment confirmed and a bounty robot has been assigned.");
    } else setMessage(payload?.message ?? (ar ? "تعذر تأكيد الدفع أو تكليف الروبوت." : "Payment confirmation or robot assignment failed."));
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadCampaignId) return;
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createLead", campaignId: leadCampaignId, label: leadLabel, source: leadSource || undefined, status: leadStatus }) });
    const payload = await response.json().catch(() => null) as { result?: Lead; message?: string } | null;
    if (response.ok && payload?.result) {
      setCampaigns((current) => current.map((campaign) => campaign.id === leadCampaignId ? { ...campaign, leads: [payload.result!, ...campaign.leads] } : campaign));
      setLeadLabel(""); setLeadSource("");
      setMessage(ar ? "تمت إضافة العميل المحتمل." : "Lead added.");
    } else setMessage(payload?.message ?? (ar ? "تعذر إضافة العميل المحتمل." : "Lead could not be added."));
  }

  const leads = campaigns.flatMap((campaign) => campaign.leads);
  const metrics = [
    [ar ? "الحملات النشطة" : "Active campaigns", campaigns.filter((campaign) => campaign.status === "ACTIVE").length],
    [ar ? "العملاء المحتملون" : "Leads", leads.length],
    [ar ? "العملاء المؤهلون" : "Qualified", leads.filter((lead) => lead.status === "QUALIFIED" || lead.status === "CONTACTED" || lead.status === "CONVERTED").length],
    [ar ? "التحويلات" : "Conversions", leads.filter((lead) => lead.status === "CONVERTED").length],
  ];

  return <section className="growth-workspace" aria-busy={loading}>
    <header className="growth-workspace__header"><div><span className="eyebrow eyebrow--small">JENAN GROWTH</span><h1>{ar ? "مركز النمو التجاري" : "Commercial growth center"}</h1><p>{ar ? "اختر هل الطلب لفرد أو منشأة، ثم أنشئ الحملة وأكّد الدفع ليُكلّف النظام روبوت صائد جوائز نشطاً." : "Choose whether the request is for an individual or organization, then confirm payment to assign an active bounty robot."}</p></div><button className="button button--secondary" onClick={() => void loadCampaigns()} type="button">{ar ? "تحديث" : "Refresh"}</button></header>
    <section className="growth-metrics" aria-label={ar ? "مؤشرات النمو" : "Growth metrics"}>{metrics.map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="growth-controls"><form className="growth-form" onSubmit={createCampaign}><h2>{ar ? "حملة جديدة" : "New campaign"}</h2><input required minLength={2} maxLength={160} placeholder={ar ? "اسم الحملة" : "Campaign name"} value={name} onChange={(event) => setName(event.target.value)} /><select aria-label={ar ? "الطلب باسم" : "Requesting as"} value={customerType} onChange={(event) => setCustomerType(event.target.value as Campaign["customerType"])}><option value="INDIVIDUAL">{ar ? "فرد" : "Individual"}</option><option value="ORGANIZATION">{ar ? "منشأة" : "Organization"}</option></select><select aria-label={ar ? "القناة" : "Channel"} value={channel} onChange={(event) => setChannel(event.target.value as Campaign["channel"])}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{ar ? label[0] : label[1]}</option>)}</select><input min="0" type="number" placeholder={ar ? "الميزانية بالريال" : "Budget in SAR"} value={budget} onChange={(event) => setBudget(event.target.value)} /><textarea required minLength={10} maxLength={1000} placeholder={ar ? "هدف الحملة" : "Campaign objective"} value={objective} onChange={(event) => setObjective(event.target.value)} /><button className="button button--primary" disabled={submitting} type="submit">{submitting ? (ar ? "جارٍ الحفظ..." : "Saving...") : (ar ? "إنشاء حملة" : "Create campaign")}</button></form>
      <form className="growth-form" onSubmit={createLead}><h2>{ar ? "عميل محتمل" : "New lead"}</h2><select aria-label={ar ? "الحملة" : "Campaign"} required value={leadCampaignId} onChange={(event) => setLeadCampaignId(event.target.value)}><option value="">{ar ? "اختر الحملة" : "Choose campaign"}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><input required minLength={2} maxLength={160} placeholder={ar ? "اسم أو وصف العميل" : "Lead label"} value={leadLabel} onChange={(event) => setLeadLabel(event.target.value)} /><input maxLength={160} placeholder={ar ? "مصدر العميل" : "Lead source"} value={leadSource} onChange={(event) => setLeadSource(event.target.value)} /><select aria-label={ar ? "حالة العميل" : "Lead status"} value={leadStatus} onChange={(event) => setLeadStatus(event.target.value as Lead["status"])}>{["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"].map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="button button--primary" disabled={!campaigns.length} type="submit">{ar ? "إضافة عميل" : "Add lead"}</button></form></section>
    {message ? <p className="growth-message" role="status">{message}</p> : null}
    <section className="growth-campaigns">{loading ? <p className="growth-message">{ar ? "جارٍ تحميل الحملات..." : "Loading campaigns..."}</p> : campaigns.map((campaign) => <article className="growth-campaign" key={campaign.id}><div className="growth-campaign__meta"><span>{ar ? channelLabels[campaign.channel][0] : channelLabels[campaign.channel][1]}</span><span>{campaign.status}</span></div><h2>{campaign.name}</h2><p>{campaign.objective}</p><small>{ar ? `الطلب باسم: ${campaign.customerType === "INDIVIDUAL" ? "فرد" : "منشأة"}` : `Requested as: ${campaign.customerType === "INDIVIDUAL" ? "Individual" : "Organization"}`}</small><dl><div><dt>{ar ? "الميزانية" : "Budget"}</dt><dd>{(campaign.budgetMinor / 100).toLocaleString()} {campaign.currency}</dd></div><div><dt>{ar ? "العملاء" : "Leads"}</dt><dd>{campaign.leads.length}</dd></div><div><dt>{ar ? "تحويلات" : "Conversions"}</dt><dd>{campaign.leads.filter((lead) => lead.status === "CONVERTED").length}</dd></div></dl>{campaign.robotTask ? <p className="growth-assignment">{ar ? `المكلّف: ${campaign.robotTask.robot.name} (${campaign.robotTask.status})` : `Assigned: ${campaign.robotTask.robot.name} (${campaign.robotTask.status})`}</p> : null}{!campaign.payment ? <button className="button button--secondary" onClick={() => void confirmPaymentAndAssign(campaign.id)} type="button">{ar ? "تأكيد الدفع وتكليف روبوت" : "Confirm payment and assign robot"}</button> : campaign.status === "ACTIVE" ? <button className="button button--ghost" onClick={() => void updateCampaignStatus(campaign.id, "PAUSED")} type="button">{ar ? "إيقاف الحملة" : "Pause campaign"}</button> : null}</article>)}{!loading && !campaigns.length ? <p className="growth-message">{ar ? "لا توجد حملات بعد. أنشئ حملتك الأولى." : "No campaigns yet. Create your first campaign."}</p> : null}</section>
  </section>;
}