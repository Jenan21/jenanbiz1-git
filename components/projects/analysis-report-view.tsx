"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlowModal } from "@/components/projects/project-flow-kit";
import { Icon, type IconName } from "@/components/ui/icons";
import { AnalysisRequestError, reportSaveMessage } from "@/lib/projects/analysis-errors";
import { venuesText, type IndicatorId, type ReportFact, type ReportIndicator, type ReportModel } from "@/lib/projects/analysis-report";

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

type Detail = "recommendations" | "standout" | "risks";

const KPI_ICONS: Record<IndicatorId, IconName> = {
  population: "people",
  competitors: "store",
  purchasing: "wallet",
  inflation: "trend",
  evidence: "shield",
  risk: "warning",
};

const FACT_ICONS: Record<ReportFact["id"], IconName> = {
  idea: "lightbulb",
  location: "mapPin",
  capital: "wallet",
  audience: "people",
  sector: "grid",
  area: "cube",
};

const TOP = 3;

/** Only the figures whose direction is unambiguous are coloured; a competitor count is never called good or bad. */
function sentiment(item: ReportIndicator) {
  if (item.state === "UNAVAILABLE" || !item.tone || item.tone === "UNAVAILABLE") return "";
  if (item.id === "evidence" || item.id === "purchasing") return item.tone === "HIGH" ? "is-good" : item.tone === "LOW" ? "is-bad" : "is-warn";
  if (item.id === "risk") return item.tone === "HIGH" ? "is-bad" : item.tone === "LOW" ? "is-good" : "is-warn";
  return "";
}

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
 * The finished analysis report. It draws only what the report model holds, so a live report, a stored copy and the PDF
 * always agree; every figure carries its state, source and date.
 */
export function AnalysisReportView({ actions, model, testId }: { actions: ReportActions; model: ReportModel; testId?: string }) {
  const ar = model.locale === "ar";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; id?: string; message?: string }>({ state: "idle" });
  const [note, setNote] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);
  const words = model.title.split(" ");
  const lastWord = words.pop();
  const pdfUrl = (inline: boolean) => (inline ? `${actions.pdfHref}${actions.pdfHref.includes("?") ? "&" : "?"}disposition=inline` : actions.pdfHref);
  const hasPoint = model.place.latitude !== undefined && model.place.longitude !== undefined;
  const copy = (a: string, e: string) => (ar ? a : e);

  async function saveCopy() {
    if (!actions.saveProjectId || save.state === "saving") return;
    setSave({ state: "saving" });
    setNote("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveAnalysisReport", projectId: actions.saveProjectId, locale: model.locale }),
      });
      const payload = (await response.json().catch(() => null)) as { result?: { id?: string }; success?: boolean } | null;
      if (!response.ok || !payload?.success) throw new AnalysisRequestError(response.status);
      if (mounted.current) setSave({ state: "saved", id: payload.result?.id });
    } catch (error) {
      if (mounted.current) setSave({ state: "error", message: reportSaveMessage(error, ar) });
    }
  }

  async function printReport() {
    setNote(copy("جارٍ تجهيز التقرير للطباعة…", "Preparing the report for printing…"));
    try {
      await printPdf(pdfUrl(true));
      if (mounted.current) setNote("");
    } catch {
      if (mounted.current) setNote(copy("فُتح التقرير في نافذة جديدة؛ اطبعه من هناك.", "The report opened in a new tab; print it from there."));
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
      setNote(copy("تم نسخ رابط التقرير. يفتح لمن لديه صلاحية الوصول إلى هذا المشروع.", "Report link copied. It opens for people who can access this project."));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNote(copy("تعذر نسخ الرابط. انسخه من شريط العنوان.", "The link could not be copied. Copy it from the address bar."));
    }
  }

  const detailTitle: Record<Detail, string> = {
    recommendations: copy("التوصيات", "Recommendations"),
    standout: copy("كيف تتميز عن منافسيك؟", "How to stand out from competitors?"),
    risks: copy("المخاطر والقيود", "Risks and limits"),
  };

  return (
    <section className="rp" data-testid={testId} dir={ar ? "rtl" : "ltr"}>
      <header className="rp-head">
        <div>
          <h1>{words.join(" ")} <b>{lastWord}</b></h1>
          <p>{copy("الموقع والسوق والمنافسة والقوة الشرائية، ببيانات من مصادر معلنة.", "Location, market, competition and purchasing power, from disclosed sources.")}</p>
        </div>
        <div className="rp-head__side">
          {model.complete ? (
            <span className="rp-done">
              <span aria-hidden="true"><Icon name="check" /></span>
              <span><b>{actions.savedAtLabel ? copy("نسخة محفوظة في بياناتي", "Copy saved in My data") : copy("التحليل مكتمل", "Analysis complete")}</b><small>{actions.savedAtLabel ?? model.generatedAtLabel}</small></span>
            </span>
          ) : (
            <span className="rp-done is-partial">
              <span aria-hidden="true"><Icon name="warning" /></span>
              <span><b>{copy("تقرير جزئي", "Partial report")}</b><small>{copy("بيانات الموقع فقط — لم يكتمل التحليل", "Location data only — the analysis has not finished")}</small></span>
            </span>
          )}
          {actions.newHref ? <Link className="rp-btn is-ghost" href={actions.newHref}><Icon name="plus" />{copy("تحليل جديد", "New analysis")}</Link> : null}
        </div>
      </header>

      {model.ideaWarning ? (
        <p className="rp-warning" data-testid="analysis-unreadable-idea" role="alert">
          <Icon name="warning" />
          <span>{model.ideaWarning}{actions.newHref ? <> <Link href={actions.newHref}>{copy("تحليل جديد", "New analysis")}</Link></> : null}</span>
        </p>
      ) : null}

      <dl className="rp-facts">
        {model.facts.map((fact) => (
          <div className={`rp-fact is-${fact.id}`} key={fact.id}>
            <dt><Icon name={FACT_ICONS[fact.id]} />{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="rp-kpis-title" className="rp-kpis-wrap">
        <h2 className="rp-sr" id="rp-kpis-title">{copy("المؤشرات الرئيسية", "Key indicators")}</h2>
        <div className="rp-kpis">
          {model.indicators.map((item) => (
            <article className={`rp-kpi is-${item.state.toLowerCase()} ${sentiment(item)}`} data-indicator={item.id} key={item.id}>
              <header><span className="rp-kpi__icon"><Icon name={KPI_ICONS[item.id]} /></span><h3>{item.label}</h3></header>
              <strong>{item.value}</strong>
              <p>{item.note}</p>
              <footer>
                <span className="rp-chip">{item.stateLabel}</span>
                {item.state !== "UNAVAILABLE" ? <small>{[item.source, item.date, item.confidence ? item.confidenceLabel : ""].filter(Boolean).join(" · ")}</small> : null}
              </footer>
            </article>
          ))}
        </div>
        <ul aria-label={copy("مؤشرات غير متاحة حاليًا", "Indicators not available yet")} className="rp-pending">
          <li className="rp-pending__lead"><Icon name="lock" />{copy("غير متاحة حاليًا", "Not available yet")}</li>
          {model.pending.map((item) => <li key={item.id}><b>{item.label}</b><span>{item.reason}</span></li>)}
        </ul>
      </section>

      <div className="rp-main">
        <section aria-labelledby="rp-map-title" className="rp-map">
          <header>
            <h2 id="rp-map-title"><Icon name="mapPin" />{copy("تحليل الموقع الجغرافي", "Geographic location analysis")}</h2>
            <ul className="rp-legend" aria-hidden="true">
              <li className="is-you">{copy("موقعك", "Your location")}</li>
              {model.mapCompetitors.length ? <li className="is-rival">{copy("منافس مرصود", "Mapped competitor")}</li> : null}
            </ul>
          </header>
          <div className="rp-map__canvas">
            {hasPoint ? (
              <ProjectLocationPicker
                center={{ latitude: model.place.latitude as number, longitude: model.place.longitude as number }}
                competitors={model.mapCompetitors}
                label={copy("خريطة الموقع والمنافسين", "Location and competitors map")}
                point={{ latitude: model.place.latitude as number, longitude: model.place.longitude as number }}
                zoom={14}
              />
            ) : (
              <div className="rp-map__empty"><Icon name="globe" /><span>{copy("تعذر تحديد الموقع على الخريطة", "The location could not be placed on the map")}</span></div>
            )}
          </div>
          <footer>
            <span><Icon name="mapPin" /><b>{model.place.name}</b></span>
            <span>{model.competitorCount !== null ? copy(`المرصود ضمن 5 كم: ${venuesText(model.competitorCount, "ar")}`, `Mapped within 5 km: ${venuesText(model.competitorCount, "en")}`) : copy("لم تتوفر بيانات المنافسين", "Competitor data is not available")}</span>
          </footer>
        </section>

        <div className="rp-side">
          <section aria-labelledby="rp-recs-title" className="rp-brief">
            <h2 id="rp-recs-title"><Icon name="rocket" />{copy("أهم التوصيات", "Key recommendations")}</h2>
            {model.recommendations.length ? (
              <ol className="rp-points">
                {model.recommendations.slice(0, TOP).map((item, index) => (
                  <li key={item.code}><span className="rp-points__n">{index + 1}</span><div><b>{item.title}</b><p>{item.reason}</p></div></li>
                ))}
              </ol>
            ) : <p className="rp-empty">{model.standOut.empty}</p>}
            {model.recommendations.length ? <button className="rp-more" data-testid="analysis-recs-details" onClick={() => setDetail("recommendations")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
          </section>

          <section aria-labelledby="rp-stand-title" className="rp-brief">
            <h2 id="rp-stand-title"><Icon name="trend" />{copy("كيف تتميز عن منافسيك؟", "How to stand out from competitors?")}</h2>
            {model.standOut.positioning || model.standOut.competitors.length ? (
              <ul className="rp-points is-plain">
                {model.standOut.positioning ? <li><span className="rp-points__n"><Icon name="check" /></span><div><b>{copy("تموضع مقترح", "Suggested positioning")}</b><p>{model.standOut.positioning}</p></div></li> : null}
                {model.standOut.competitors.slice(0, model.standOut.positioning ? TOP - 1 : TOP).map((item, index) => (
                  <li key={`${item.name}-${index}`}><span className="rp-points__n"><Icon name="store" /></span><div><b>{item.name}</b><p>{item.category} · {item.distance}</p></div></li>
                ))}
              </ul>
            ) : <p className="rp-empty">{model.standOut.empty}</p>}
            {model.standOut.positioning || model.standOut.competitors.length ? <button className="rp-more" data-testid="analysis-stand-details" onClick={() => setDetail("standout")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
          </section>

          <section aria-labelledby="rp-risk-title" className="rp-brief">
            <h2 id="rp-risk-title"><Icon name="warning" />{copy("المخاطر والتحديات", "Risks and challenges")}</h2>
            <p className={`rp-risklevel is-${model.risks.level.toLowerCase()}`}>
              <small>{copy("مستوى مخاطر البيانات", "Data-risk level")}</small>
              <b>{model.risks.levelLabel}</b>
              <span aria-hidden="true">{[1, 2, 3].map((step) => <i className={step <= (model.risks.level === "HIGH" ? 3 : model.risks.level === "MODERATE" ? 2 : model.risks.level === "LOW" ? 1 : 0) ? "is-on" : undefined} key={step} />)}</span>
            </p>
            {model.risks.items.length ? (
              <ul className="rp-points is-plain is-risk">
                {model.risks.items.slice(0, TOP).map((item) => <li key={item}><span className="rp-points__n"><Icon name="warning" /></span><div><p>{item}</p></div></li>)}
              </ul>
            ) : <p className="rp-empty">{model.risks.empty}</p>}
            {model.risks.items.length ? <button className="rp-more" data-testid="analysis-risks-details" onClick={() => setDetail("risks")} type="button">{copy("عرض التفاصيل", "View details")}</button> : null}
          </section>
        </div>
      </div>

      <section aria-labelledby="rp-sources-title" className="rp-sources">
        <h2 id="rp-sources-title"><Icon name="database" />{copy("المصادر ودرجة الثقة", "Sources and confidence")}</h2>
        {model.sources.length ? (
          <table>
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
        <p className="rp-disclaimer" role="note"><Icon name="shield" /><span>{model.disclaimer}</span></p>
      </section>

      <footer className="rp-actions">
        <div className="rp-actions__bar" role="toolbar" aria-label={copy("إجراءات التقرير", "Report actions")}>
          {model.complete ? (
            <>
              {actions.saveProjectId ? (
                <button className="rp-btn is-primary" data-testid="analysis-save" disabled={save.state === "saving"} onClick={() => void saveCopy()} type="button">
                  <Icon name={save.state === "saved" ? "check" : "database"} />
                  {save.state === "saving" ? copy("جارٍ الحفظ…", "Saving…") : save.state === "saved" ? copy("تم الحفظ في بياناتي", "Saved in My data") : copy("حفظ في بياناتي", "Save to My data")}
                </button>
              ) : (
                <Link className="rp-btn is-primary" href="/user/reports"><Icon name="database" />{copy("التقارير المحفوظة", "Saved reports")}</Link>
              )}
              <a className="rp-btn" data-testid="analysis-pdf" download href={pdfUrl(false)}><Icon name="fileText" />{copy("تصدير PDF", "Export PDF")}</a>
              <button className="rp-btn" data-testid="analysis-print" onClick={() => void printReport()} type="button"><Icon name="printer" />{copy("طباعة التقرير", "Print report")}</button>
              <button className="rp-btn" data-testid="analysis-share" onClick={() => void shareReport()} type="button"><Icon name="share" />{copy("مشاركة", "Share")}</button>
            </>
          ) : (
            <Link className="rp-btn is-primary" href={actions.newHref ?? "/projects/analysis"}><Icon name="barChart" />{copy("ابدأ التحليل", "Start analysis")}</Link>
          )}
        </div>
        <p aria-live="polite" className={`rp-actions__note${save.state === "error" ? " is-error" : ""}`} role="status">
          {save.state === "saved" ? (
            <>{copy("حُفظت نسخة من التقرير وبيانات المشروع والموقع في بياناتك. ", "A copy of the report, the project data and the location is saved in your data. ")}<Link href={save.id ? `/user/reports/${save.id}` : "/user/reports"}>{copy("فتح النسخة المحفوظة", "Open the saved copy")}</Link></>
          ) : save.state === "error" ? save.message : note}
        </p>
      </footer>

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
                ) : <p className="rp-empty">{model.standOut.empty}</p>}
              </>
            ) : null}
            {detail === "risks" ? (
              <>
                <p className={`rp-risklevel is-${model.risks.level.toLowerCase()}`}><small>{copy("مستوى مخاطر البيانات", "Data-risk level")}</small><b>{model.risks.levelLabel}</b></p>
                <ul className="rp-detail is-rows is-risk">
                  {model.risks.items.map((item) => <li key={item}><p>{item}</p></li>)}
                </ul>
              </>
            ) : null}
            <button className="rp-btn is-primary rp-modal__done" onClick={closeDetail} type="button">{copy("تم", "Done")}</button>
          </div>
        </FlowModal>
      ) : null}
    </section>
  );
}
