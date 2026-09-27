"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import type { MarketingCampaignRecord, MarketingPayload } from "@/components/marketing/marketing-flow-types";
import { Icon } from "@/components/ui/icons";
import { MARKETING_FLOW_ROUTES, type MarketingFlowRoute } from "@/lib/marketing/marketing-routes";
import type { Locale } from "@/types/i18n";

const channels = ["CONTENT", "EMAIL", "SOCIAL", "PAID_SEARCH", "DIRECT"] as const;
const routeDescriptions: Record<MarketingFlowRoute["id"], [string, string]> = {
  dashboard: ["خطط الحملات وسجّل العملاء وحلل النتائج المتاحة من مصادرها.", "Plan campaigns, record leads, and analyze available sourced outcomes."],
  campaigns: ["قائمة الحملات وحالتها وقناتها وميزانيتها ونتائجها المسجلة.", "Campaign status, channel, budget, and recorded outcomes."],
  "campaign-new": ["هدف وجمهور وقناة وميزانية ومحتوى ومدة في مسار واحد.", "Objective, audience, channel, budget, content, and duration in one flow."],
  "campaign-detail": ["تفاصيل الحملة والتكليف والميزانية ومؤشرات leads المسجلة.", "Campaign details, assignment, budget, and recorded-lead indicators."],
  audience: ["شرائح جمهور محفوظة دون أحجام تقديرية أو بيانات غير مصدرية.", "Saved audience segments without unsourced size estimates."],
  channels: ["تجميع الحملات والميزانيات والعملاء حسب القناة.", "Campaign, allocated-budget, and lead totals by channel."],
  leads: ["إدارة العملاء المحتملين ومراحلهم وقيمة pipeline المتوقعة.", "Manage lead stages and expected pipeline value."],
  analytics: ["تحويل وKPI وpipeline من السجلات الحالية، بلا reach أو clicks مختلقة.", "Conversion, KPI, and pipeline from current records, without fabricated reach or clicks."],
  report: ["تقرير حملة قابل للطباعة مع المصدر والحالات غير المتاحة.", "A printable campaign report with sources and unavailable states."],
};

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function optional(form: FormData, key: string) {
  return formValue(form, key) || undefined;
}

function minor(form: FormData, key: string) {
  return Math.round(Number(formValue(form, key) || 0) * 100);
}

function isoDate(form: FormData, key: string) {
  const value = formValue(form, key);
  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined;
}

function money(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value / 100);
}

function formatDate(value: string | null, locale: Locale) {
  return value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function Status({ value }: { value: string }) {
  return <span className={`marketing-flow__status marketing-flow__status--${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}

function Empty({ locale, message }: { locale: Locale; message?: string }) {
  return <div className="marketing-flow__empty"><Icon name="activity" /><p>{message ?? (locale === "ar" ? "لا توجد بيانات مسجلة." : "No recorded data is available.")}</p></div>;
}

export function MarketingFlowWorkspace({ campaignId, locale, route }: { campaignId?: string; locale: Locale; route: MarketingFlowRoute }) {
  const ar = locale === "ar";
  const [data, setData] = useState<MarketingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const response = await fetch("/api/marketing", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as MarketingPayload | null;
      if (!active) return;
      if (response.ok && payload) setData(payload);
      else setMessage(payload?.message ?? (ar ? "تعذر تحميل التسويق." : "Marketing could not be loaded."));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [ar, refreshVersion]);

  async function runCommand(command: Record<string, unknown>, success: [string, string]) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/marketing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (response.ok) {
      setMessage(pick(success, locale));
      setRefreshVersion((version) => version + 1);
      setBusy(false);
      return true;
    }
    setMessage(payload?.message ?? (ar ? "تعذر تنفيذ العملية." : "The action could not be completed."));
    setBusy(false);
    return false;
  }

  const campaigns = data?.campaigns ?? [];
  const selected = campaigns.find((campaign) => campaign.id === campaignId) ?? campaigns[0];
  const leads = campaigns.flatMap((campaign) => campaign.leads.map((lead) => ({ ...lead, campaignName: campaign.name, currency: campaign.currency })));
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE");
  const converted = leads.filter((lead) => lead.status === "CONVERTED");
  const pipelineValueMinor = leads.reduce((total, lead) => total + (lead.valueMinor ?? 0), 0);

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const scope = formValue(values, "scope");
    if (await runCommand({ action: "createCampaign", name: formValue(values, "name"), objective: formValue(values, "objective"), organizationId: scope.startsWith("ORG:") ? scope.slice(4) : undefined, channel: formValue(values, "channel"), customerType: scope.startsWith("ORG:") ? "ORGANIZATION" : "INDIVIDUAL", budgetMinor: minor(values, "budget"), callToAction: optional(values, "callToAction"), contentBrief: optional(values, "contentBrief"), startsAt: isoDate(values, "startsAt"), endsAt: isoDate(values, "endsAt"), kpiTarget: formValue(values, "kpiTarget") ? Number(formValue(values, "kpiTarget")) : undefined, targetAudience: optional(values, "targetAudience"), currency: "SAR" }, ["تم حفظ الحملة كمسودة واحتساب جودتها.", "Campaign saved as a quality-scored draft."])) form.reset();
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (await runCommand({ action: "createLead", campaignId: formValue(values, "campaignId"), label: formValue(values, "label"), source: optional(values, "source"), status: formValue(values, "status"), valueMinor: formValue(values, "value") ? minor(values, "value") : undefined }, ["تم تسجيل العميل وتحديث التحليلات.", "Lead recorded and analytics refreshed."])) form.reset();
  }

  async function submitAudience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    if (await runCommand({ action: "createAudience", campaignId: formValue(values, "campaignId"), name: formValue(values, "name"), location: optional(values, "location"), interests: optional(values, "interests"), notes: optional(values, "notes") }, ["تم حفظ شريحة الجمهور.", "Audience segment saved."])) form.reset();
  }

  if (loading || !data) return <section className="marketing-flow" data-marketing-provider="UNKNOWN" data-marketing-route={route.route} data-marketing-screen={route.id} data-marketing-source="LOADING"><header className="marketing-flow__hero"><div><span>MARKETING · {route.id.toUpperCase()}</span><h1>{pick(route.title, locale)}</h1><p>{pick(routeDescriptions[route.id], locale)}</p></div></header><div className="marketing-flow__loading"><span />{ar ? "جارٍ تحميل الحملات..." : "Loading campaigns..."}</div></section>;

  return <section className="marketing-flow" data-marketing-provider={data.readiness.externalChannelProviderConnected ? "CONNECTED" : "NOT_CONNECTED"} data-marketing-route={route.route} data-marketing-screen={route.id} data-marketing-source="RECORDED_LEADS">
    <nav className="marketing-flow__nav" aria-label={ar ? "مسارات التسويق" : "Marketing routes"}>{MARKETING_FLOW_ROUTES.map((definition, index) => <Link aria-current={definition.id === route.id ? "page" : undefined} className={definition.id === route.id ? "is-active" : ""} href={definition.route} key={definition.id}><span>{String(index + 1).padStart(2, "0")}</span>{pick(definition.title, locale)}</Link>)}</nav>
    <header className="marketing-flow__hero"><div><span>MARKETING · {route.id.toUpperCase().replaceAll("-", " ")}</span><h1>{pick(route.title, locale)}</h1><p>{pick(routeDescriptions[route.id], locale)}</p></div><div className="marketing-flow__source"><Icon name="shield" /><strong>{ar ? "بيانات مصدرية" : "Sourced data"}</strong><small>{ar ? "المقاييس الخارجية غير متاحة حتى ربط المزود" : "External metrics unavailable until provider connection"}</small></div></header>
    {message ? <p className="marketing-flow__message" role="status">{message}</p> : null}

    {route.id === "dashboard" ? <><section className="marketing-flow__signals"><article><span>01</span><strong>{activeCampaigns.length}</strong><small>{ar ? "حملات نشطة" : "Active campaigns"}</small></article><article><span>02</span><strong>{leads.length}</strong><small>{ar ? "عملاء مسجلون" : "Recorded leads"}</small></article><article><span>03</span><strong>{converted.length}</strong><small>{ar ? "تحويلات مسجلة" : "Recorded conversions"}</small></article><article><span>04</span><strong>{money(pipelineValueMinor, "SAR", locale)}</strong><small>{ar ? "قيمة pipeline متوقعة" : "Expected pipeline value"}</small></article></section><section className="marketing-flow__entry"><Link href="/marketing/campaign/new"><Icon name="plus" /><div><h2>{ar ? "إنشاء حملة" : "Create campaign"}</h2><p>{ar ? "حدد الهدف والجمهور والقناة والميزانية." : "Set the objective, audience, channel, and budget."}</p></div><Icon name="arrow" /></Link><Link href="/marketing/analytics"><Icon name="barChart" /><div><h2>{ar ? "تحليل النتائج" : "Analyze outcomes"}</h2><p>{ar ? "راجع funnel من العملاء المسجلين فقط." : "Review the funnel from recorded leads only."}</p></div><Icon name="arrow" /></Link></section></> : null}

    {route.id === "campaign-new" ? <form className="marketing-campaign-form" onSubmit={submitCampaign}><header><h2>{ar ? "إعداد الحملة" : "Campaign setup"}</h2><p>{ar ? "تُحفظ الحملة كمسودة؛ التفعيل يحتاج جودة وميزانية مسجلة وروبوتاً متاحاً." : "Campaigns start as drafts; activation requires quality, recorded budget, and an available robot."}</p></header><input name="name" minLength={2} required placeholder={ar ? "اسم الحملة" : "Campaign name"} /><select aria-label={ar ? "الجهة" : "Campaign owner"} name="scope"><option value="INDIVIDUAL">{ar ? "فرد" : "Individual"}</option>{data.organizations.filter((membership) => membership.isOwner).map((membership) => <option key={membership.organization.id} value={`ORG:${membership.organization.id}`}>{membership.organization.name}</option>)}</select><select aria-label={ar ? "القناة" : "Channel"} name="channel">{channels.map((channel) => <option key={channel} value={channel}>{channel.replace("_", " ")}</option>)}</select><input name="budget" min="0" required step="0.01" type="number" placeholder={ar ? "الميزانية المخصصة" : "Allocated budget"} /><input name="kpiTarget" min="1" type="number" placeholder={ar ? "هدف التحويل" : "Conversion target"} /><input name="targetAudience" placeholder={ar ? "الجمهور المستهدف" : "Target audience"} /><input name="callToAction" placeholder={ar ? "دعوة الإجراء" : "Call to action"} /><input aria-label={ar ? "تاريخ البدء" : "Start date"} name="startsAt" type="date" /><input aria-label={ar ? "تاريخ الانتهاء" : "End date"} name="endsAt" type="date" /><textarea name="objective" minLength={10} required placeholder={ar ? "هدف الحملة ونتيجتها المطلوبة" : "Campaign objective and desired outcome"} /><textarea name="contentBrief" placeholder={ar ? "موجز المحتوى والرسالة" : "Content and message brief"} /><button className="button button--primary" disabled={busy} type="submit">{ar ? "حفظ المسودة" : "Save draft"}</button></form> : null}

    {route.id === "campaigns" ? <><label className="marketing-flow__search"><Icon name="search" /><input aria-label={ar ? "بحث الحملات" : "Search campaigns"} onChange={(event) => setQuery(event.target.value)} placeholder={ar ? "بحث بالاسم أو الهدف أو القناة" : "Search name, objective, or channel"} value={query} /></label><section className="marketing-campaign-list">{campaigns.filter((campaign) => !query || `${campaign.name} ${campaign.objective} ${campaign.channel}`.toLowerCase().includes(query.toLowerCase())).map((campaign) => <CampaignCard campaign={campaign} key={campaign.id} locale={locale} />)}</section>{!campaigns.length ? <Empty locale={locale} /> : null}</> : null}

    {route.id === "campaign-detail" ? selected ? <CampaignDetail campaign={selected} data={data} locale={locale} busy={busy} runCommand={runCommand} /> : <Empty locale={locale} /> : null}

    {route.id === "audience" ? <><form className="marketing-audience-form" onSubmit={submitAudience}><header><h2>{ar ? "شريحة جمهور" : "Audience segment"}</h2><p>{ar ? "لا نعرض حجماً تقديرياً دون مصدر خارجي." : "No audience-size estimate is shown without an external source."}</p></header><select aria-label={ar ? "الحملة" : "Campaign"} name="campaignId" required><option value="">{ar ? "اختر حملة" : "Choose campaign"}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><input name="name" minLength={2} required placeholder={ar ? "اسم الشريحة" : "Segment name"} /><input name="location" placeholder={ar ? "الموقع" : "Location"} /><input name="interests" placeholder={ar ? "الاهتمامات" : "Interests"} /><textarea name="notes" placeholder={ar ? "ملاحظات الجمهور" : "Audience notes"} /><button className="button button--primary" disabled={busy || !campaigns.length} type="submit">{ar ? "حفظ الشريحة" : "Save segment"}</button></form><section className="marketing-audience-grid">{campaigns.flatMap((campaign) => campaign.audienceSegments.map((segment) => <article key={segment.id}><span>{campaign.name}</span><h2>{segment.name}</h2><p>{segment.location ?? (ar ? "الموقع غير محدد" : "Location unavailable")}</p><div>{segment.interests?.map((interest) => <small key={interest}>{interest}</small>)}</div><strong>{ar ? "حجم الجمهور: غير متاح" : "Audience size: unavailable"}</strong></article>))}</section>{!campaigns.some((campaign) => campaign.audienceSegments.length) ? <Empty locale={locale} /> : null}</> : null}

    {route.id === "channels" ? <section className="marketing-channel-grid">{channels.map((channel) => { const channelCampaigns = campaigns.filter((campaign) => campaign.channel === channel); const channelLeads = channelCampaigns.flatMap((campaign) => campaign.leads); return <article key={channel}><header><span>{channel.replace("_", " ")}</span><Status value={data.readiness.externalChannelProviderConnected ? "CONNECTED" : "NOT CONNECTED"} /></header><dl><div><dt>{ar ? "الحملات" : "Campaigns"}</dt><dd>{channelCampaigns.length}</dd></div><div><dt>{ar ? "ميزانية مخصصة" : "Allocated budget"}</dt><dd>{money(channelCampaigns.reduce((total, campaign) => total + campaign.budgetMinor, 0), "SAR", locale)}</dd></div><div><dt>{ar ? "leads مسجلة" : "Recorded leads"}</dt><dd>{channelLeads.length}</dd></div><div><dt>{ar ? "تحويلات مسجلة" : "Recorded conversions"}</dt><dd>{channelLeads.filter((lead) => lead.status === "CONVERTED").length}</dd></div><div><dt>Reach / clicks</dt><dd>{ar ? "غير متاح" : "Unavailable"}</dd></div></dl></article>; })}</section> : null}

    {route.id === "leads" ? <><form className="marketing-lead-form" onSubmit={submitLead}><select aria-label={ar ? "الحملة" : "Campaign"} name="campaignId" required><option value="">{ar ? "اختر حملة" : "Choose campaign"}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><input name="label" minLength={2} required placeholder={ar ? "اسم أو وصف العميل" : "Lead label"} /><input name="source" placeholder={ar ? "المصدر" : "Source"} /><input name="value" min="0" step="0.01" type="number" placeholder={ar ? "قيمة pipeline المتوقعة" : "Expected pipeline value"} /><select aria-label={ar ? "الحالة" : "Lead status"} name="status">{["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"].map((status) => <option key={status} value={status}>{status}</option>)}</select><button className="button button--primary" disabled={busy || !campaigns.length} type="submit">{ar ? "إضافة lead" : "Add lead"}</button></form><section className="marketing-lead-table"><div className="marketing-table-wrap"><table><thead><tr><th>{ar ? "العميل" : "Lead"}</th><th>{ar ? "الحملة" : "Campaign"}</th><th>{ar ? "المصدر" : "Source"}</th><th>{ar ? "القيمة" : "Value"}</th><th>{ar ? "الحالة" : "Status"}</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><strong>{lead.label}</strong><small>{lead.notes}</small></td><td>{lead.campaignName}</td><td>{lead.source ?? "—"}</td><td>{lead.valueMinor === null ? "—" : money(lead.valueMinor, lead.currency, locale)}</td><td><select aria-label={`${ar ? "حالة" : "Status"} ${lead.label}`} disabled={busy} onChange={(event) => void runCommand({ action: "updateLead", leadId: lead.id, status: event.target.value }, ["تم تحديث lead والتحليلات.", "Lead and analytics updated."])} value={lead.status}>{["NEW", "QUALIFIED", "CONTACTED", "CONVERTED", "LOST"].map((status) => <option key={status} value={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>{!leads.length ? <Empty locale={locale} /> : null}</section></> : null}

    {route.id === "analytics" ? <MarketingAnalytics campaigns={campaigns} locale={locale} /> : null}
    {route.id === "report" ? selected ? <MarketingReport campaign={selected} locale={locale} /> : <Empty locale={locale} /> : null}
  </section>;
}

function CampaignCard({ campaign, locale }: { campaign: MarketingCampaignRecord; locale: Locale }) {
  const ar = locale === "ar";
  return <article><header><Status value={campaign.status} /><span>{campaign.qualityScore}/100</span></header><h2>{campaign.name}</h2><p>{campaign.objective}</p><dl><div><dt>{ar ? "القناة" : "Channel"}</dt><dd>{campaign.channel.replace("_", " ")}</dd></div><div><dt>{ar ? "الميزانية" : "Budget"}</dt><dd>{money(campaign.budgetMinor, campaign.currency, locale)}</dd></div><div><dt>{ar ? "leads" : "Leads"}</dt><dd>{campaign.leads.length}</dd></div></dl><Link href={`/marketing/campaign/sample?campaign=${campaign.id}`}>{ar ? "عرض الحملة" : "View campaign"}<Icon name="arrow" /></Link></article>;
}

function CampaignDetail({ busy, campaign, data, locale, runCommand }: { busy: boolean; campaign: MarketingCampaignRecord; data: MarketingPayload; locale: Locale; runCommand: (command: Record<string, unknown>, success: [string, string]) => Promise<boolean> }) {
  const ar = locale === "ar";
  const performance = campaign.performanceSnapshot;
  const canConfirm = !campaign.payment && Boolean(data.readiness.availableRobot);
  return <article className="marketing-campaign-detail"><header><div><Status value={campaign.status} /><span>{ar ? "جودة" : "Quality"} {campaign.qualityScore}/100</span></div><h2>{campaign.name}</h2><p>{campaign.objective}</p></header><section className="marketing-flow__signals"><article><span>01</span><strong>{money(campaign.budgetMinor, campaign.currency, locale)}</strong><small>{ar ? "ميزانية مخصصة" : "Allocated budget"}</small></article><article><span>02</span><strong>{performance?.leads ?? campaign.leads.length}</strong><small>{ar ? "leads مسجلة" : "Recorded leads"}</small></article><article><span>03</span><strong>{performance?.conversionRate ?? 0}%</strong><small>{ar ? "تحويل مسجل" : "Recorded conversion"}</small></article><article><span>04</span><strong>{performance?.pipelineReturnRatio ?? "—"}</strong><small>{ar ? "نسبة pipeline إلى الميزانية" : "Pipeline-to-budget ratio"}</small></article></section><div className="marketing-campaign-detail__grid"><section><h3>{ar ? "الخطة" : "Plan"}</h3><dl><div><dt>{ar ? "الجمهور" : "Audience"}</dt><dd>{campaign.targetAudience ?? "—"}</dd></div><div><dt>{ar ? "الدعوة" : "CTA"}</dt><dd>{campaign.callToAction ?? "—"}</dd></div><div><dt>{ar ? "المحتوى" : "Content brief"}</dt><dd>{campaign.contentBrief ?? "—"}</dd></div><div><dt>{ar ? "المدة" : "Duration"}</dt><dd>{formatDate(campaign.startsAt, locale)} – {formatDate(campaign.endsAt, locale)}</dd></div></dl></section><section><h3>{ar ? "التنفيذ" : "Execution"}</h3><p>{campaign.payment ? `${ar ? "تأكيد داخلي" : "Internal confirmation"}: ${campaign.payment.provider ?? "—"}` : (ar ? "الميزانية غير مؤكدة" : "Budget not confirmed")}</p><p>{campaign.robotTask ? `${campaign.robotTask.robot.name} · ${campaign.robotTask.status}` : (ar ? "لا يوجد منفّذ معين" : "No executor assigned")}</p><p>{ar ? "مزود القناة الخارجي: غير متصل" : "External channel provider: not connected"}</p></section></div><footer><Link className="button button--ghost" href={`/marketing/report/sample?campaign=${campaign.id}`}>{ar ? "فتح التقرير" : "Open report"}</Link>{!campaign.payment ? <button className="button button--primary" disabled={busy || !canConfirm} title={!data.readiness.availableRobot ? (ar ? "لا يوجد روبوت نشط متاح" : "No active robot is available") : undefined} onClick={() => void runCommand({ action: "confirmPaymentAndAssign", campaignId: campaign.id }, ["تم تسجيل تأكيد الميزانية الداخلي وتعيين منفذ.", "Internal budget confirmation recorded and executor assigned."])} type="button">{ar ? "تأكيد داخلي وتعيين" : "Internal confirm and assign"}</button> : campaign.status === "ACTIVE" ? <button className="button button--ghost" disabled={busy} onClick={() => void runCommand({ action: "updateCampaignStatus", campaignId: campaign.id, status: "PAUSED" }, ["تم إيقاف الحملة.", "Campaign paused."])} type="button">{ar ? "إيقاف" : "Pause"}</button> : campaign.status === "PAUSED" ? <button className="button button--primary" disabled={busy} onClick={() => void runCommand({ action: "updateCampaignStatus", campaignId: campaign.id, status: "ACTIVE" }, ["تم استئناف الحملة.", "Campaign resumed."])} type="button">{ar ? "استئناف" : "Resume"}</button> : null}</footer></article>;
}

function MarketingAnalytics({ campaigns, locale }: { campaigns: MarketingCampaignRecord[]; locale: Locale }) {
  const ar = locale === "ar"; const leads = campaigns.flatMap((campaign) => campaign.leads); const qualified = leads.filter((lead) => ["QUALIFIED", "CONTACTED", "CONVERTED"].includes(lead.status)); const converted = leads.filter((lead) => lead.status === "CONVERTED"); const budget = campaigns.reduce((total, campaign) => total + campaign.budgetMinor, 0); const pipeline = leads.reduce((total, lead) => total + (lead.valueMinor ?? 0), 0);
  return <section className="marketing-analytics"><section className="marketing-flow__signals"><article><span>01</span><strong>{leads.length}</strong><small>{ar ? "leads مسجلة" : "Recorded leads"}</small></article><article><span>02</span><strong>{qualified.length}</strong><small>{ar ? "مؤهلة/متابعة" : "Qualified/contacted"}</small></article><article><span>03</span><strong>{converted.length}</strong><small>{ar ? "تحويلات مسجلة" : "Recorded conversions"}</small></article><article><span>04</span><strong>{leads.length ? Math.round(converted.length / leads.length * 100) : 0}%</strong><small>{ar ? "معدل التحويل" : "Conversion rate"}</small></article></section><div className="marketing-funnel">{[[ar ? "كل leads" : "All leads", leads.length], [ar ? "مؤهلة" : "Qualified", qualified.length], [ar ? "تحويل" : "Converted", converted.length]].map(([label, count], index) => <article key={String(label)} style={{ "--funnel-width": `${Math.max(24, leads.length ? Number(count) / leads.length * 100 : 24)}%` } as React.CSSProperties}><span>{index + 1}</span><strong>{label}</strong><b>{count}</b></article>)}</div><section className="marketing-source-grid"><article><h3>{ar ? "الميزانية المخصصة" : "Allocated budget"}</h3><strong>{money(budget, "SAR", locale)}</strong><small>{ar ? "ليست إنفاق مزود خارجي" : "Not external-provider spend"}</small></article><article><h3>{ar ? "قيمة pipeline" : "Pipeline value"}</h3><strong>{money(pipeline, "SAR", locale)}</strong><small>{ar ? "قيمة متوقعة مسجلة يدوياً" : "Manually recorded expected value"}</small></article><article><h3>Reach / clicks / CAC</h3><strong>{ar ? "غير متاح" : "Unavailable"}</strong><small>{ar ? "يتطلب مزود قناة خارجي" : "Requires an external channel provider"}</small></article></section></section>;
}

function MarketingReport({ campaign, locale }: { campaign: MarketingCampaignRecord; locale: Locale }) {
  const ar = locale === "ar"; const performance = campaign.performanceSnapshot;
  return <section className="marketing-report studio-print-area"><header><div><span>JENAN PRO · CAMPAIGN REPORT</span><h2>{campaign.name}</h2><p>{formatDate(campaign.updatedAt, locale)} · {campaign.channel.replace("_", " ")}</p></div><button className="button button--primary" onClick={() => window.print()} type="button">{ar ? "طباعة / PDF" : "Print / PDF"}</button></header><section className="marketing-flow__signals"><article><span>01</span><strong>{money(campaign.budgetMinor, campaign.currency, locale)}</strong><small>{ar ? "ميزانية مخصصة" : "Allocated budget"}</small></article><article><span>02</span><strong>{performance?.leads ?? 0}</strong><small>{ar ? "leads" : "Leads"}</small></article><article><span>03</span><strong>{performance?.converted ?? 0}</strong><small>{ar ? "تحويلات" : "Conversions"}</small></article><article><span>04</span><strong>{performance?.kpiProgress ?? 0}%</strong><small>{ar ? "تقدم KPI" : "KPI progress"}</small></article></section><div className="marketing-report__grid"><section><h3>{ar ? "الملخص" : "Summary"}</h3><p>{campaign.objective}</p><p>{campaign.contentBrief ?? (ar ? "لا يوجد موجز محتوى." : "No content brief recorded.")}</p></section><section><h3>{ar ? "الجمهور" : "Audience"}</h3><p>{campaign.targetAudience ?? "—"}</p><ul>{campaign.audienceSegments.map((segment) => <li key={segment.id}>{segment.name} · {segment.location ?? "—"}</li>)}</ul></section><section><h3>{ar ? "النتائج المصدرية" : "Sourced outcomes"}</h3><p>{ar ? "المصدر: العملاء المحتملون المسجلون داخل المنصة." : "Source: leads recorded in the platform."}</p><p>{ar ? "قيمة pipeline" : "Pipeline value"}: {money(performance?.pipelineValueMinor ?? 0, campaign.currency, locale)}</p><p>{ar ? "نسبة pipeline إلى الميزانية" : "Pipeline-to-budget ratio"}: {performance?.pipelineReturnRatio ?? "—"}</p></section><section><h3>{ar ? "غير متاح" : "Unavailable"}</h3><p>Reach · Clicks · Impressions · CAC · ROAS</p><p>{ar ? "لا يوجد مزود قناة خارجي متصل بهذه الحملة." : "No external channel provider is connected to this campaign."}</p></section></div><footer>{ar ? "لا يمكن المشاركة أو الإرسال بالبريد من هذه النسخة؛ الطباعة/PDF فقط مدعومة." : "Sharing and email delivery are unavailable in this version; only print/PDF is supported."}</footer></section>;
}