"use client";

import { Icon, type IconName } from "@/components/ui/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { flowText, type FlowCopy } from "@/components/projects/project-flow-kit";
import { ANALYSIS_STAGES, type AnalysisStage } from "@/lib/projects/analysis-study";

/** The four real steps of the flow, in the order the person goes through them. */
export const ANALYSIS_STEPS: readonly FlowCopy[] = [
  ["بيانات المشروع", "Project data"],
  ["الموقع", "Location"],
  ["التحليل", "Analysis"],
  ["التقرير", "Report"],
];

/** The real steps of a run, with the words the person sees; they mirror the server's recorded stages one to one. */
export const ANALYSIS_STAGE_INFO: Record<AnalysisStage, { icon: IconName; label: FlowCopy }> = {
  LOCATION: { icon: "mapPin", label: ["تحليل الموقع", "Location analysis"] },
  MARKET_DATA: { icon: "barChart", label: ["قراءة بيانات السوق", "Reading market data"] },
  COMPETITION: { icon: "store", label: ["تحليل المنافسة", "Competition analysis"] },
  RECOMMENDATIONS: { icon: "lightbulb", label: ["إعداد التوصيات", "Preparing recommendations"] },
  REPORT: { icon: "fileText", label: ["تجهيز التقرير", "Preparing the report"] },
};

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The progress popup. `completed` is how many real stages the server has finished; the ring and the percent come only from
 * that, so they stand still while a long step runs instead of creeping toward a made-up number.
 */
export function AnalysisProgress({ ar, completed, known, pending = false }: { ar: boolean; completed: number; known: boolean; pending?: boolean }) {
  const total = ANALYSIS_STAGES.length;
  const fraction = known ? Math.min(1, completed / total) : 0;
  const current = completed < total ? ANALYSIS_STAGES[completed] : undefined;
  return (
    <div className="af-progress" data-testid="analysis-running">
      <span className="af-pill"><Icon name="check" />{ar ? "تم تحديد الموقع بنجاح" : "Location confirmed"}</span>
      <h2 id="pa-modal-title">{pending ? (ar ? "بانتظار بدء التحليل" : "Waiting for analysis to start") : ar ? "جاري التحليل وإعداد التقرير" : "Analyzing and preparing the report"}</h2>
      <p className="af-lead">
        {pending ? (ar ? "تُحفظ مدخلاتك ويُعرض التقدم عند بدء المعالجة الفعلية." : "Your input is saved; progress appears when processing actually starts.") : ar ? (
          <>
            <span>تقرأ المنصة الآن بيانات الموقع والسوق والمنافسين</span> <span>من مصادرها المعلنة.</span>
          </>
        ) : (
          <>
            <span>The platform is reading the location, market and competitor</span> <span>data from disclosed sources.</span>
          </>
        )}
      </p>
      <div
        aria-label={ar ? "تقدم التحليل" : "Analysis progress"}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(fraction * 100)}
        className="af-ring"
        role="progressbar"
      >
        <svg aria-hidden="true" viewBox="0 0 120 120">
          <circle className="af-ring__track" cx="60" cy="60" r={RING_RADIUS} />
          <circle className="af-ring__bar" cx="60" cy="60" r={RING_RADIUS} strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - fraction)} />
        </svg>
        <span>{known ? <b>{Math.round(fraction * 100)}%</b> : <Icon name="barChart" />}</span>
      </div>
      <ol className="af-stages" aria-label={ar ? "مراحل التحليل" : "Analysis stages"}>
        {ANALYSIS_STAGES.map((stage, index) => {
          const state = index < completed ? "is-done" : index === completed ? "is-current" : "";
          const info = ANALYSIS_STAGE_INFO[stage];
          return (
            <li aria-current={state === "is-current" ? "step" : undefined} className={state} key={stage}>
              <span className="af-stages__dot">{state === "is-done" ? <Icon name="check" /> : state === "is-current" ? <i /> : index + 1}</span>
              <small>{flowText(info.label, ar)}</small>
            </li>
          );
        })}
      </ol>
      <span className="af-sr" role="status">{current ? flowText(ANALYSIS_STAGE_INFO[current].label, ar) : ar ? "اكتمل التحليل" : "Analysis complete"}</span>
      <p className="af-hint">
        <Icon name="lightbulb" />
        <span>{ar ? "يتم تحليل البيانات من مصادر معلنة وموثقة لتقديم مؤشرات قابلة للمراجعة." : "Data is analysed from disclosed, verifiable sources to give reviewable indicators."}</span>
      </p>
    </div>
  );
}

/** The success popup: one mark, one title, one line and one button. */
export function AnalysisReady({ ar, onOpen }: { ar: boolean; onOpen: () => void }) {
  return (
    <div className="af-notice" data-testid="analysis-ready">
      <div className="af-seal"><i /><Icon name="check" /></div>
      <h2 id="pa-modal-title">{ar ? <>التحليل <b>جاهز</b></> : <>Analysis <b>ready</b></>}</h2>
      <p>{ar ? "أُعدّ تقرير موقعك وسوقك ومنافسيك." : "Your location, market and competitor report is ready."}</p>
      <button className="af-primary" data-testid="analysis-open-report" onClick={onOpen} type="button"><Icon name="fileText" />{ar ? "عرض التقرير" : "View report"}</button>
    </div>
  );
}

/** The failure popup: a calm sentence chosen by the caller (never the server's own text) and the way forward. */
export function AnalysisFailed({ ar, message, onRetry, onReview, retryDisabled = false, signInHref, retryAfterMs = 0 }: { ar: boolean; message: string; onRetry: () => void; onReview: () => void; retryDisabled?: boolean; signInHref?: string; retryAfterMs?: number }) {
  const [cooldown, setCooldown] = useState(retryAfterMs > 0);
  useEffect(() => {
    if (!retryAfterMs) return;
    const timer = setTimeout(() => setCooldown(false), retryAfterMs);
    return () => clearTimeout(timer);
  }, [retryAfterMs]);
  return (
    <div className="af-notice is-failed" data-testid="analysis-failed" role="alert">
      <div className="af-seal"><i /><Icon name="x" /></div>
      <h2 id="pa-modal-title">{ar ? <>تعذر إكمال <b>التحليل</b></> : <>The analysis <b>stopped</b></>}</h2>
      <p>{message}</p>
      <div className="af-notice__actions">
        {signInHref ? <Link className="af-primary" href={signInHref}>{ar ? "تسجيل الدخول" : "Sign in"}</Link> : <button className="af-primary" disabled={retryDisabled || cooldown} onClick={onRetry} type="button"><Icon name="refresh" />{ar ? "إعادة المحاولة" : "Try again"}</button>}
        <button className="af-secondary" onClick={onReview} type="button">{ar ? "مراجعة البيانات" : "Review data"}</button>
      </div>
    </div>
  );
}
