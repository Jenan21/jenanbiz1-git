"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

export type Copy = readonly [string, string];
export type AnalysisStep = "idle" | "data" | "location" | "review" | "running" | "done" | "failed" | "export";

export const ANALYSIS_STAGES: ReadonlyArray<{ id: AnalysisStep[]; label: Copy }> = [
  { id: ["data"], label: ["بيانات المشروع", "Project data"] },
  { id: ["location"], label: ["تحديد الموقع", "Location"] },
  { id: ["review"], label: ["مراجعة البيانات", "Review"] },
  { id: ["running", "failed"], label: ["جاري التحليل", "Analyzing"] },
  { id: ["done"], label: ["عرض التقرير", "Report"] },
];

export const ANALYSIS_UNITS: ReadonlyArray<{ icon: IconName; label: Copy }> = [
  { icon: "mapPin", label: ["تحليل الموقع", "Location"] },
  { icon: "people", label: ["السكان", "Population"] },
  { icon: "wallet", label: ["القوة الشرائية", "Purchasing power"] },
  { icon: "grid", label: ["دراسة المنافسين", "Competitors"] },
  { icon: "shield", label: ["المخاطر والقيود", "Risks and limits"] },
  { icon: "fileText", label: ["إعداد التقرير", "Report"] },
];

export const pick = (value: Copy, ar: boolean) => (ar ? value[0] : value[1]);

const SCENE_CARDS: ReadonlyArray<{ icon: IconName; label: Copy; spot: string }> = [
  { icon: "people", label: ["عدد السكان", "Population"], spot: "a" },
  { icon: "grid", label: ["المنافسون", "Competitors"], spot: "b" },
  { icon: "wallet", label: ["القوة الشرائية", "Purchasing power"], spot: "c" },
  { icon: "trend", label: ["تضخم التكلفة", "Cost inflation"], spot: "d" },
  { icon: "shield", label: ["مخاطر البيانات", "Data risk"], spot: "e" },
];

/** The shared city-map backdrop of the analysis pages. */
export function AnalysisScene({ ar }: { ar: boolean }) {
  return (
    <div aria-hidden="true" className="pa-entry__scene">
      <i className="pa-entry__zone" />
      <span className="pa-entry__pin"><Icon name="mapPin" /></span>
      {SCENE_CARDS.map((card) => (
        <article className={`pa-entry__card is-${card.spot}`} key={card.spot}>
          <Icon name={card.icon} />
          <div><strong>{pick(card.label, ar)}</strong><small>{ar ? "يظهر بعد التحليل" : "Shown after analysis"}</small></div>
        </article>
      ))}
    </div>
  );
}

/** The one dialog shell of the analysis flow: backdrop, focus, Escape and the close button. */
export function AnalysisModal({
  ar,
  children,
  closable = true,
  onClose,
  size = "default",
  step,
}: {
  ar: boolean;
  children: ReactNode;
  closable?: boolean;
  onClose: () => void;
  size?: "default" | "wide" | "status";
  step: AnalysisStep;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!closable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, onClose]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [step]);

  return (
    <div className="pa-modal-layer" onMouseDown={(event) => { if (closable && event.target === event.currentTarget) onClose(); }}>
      <div
        aria-labelledby="pa-modal-title"
        aria-modal="true"
        className={`pa-modal${size === "wide" ? " is-wide" : ""}${size === "status" ? " is-status" : ""}`}
        data-step={step}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {closable ? (
          <button aria-label={ar ? "إغلاق" : "Close"} className="pa-modal__close" onClick={onClose} type="button"><Icon name="x" /></button>
        ) : null}
        {children}
      </div>
    </div>
  );
}

export function AnalysisSteps({ ar, step }: { ar: boolean; step: AnalysisStep }) {
  const index = ANALYSIS_STAGES.findIndex((stage) => stage.id.includes(step));
  return (
    <ol className="pa-steps" aria-label={ar ? "مراحل التحليل" : "Analysis steps"}>
      {ANALYSIS_STAGES.map((stage, position) => (
        <li className={position < index ? "is-done" : position === index ? "is-current" : undefined} key={stage.label[0]}>
          <span>{position < index ? <Icon name="check" /> : position + 1}</span>
          <small>{pick(stage.label, ar)}</small>
        </li>
      ))}
    </ol>
  );
}

export function AnalysisStatus({
  ar,
  message,
  onClose,
  onOpenReport,
  onRetry,
  onReview,
  state,
}: {
  ar: boolean;
  message?: string;
  onClose: () => void;
  onOpenReport: () => void;
  onRetry: () => void;
  onReview?: () => void;
  state: "running" | "done" | "failed";
}) {
  if (state === "running") {
    return (
      <div className="pa-modal__body pa-status" data-testid="analysis-running">
        <h2 id="pa-modal-title">{ar ? <>جاري التحليل <b>وإعداد التقرير</b></> : <>Analyzing <b>and preparing the report</b></>}</h2>
        <p>{ar ? "تقوم المنصة الآن بجمع بيانات الموقع والسكان والمنافسين ومؤشرات السوق من مصادرها المعلنة." : "The platform is collecting location, population, competitor, and market data from its disclosed sources."}</p>
        <div aria-live="polite" className="pa-orbit is-running" role="status"><i /><i /><Icon name="barChart" /></div>
        <ul className="pa-units">
          {ANALYSIS_UNITS.map((unit) => <li key={unit.label[0]}><Icon name={unit.icon} /><span>{pick(unit.label, ar)}</span></li>)}
        </ul>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="pa-modal__body pa-status" data-testid="analysis-ready">
        <div className="pa-orbit is-done"><i /><Icon name="check" /></div>
        <h2 id="pa-modal-title">{ar ? <>التحليل <b>جاهز</b></> : <>Analysis <b>ready</b></>}</h2>
        <p className="pa-status__ok">{ar ? "تم إعداد التقرير بنجاح" : "The report was prepared successfully"}</p>
        <ul className="pa-units is-done">
          {ANALYSIS_UNITS.map((unit) => <li key={unit.label[0]}><Icon name={unit.icon} /><span>{pick(unit.label, ar)}</span><em><Icon name="check" /></em></li>)}
        </ul>
        <footer className="is-stack">
          <button className="pa-btn is-primary is-block" data-testid="analysis-open-report" onClick={onOpenReport} type="button"><Icon name="fileText" />{ar ? "اضغط هنا لعرض التقرير الكامل" : "Open the full report"}</button>
          <button className="pa-btn is-ghost is-block" onClick={onClose} type="button">{ar ? "إغلاق" : "Close"}</button>
        </footer>
      </div>
    );
  }
  return (
    <div className="pa-modal__body pa-status" data-testid="analysis-failed">
      <div className="pa-orbit is-failed"><i /><Icon name="x" /></div>
      <h2 id="pa-modal-title">{ar ? <>تعذر إكمال <b>التحليل</b></> : <>The analysis <b>failed</b></>}</h2>
      <p className="pa-modal__error" role="alert">{message}</p>
      <footer className="is-stack">
        <button className="pa-btn is-primary is-block" onClick={onRetry} type="button">{ar ? "إعادة المحاولة" : "Try again"}</button>
        <button className="pa-btn is-ghost is-block" onClick={onReview ?? onClose} type="button">{onReview ? (ar ? "مراجعة البيانات" : "Review data") : ar ? "إغلاق" : "Close"}</button>
      </footer>
    </div>
  );
}
