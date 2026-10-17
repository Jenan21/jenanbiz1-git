"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlowModal } from "@/components/projects/project-flow-kit";
import { Icon, type IconName } from "@/components/ui/icons";
import { AnalysisRequestError, reportSaveMessage } from "@/lib/projects/analysis-errors";
import { clampText, fitItems, linesFor } from "@/lib/projects/analysis-report-fit";
import { venuesText, type IndicatorId, type ReportFact, type ReportIndicator, type ReportModel, type ReportPending } from "@/lib/projects/analysis-report";

const ProjectLocationPicker = dynamic(
  () => import("@/components/projects/project-location-picker").then((module) => module.ProjectLocationPicker),
  { ssr: false, loading: () => <div className="rp-map__loading" /> },
);

export type ReportActions = {
  /** Where this report's PDF is served; `disposition=inline` is added when it is printed. */
  pdfHref: string;
  /** The path «مشاركة» hands out; it opens for people who can already see the report. */
  sharePath: string;
  /** On a live report: the project whose copy «حفظ في بياناتي» stores. */
  saveProjectId?: string;
  /** On a stored copy: when it was saved. */
  savedAtLabel?: string;
  newHref?: string;
};

type Detail = "recommendations" | "standout" | "risks" | "facts" | "sources";
type Toast = { kind: "info" | "error" | "saved"; text: string; id?: string };

const FACT_ICONS: Record<ReportFact["id"], IconName> = {
  idea: "lightbulb",
  location: "mapPin",
  capital: "wallet",
  audience: "people",
  sector: "grid",
  area: "cube",
};

/** The six indicator slots of the approved design, in reading order; the last three wait for engines that do not exist yet. */
const SLOT_ICONS: Record<IndicatorId | ReportPending["id"], IconName> = {
  population: "people",
  competitors: "store",
  purchasing: "wallet",
  inflation: "trend",
  evidence: "shield",
  risk: "warning",
  traffic: "car",
  demand: "trend",
  opportunity: "target",
};

/** How much of a fact the one-screen strip shows before the rest moves to the dialog. */
const FACT_MAX: Record<ReportFact["id"], number> = { idea: 62, location: 42, capital: 26, audience: 34, sector: 34, area: 24 };
/** Generous characters-per-line and line budgets of the three lists (an item costs its lines plus 0.7 for its padding); see analysis-report-fit.ts. */
const FIT = {
  recs: { chars: 26, budget: 8.2, max: 3 },
  stand: { chars: 20, budget: 8.2, max: 3 },
  risks: { chars: 40, budget: 5.4, max: 3 },
};

const RING = 2 * Math.PI * 48;
const levelBars = (tone?: string) => (tone === "HIGH" ? 3 : tone === "MODERATE" ? 2 : tone === "LOW" ? 1 : 0);

async function printPdf(url: string) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("pdf");
  const objectUrl = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;bottom:0;inset-inline-end:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      frame.src = objectUrl;
      document.body.appendChild(frame);
    });
  } catch (error) {
    frame.remove();
    window.open(objectUrl, "_blank", "noopener");
    throw error;
  }
  window.setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(objectUrl);
  }, 120_000);
}

/**
 * The finished analysis report, drawn as the one screen of the approved design: no page scroll and no scrolling card on a
 * desktop or laptop screen. It draws only what the report model holds, so a live report, a stored copy and the PDF always
 * agree; every figure carries its state, source and date, and whatever does not fit a card is one click away in a dialog.
 */
export function AnalysisReportView({ actions, model, testId }: { actions: ReportActions; model: ReportModel; testId?: string }) {
  const ar = model.locale === "ar";
  const copy = (a: string, e: string) => (ar ? a : e);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error" }>({ state: "idle" });
  const [toast, setToast] = useState<Toast | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!toast || toast.kind === "error") return;
    const timer = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeDetail = useCallback(() => setDetail(null), []);
  const words = model.title.split(" ");
  const lastWord = words.pop();
  const pdfUrl = (inline: boolean) => (inline ? `${actions.pdfHref}${actions.pdfHref.includes("?") ? "&" : "?"}disposition=inline` : actions.pdfHref);
  const hasPoint = model.place.latitude !== undefined && model.place.longitude !== undefined;

  async function saveCopy() {
    if (!actions.saveProjectId || save.state === "saving") return;
    setSave({ state: "saving" });
    setToast(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveAnalysisReport", projectId: actions.saveProjectId, locale: model.locale }),
      });
      const payload = (await response.json().catch(() => null)) as { result?: { id?: string }; success?: boolean } | null;
      if (!response.ok || !payload?.success) throw new AnalysisRequestError(response.status);
      if (!mounted.current) return;
      setSave({ state: "saved" });
      setToast({ kind: "saved", id: payload.result?.id, text: copy("حُفظت نسخة من التقرير وبيانات المشروع والموقع في بياناتك. ", "A copy of the report, the project data and the location is saved in your data. ") });
    } catch (error) {
      if (!mounted.current) return;
      setSave({ state: "error" });
      setToast({ kind: "error", text: reportSaveMessage(error, ar) });
    }
  }

  async function printReport() {
    setToast({ kind: "info", text: copy("جارٍ تجهيز التقرير للطباعة…", "Preparing the report for printing…") });
    try {
      await printPdf(pdfUrl(true));
      if (mounted.current) setToast(null);
    } catch {
      if (mounted.current) setToast({ kind: "info", text: copy("فُتح التقرير في نافذة جديدة؛ اطبعه من هناك.", "The report opened in a new tab; print it from there.") });
    }
  }

  async function shareReport() {
    const url = `${window.location.origin}${actions.sharePath}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: model.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast({ kind: "info", text: copy("تم نسخ رابط التقرير. يفتح لمن لديه صلاحية الوصول إلى هذا المشروع.", "Report link copied. It opens for people who can access this project.") });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast({ kind: "error", text: copy("تعذر نسخ الرابط. انسخه من شريط العنوان.", "The link could not be copied. Copy it from the address bar.") });
    }
  }

  /* ---------------------------------------------------------------- what each card shows */
  const indicator = Object.fromEntries(model.indicators.map((item) => [item.id, item])) as Record<IndicatorId, ReportIndicator>;
  const slots: Array<{ id: IndicatorId | ReportPending["id"]; item?: ReportIndicator; pending?: ReportPending }> = [
    { id: "population", item: indicator.population },
    { id: "competitors", item: indicator.competitors },
    { id: "purchasing", item: indicator.purchasing },
    ...model.pending.map((pending) => ({ id: pending.id, pending })),
  ];

  const facts = model.facts.map((fact) => ({ ...fact, ...clampText(fact.value, FACT_MAX[fact.id]) }));

  const tip = model.recommendations.find((item) => item.code === "DIFFERENTIATE_OFFER");
  const recList = fitItems(model.recommendations, { budget: FIT.recs.budget, max: FIT.recs.max, lines: (item) => linesFor(item.title, FIT.recs.chars) + 0.7 });
  const standItems = [
    ...(tip ? [{ key: "tip", icon: "check" as IconName, title: tip.title, meta: "" }] : []),
    ...model.standOut.competitors.map((item, index) => ({ key: `${item.name}-${index}`, icon: "store" as IconName, title: item.name, meta: `${item.category} · ${item.distance}` })),
  ];
  const standList = fitItems(standItems, { budget: FIT.stand.budget, max: FIT.stand.max, lines: (item) => linesFor(item.title, FIT.stand.chars) + (item.meta ? 0.9 : 0) + 0.7 });
  const riskList = fitItems(model.risks.items, { budget: FIT.risks.budget, max: FIT.risks.max, lines: (item) => Math.min(2, linesFor(item, FIT.risks.chars)) + 0.7 });

  const completeness = model.complete ? model.completeness : 0;
  const gaugeNote = !model.complete
    ? copy("أكمل التحليل لتظهر نسبة اكتمال الأدلة.", "Finish the analysis to see the evidence coverage.")
    : model.quality === "LOW"
      ? copy("الأدلة غير كافية لقرار نهائي. أغلق فجوات المصادر ثم أعد التحليل.", "Coverage is not enough for a final decision. Close the source gaps and run the analysis again.")
      : copy("الأدلة كافية للانتقال إلى دراسة جدوى تفصيلية بعد مراجعة حدود البيانات.", "Coverage is enough to move on to a detailed feasibility study after the data limits are reviewed.");
  const riskBars = model.risks.level === "HIGH" ? 3 : model.risks.level === "MODERATE" ? 2 : model.risks.level === "LOW" ? 1 : 0;

  const detailTitle: Record<Detail, string> = {
    recommendations: copy("التوصيات", "Recommendations"),
    standout: copy("كيف تتميز عن منافسيك؟", "How to stand out from competitors?"),
    risks: copy("المخاطر والقيود", "Risks and limits"),
    facts: copy("بيانات المشروع", "Project data"),
    sources: copy("المصادر ودرجة الثقة", "Sources and confidence"),
  };

  const complete = model.complete;
  const pdfButton = (testid: string) => (
    <a className="rp-btn" data-testid={testid} download href={pdfUrl(false)}><Icon name="fileText" />{copy("تصدير PDF", "Export PDF")}</a>
  );
  const printButton = (testid: string, primary = true) => (
    <button className={`rp-btn${primary ? " is-primary" : ""}`} data-testid={testid} onClick={() => void printReport()} type="button"><Icon name="printer" />{copy("طباعة التقرير", "Print report")}</button>
  );

  return (
    <>
      <div className="rp-host">
        <section className="rp" data-testid={testId} dir={ar ? "rtl" : "ltr"}>
          <div aria-hidden="true" className="rp-banner" />
          <header className="rp-head">
            <div className="rp-head__text">
              <h1>{words.join(" ")} <b>{lastWord}</b></h1>
              <p>{copy("نتائج تحليل شاملة مبنية على الموقع والسوق والمنافسة والقوة الشرائية.", "A complete analysis built on location, market, competition and purchasing power.")}</p>
            </div>
            {model.ideaWarning ? (
              <button className="rp-badge is-warning" data-testid="analysis-unreadable-idea" onClick={() => setDetail("facts")} type="button">
                <span aria-hidden="true"><Icon name="warning" /></span>
                <span><b>{copy("فكرة المشروع غير مفهومة", "The idea is not understandable")}</b><small>{copy("اضغط لقراءة التنبيه", "Select to read the warning")}</small></span>
              </button>
            ) : complete ? (
              <span className="rp-badge">
                <span aria-hidden="true"><Icon name="check" /></span>
                <span><b>{actions.savedAtLabel ? copy("نسخة محفوظة في بياناتي", "Copy saved in My data") : copy("تم التحليل بنجاح", "Analysis complete")}</b><small>{actions.savedAtLabel ?? model.generatedAtLabel}</small></span>
              </span>
            ) : (
              <span className="rp-badge is-partial">
                <span aria-hidden="true"><Icon name="warning" /></span>
                <span><b>{copy("تقرير جزئي", "Partial report")}</b><small>{copy("بيانات الموقع فقط", "Location data only")}</small></span>
              </span>
            )}
          </header>

          <div className="rp-strip">
            <div className="rp-strip__actions">
              {actions.newHref ? <Link className="rp-btn is-ghost" href={actions.newHref}><Icon name="barChart" />{copy("تحليل جديد", "New analysis")}</Link> : null}
              {complete ? pdfButton("analysis-pdf-top") : null}
              {complete ? printButton("analysis-print-top") : null}
            </div>
            <dl className="rp-facts">
              {facts.map((fact) => (
                <div className={`rp-fact is-${fact.id}`} key={fact.id}>
                  <dt>
                    <Icon name={FACT_ICONS[fact.id]} />
                    <span>{fact.label}</span>
                    {fact.clamped ? <button className="rp-fact__more" onClick={() => setDetail("facts")} type="button">{copy("المزيد", "More")}</button> : null}
                  </dt>
                  <dd>{fact.text}</dd>
                </div>
              ))}
            </dl>
          </div>

          <section aria-labelledby="rp-kpis-title" className="rp-kpis-wrap">
            <header className="rp-kpis__head">
              <h2 id="rp-kpis-title"><Icon name="barChart" />{copy("المؤشرات الرئيسية للمشروع", "Key project indicators")}</h2>
              <button className="rp-link" onClick={() => setDetail("sources")} type="button"><Icon name="database" />{copy("المصادر ودرجة الثقة", "Sources and confidence")}</button>
            </header>
            <div className="rp-kpis">
              {slots.map((slot) => {
                const item = slot.item;
                const available = Boolean(item) && item!.state !== "UNAVAILABLE";
                const label = item?.label ?? slot.pending!.label;
                const value = available ? item!.value : copy("غير متاح", "Unavailable");
                const note = item ? (available ? item.short : item.note) : slot.pending!.reason;
                const source = available ? [item!.source, item!.date].filter((part) => part && part !== "—").join(" · ") : "";
                const bars = available ? levelBars(item!.tone) : 0;
                return (
                  <article className={`rp-kpi${available ? ` is-${item!.state.toLowerCase()}` : " is-unavailable"}`} data-indicator={slot.id} key={slot.id}>
                    <span className="rp-kpi__icon"><Icon name={SLOT_ICONS[slot.id]} /></span>
                    {bars ? <span aria-hidden="true" className="rp-bars" data-level={bars}><i /><i /><i /></span> : null}
                    <div className="rp-kpi__body">
                      <h3>{label}</h3>
                      <strong>{value}</strong>
                      <p>{note}</p>
                    </div>
                    {available ? (
                      <footer>
                        <span className="rp-chip">{item!.stateLabel}</span>
                        <small>{source}</small>
                      </footer>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <div className="rp-main">
            <section aria-labelledby="rp-map-title" className="rp-map">
              <div className="rp-map__canvas">
                {hasPoint ? (
                  <ProjectLocationPicker
                    center={{ latitude: model.place.latitude as number, longitude: model.place.longitude as number }}
                    competitors={model.mapCompetitors}
                    fitPadding={{ top: 70, right: 36, bottom: 40, left: 36 }}
                    label={copy("خريطة الموقع والمنافسين", "Location and competitors map")}
                    point={{ latitude: model.place.latitude as number, longitude: model.place.longitude as number }}
                    zoom={14}
                  />
                ) : (
                  <div className="rp-map__empty"><Icon name="globe" /><span>{copy("تعذر تحديد الموقع على الخريطة", "The location could not be placed on the map")}</span></div>
                )}
              </div>
              <h2 className="rp-map__title" id="rp-map-title"><Icon name="mapPin" />{copy("تحليل الموقع الجغرافي", "Geographic location analysis")}</h2>
              <span className="rp-map__place" title={model.place.name}><Icon name="mapPin" /><b>{clampText(model.place.name, 40).text}</b></span>
              <div className="rp-callout is-rivals">
                <span aria-hidden="true"><Icon name="store" /></span>
                <div><small>{copy("المنافسون", "Competitors")}</small><b>{model.competitorCount !== null ? venuesText(model.competitorCount, model.locale) : copy("غير متاح", "Unavailable")}</b><em>{copy("ضمن 5 كم", "Within 5 km")}</em></div>
              </div>
              <div className="rp-callout is-people">
                <span aria-hidden="true"><Icon name="people" /></span>
                <div><small>{copy("عدد السكان", "Population")}</small><b>{indicator.population.state !== "UNAVAILABLE" ? indicator.population.value : copy("غير متاح", "Unavailable")}</b><em>{copy("على مستوى الدولة", "Country level")}</em></div>
              </div>
              <ul aria-hidden="true" className="rp-legend">
                <li className="is-you">{copy("موقعك", "Your location")}</li>
                {model.mapCompetitors.length ? <li className="is-rival">{copy("منافس مرصود", "Mapped competitor")}</li> : null}
              </ul>
              <span aria-hidden="true" className="rp-compass"><i />N</span>
            </section>

            <section aria-labelledby="rp-gauge-title" className="rp-gauge">
              <h2 id="rp-gauge-title"><Icon name="activity" />{copy("اكتمال الأدلة", "Evidence coverage")}</h2>
              <div aria-label={`${completeness}%`} className="rp-ring" role="img">
                <svg aria-hidden="true" viewBox="0 0 120 120">
                  <circle className="rp-ring__track" cx="60" cy="60" r="48" />
                  <circle className="rp-ring__bar" cx="60" cy="60" r="48" strokeDasharray={`${(completeness / 100) * RING} ${RING}`} />
                </svg>
                <span><b>{complete ? `${completeness}%` : "—"}</b><small>{complete ? model.qualityLabel : copy("غير متاح", "Unavailable")}</small></span>
              </div>
              <p className="rp-gauge__note">
                {gaugeNote}
                <em>{copy("اكتمال الأدلة لا يعني احتمال نجاح المشروع.", "Evidence coverage is not a probability of success.")}</em>
              </p>
            </section>

            <section aria-labelledby="rp-recs-title" className="rp-brief is-recs">
              <h2 id="rp-recs-title"><Icon name="rocket" />{copy("أهم التوصيات", "Key recommendations")}</h2>
              {recList.shown.length ? (
                <ol className="rp-points">
                  {recList.shown.map((item, index) => (
                    <li key={item.code}><span className="rp-points__n">{index + 1}</span><b>{clampText(item.title, FIT.recs.chars * 2).text}</b></li>
                  ))}
                </ol>
              ) : <p className="rp-empty">{model.standOut.empty}</p>}
              {model.recommendations.length ? <button className="rp-more" data-testid="analysis-recs-details" onClick={() => setDetail("recommendations")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
            </section>

            <section aria-labelledby="rp-stand-title" className="rp-brief is-stand">
              <h2 id="rp-stand-title"><Icon name="trend" />{copy("كيف تتميز عن منافسيك؟", "How to stand out from competitors?")}</h2>
              {standList.shown.length ? (
                <ul className="rp-points is-plain">
                  {standList.shown.map((item) => (
                    <li key={item.key}>
                      <span className="rp-points__n"><Icon name={item.icon} /></span>
                      <div><b>{clampText(item.title, FIT.stand.chars * 2).text}</b>{item.meta ? <small>{item.meta}</small> : null}</div>
                    </li>
                  ))}
                </ul>
              ) : <p className="rp-empty">{model.standOut.empty}</p>}
              {standItems.length ? <button className="rp-more" data-testid="analysis-stand-details" onClick={() => setDetail("standout")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
            </section>

            <section aria-labelledby="rp-risk-title" className="rp-brief is-risks">
              <h2 id="rp-risk-title"><Icon name="warning" />{copy("المخاطر والتحديات", "Risks and challenges")}</h2>
              <div className={`rp-risklevel is-${model.risks.level.toLowerCase()}`}>
                <small>{copy("مستوى مخاطر البيانات", "Data-risk level")}</small>
                <b>{model.risks.levelLabel}</b>
                <span aria-hidden="true" className="rp-meter">{[1, 2, 3].map((step) => <i className={step <= riskBars ? "is-on" : undefined} key={step} />)}</span>
                {model.risks.items.length ? <button className="rp-more" data-testid="analysis-risks-details" onClick={() => setDetail("risks")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
              </div>
              {riskList.shown.length ? (
                <ul className="rp-points is-plain is-risk">
                  {riskList.shown.map((item) => <li key={item}><span className="rp-points__n"><Icon name="warning" /></span><p>{clampText(item, FIT.risks.chars * 2).text}</p></li>)}
                </ul>
              ) : <p className="rp-empty">{model.risks.empty}</p>}
            </section>
          </div>

          <footer className="rp-actions">
            <div className="rp-actions__bar" role="toolbar" aria-label={copy("إجراءات التقرير", "Report actions")}>
              {complete ? (
                <>
                  {printButton("analysis-print")}
                  {pdfButton("analysis-pdf")}
                  <button className="rp-btn" data-testid="analysis-share" onClick={() => void shareReport()} type="button"><Icon name="share" />{copy("مشاركة", "Share")}</button>
                  {actions.saveProjectId ? (
                    <button className="rp-btn" data-testid="analysis-save" disabled={save.state === "saving"} onClick={() => void saveCopy()} type="button">
                      <Icon name={save.state === "saved" ? "check" : "database"} />
                      {save.state === "saving" ? copy("جارٍ الحفظ…", "Saving…") : save.state === "saved" ? copy("تم الحفظ في بياناتي", "Saved in My data") : copy("حفظ في بياناتي", "Save to My data")}
                    </button>
                  ) : (
                    <Link className="rp-btn" href="/user/reports"><Icon name="database" />{copy("التقارير المحفوظة", "Saved reports")}</Link>
                  )}
                </>
              ) : (
                <Link className="rp-btn is-primary" href={actions.newHref ?? "/projects/analysis"}><Icon name="barChart" />{copy("ابدأ التحليل", "Start analysis")}</Link>
              )}
            </div>
          </footer>

          {toast ? (
            <p aria-live="polite" className={`rp-toast is-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
              <span>{toast.text}</span>
              {toast.kind === "saved" ? <Link href={toast.id ? `/user/reports/${toast.id}` : "/user/reports"}>{copy("فتح النسخة المحفوظة", "Open the saved copy")}</Link> : null}
              <button aria-label={copy("إغلاق", "Dismiss")} onClick={() => setToast(null)} type="button"><Icon name="x" /></button>
            </p>
          ) : null}
        </section>
      </div>

      {detail ? (
        <FlowModal ar={ar} className="rp-modal" onClose={closeDetail} step={`detail-${detail}`}>
          <div className="rp-modal__body" data-testid="analysis-detail-dialog">
            <h2 id="pa-modal-title">{detailTitle[detail]}</h2>
            {detail === "recommendations" ? (
              <ol className="rp-detail">
                {model.recommendations.map((item, index) => (
                  <li key={item.code}>
                    <span className="rp-points__n">{index + 1}</span>
                    <div>
                      <b>{item.title}</b>
                      <p>{item.text}</p>
                      <p className="rp-detail__why"><em>{copy("لماذا؟", "Why?")}</em> {item.reason}</p>
                      {item.basis.length ? <p className="rp-detail__basis"><em>{copy("تعتمد على:", "Based on:")}</em>{item.basis.map((entry) => <span className="rp-chip" key={entry}>{entry}</span>)}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}
            {detail === "standout" ? (
              <>
                {model.standOut.positioning ? <p className="rp-detail__lead">{model.standOut.positioning}</p> : null}
                {model.standOut.competitors.length ? (
                  <>
                    <h3>{copy("أقرب المنافسين المرصودين", "Nearest mapped competitors")}</h3>
                    <ul className="rp-detail is-rows is-cols">
                      {model.standOut.competitors.slice(0, 10).map((item, index) => (
                        <li key={`${item.name}-${index}`}><div><b>{item.name}</b><p>{item.category}</p></div><span>{item.distance}</span></li>
                      ))}
                    </ul>
                    {model.standOut.competitors.length > 10 ? <p className="rp-empty">{copy(`يظهر أقرب 10 من أصل ${model.standOut.competitors.length} منشأة مرصودة.`, `Showing the nearest 10 of ${model.standOut.competitors.length} mapped venues.`)}</p> : null}
                  </>
                ) : model.standOut.positioning ? null : <p className="rp-empty">{model.standOut.empty}</p>}
              </>
            ) : null}
            {detail === "risks" ? (
              <>
                <p className={`rp-risklevel is-flat is-${model.risks.level.toLowerCase()}`}><small>{copy("مستوى مخاطر البيانات", "Data-risk level")}</small><b>{model.risks.levelLabel}</b></p>
                <ul className="rp-detail is-rows is-risk">
                  {model.risks.items.map((item) => <li key={item}><p>{item}</p></li>)}
                </ul>
              </>
            ) : null}
            {detail === "facts" ? (
              <>
                {model.ideaWarning ? (
                  <p className="rp-warning" role="alert">
                    <Icon name="warning" />
                    <span>{model.ideaWarning}{actions.newHref ? <> <Link href={actions.newHref}>{copy("تحليل جديد", "New analysis")}</Link></> : null}</span>
                  </p>
                ) : null}
                <dl className="rp-detail-facts">
                  {model.facts.map((fact) => (
                    <div key={fact.id}><dt><Icon name={FACT_ICONS[fact.id]} />{fact.label}</dt><dd>{fact.value}</dd></div>
                  ))}
                </dl>
              </>
            ) : null}
            {detail === "sources" ? (
              <>
                {model.sources.length ? (
                  <table className="rp-table">
                    <thead><tr><th scope="col">{copy("المصدر", "Source")}</th><th scope="col">{copy("ما يغطيه", "What it covers")}</th><th scope="col">{copy("تاريخ الجلب", "Retrieved")}</th><th scope="col">{copy("الثقة", "Confidence")}</th></tr></thead>
                    <tbody>
                      {model.sources.map((row, index) => (
                        <tr key={`${row.name}-${index}`}>
                          <th data-label={copy("المصدر", "Source")} scope="row">{row.name}</th>
                          <td data-label={copy("ما يغطيه", "What it covers")}>{row.covers}</td>
                          <td data-label={copy("تاريخ الجلب", "Retrieved")}>{row.date}</td>
                          <td data-label={copy("الثقة", "Confidence")}>{row.confidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="rp-empty">{model.standOut.empty}</p>}
                <p className="rp-disclaimer" data-testid="analysis-scope-notice" role="note"><Icon name="shield" /><span>{model.disclaimer}</span></p>
              </>
            ) : null}
            <button className="rp-btn is-primary rp-modal__done" onClick={closeDetail} type="button">{copy("تم", "Done")}</button>
          </div>
        </FlowModal>
      ) : null}
    </>
  );
}
