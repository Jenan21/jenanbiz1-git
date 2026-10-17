"use client";

import { Icon, type IconName } from "@/components/ui/icons";
import { flowText, type FlowCopy } from "@/components/projects/project-flow-kit";

export const ANALYSIS_STEPS: readonly FlowCopy[] = [
  ["بيانات المشروع", "Project data"],
  ["الموقع الجغرافي", "Location"],
  ["مراجعة البيانات", "Review"],
  ["جاري التحليل", "Analyzing"],
  ["عرض التقرير", "Report"],
];

export const ANALYSIS_UNITS: ReadonlyArray<{ id: string; icon: IconName; label: FlowCopy }> = [
  { id: "location", icon: "mapPin", label: ["تحليل الموقع", "Location analysis"] },
  { id: "population", icon: "people", label: ["تحليل السكان", "Population"] },
  { id: "market", icon: "barChart", label: ["مؤشرات السوق", "Market indicators"] },
  { id: "competitors", icon: "fileText", label: ["دراسة المنافسين", "Competitor study"] },
  { id: "risk", icon: "chip", label: ["تقدير المخاطر", "Risk estimate"] },
  { id: "report", icon: "trend", label: ["إعداد التقرير", "Report"] },
];

/** The pieces the progress popup shows around its ring; the percent only moves with finished requests. */
export function AnalysisProgress({ ar, percent }: { ar: boolean; percent: number }) {
  const left = ANALYSIS_UNITS.slice(0, 3);
  const right = ANALYSIS_UNITS.slice(3);
  const card = (unit: (typeof ANALYSIS_UNITS)[number]) => (
    <li key={unit.id}>
      <Icon name={unit.icon} />
      <span>{flowText(unit.label, ar)}</span>
    </li>
  );
  return (
    <div className="an-progress" data-testid="analysis-running">
      <span className="an-pill"><Icon name="check" />{ar ? "تم تحديد الموقع بنجاح" : "Location confirmed"}</span>
      <h2 id="pa-modal-title">{ar ? "جاري التحليل وإعداد التقرير" : "Analyzing and preparing the report"}</h2>
      <p>{ar ? "تقوم المنصة الآن بتحليل بيانات المشروع والموقع الجغرافي والمنافسين والسكان ومؤشرات السوق من مصادرها المعلنة." : "The platform is analysing your project data, location, competitors, population and market indicators from its disclosed sources."}</p>
      <div className="an-progress__board">
        <ul className="an-progress__side is-start">{left.map(card)}</ul>
        <div aria-live="polite" className="an-ring" role="status">
          <i /><i />
          <span><Icon name="barChart" /><b>{percent}%</b></span>
        </div>
        <ul className="an-progress__side is-end">{right.map(card)}</ul>
      </div>
      <p className="an-hint"><Icon name="lightbulb" />{ar ? "يتم تحليل البيانات من مصادر معلنة وموثقة لتقديم مؤشرات ورؤى قابلة للمراجعة." : "Data is analysed from disclosed, verifiable sources to give reviewable indicators and insight."}</p>
    </div>
  );
}

export function AnalysisReady({ ar, onClose, onOpen }: { ar: boolean; onClose: () => void; onOpen: () => void }) {
  return (
    <div className="an-ready" data-testid="analysis-ready">
      <div className="an-ready__seal"><i /><Icon name="check" /></div>
      <h2 id="pa-modal-title">{ar ? <>التحليل <b>جاهز</b></> : <>Analysis <b>ready</b></>}</h2>
      <p className="an-ready__ok">{ar ? "تم إعداد التقرير بنجاح" : "The report was prepared successfully"}</p>
      <p className="an-ready__sub">{ar ? "اضغط هنا لعرض التقرير الكامل" : "Open the full report"}</p>
      <ul className="an-ready__chips">
        {ANALYSIS_UNITS.map((unit) => (
          <li key={unit.id}>
            <em><Icon name="check" /></em>
            <Icon name={unit.icon} />
            <span>{flowText(unit.label, ar)}</span>
          </li>
        ))}
      </ul>
      <button className="an-ready__open" data-testid="analysis-open-report" onClick={onOpen} type="button"><Icon name="externalLink" />{ar ? "اضغط هنا" : "Open"}<Icon name="chevron" /></button>
      <button className="an-ready__close" onClick={onClose} type="button">{ar ? "إغلاق" : "Close"}</button>
    </div>
  );
}

export function AnalysisFailed({ ar, message, onRetry, onReview }: { ar: boolean; message: string; onRetry: () => void; onReview: () => void }) {
  return (
    <div className="an-ready is-failed" data-testid="analysis-failed">
      <div className="an-ready__seal"><i /><Icon name="x" /></div>
      <h2 id="pa-modal-title">{ar ? <>تعذر إكمال <b>التحليل</b></> : <>The analysis <b>failed</b></>}</h2>
      <p className="pa-modal__error" role="alert">{message}</p>
      <button className="an-ready__open" onClick={onRetry} type="button">{ar ? "إعادة المحاولة" : "Try again"}</button>
      <button className="an-ready__close" onClick={onReview} type="button">{ar ? "مراجعة البيانات" : "Review data"}</button>
    </div>
  );
}
