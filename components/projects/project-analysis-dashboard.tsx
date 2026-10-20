"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  AnalysisFailed,
  AnalysisProgress,
  AnalysisReady,
  ANALYSIS_STEPS,
} from "@/components/projects/project-analysis-dialogs";
import { AnalysisStage, ANALYSIS_CENTER } from "@/components/projects/project-analysis-stage";
import { FlowModal, FlowStepper, flowText } from "@/components/projects/project-flow-kit";
import type { PickedPoint } from "@/components/projects/project-location-picker";
import { useAnalysisProgress } from "@/components/projects/use-analysis-progress";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon } from "@/components/ui/icons";
import { AnalysisRequestError, analysisFailureMessage } from "@/lib/projects/analysis-errors";
import { completedStages } from "@/lib/projects/analysis-study";
import { FLOW_AUDIENCES, FLOW_SECTORS, SAUDI_CITIES, sectorNeedsArea } from "@/lib/projects/flow-options";
import { budgetRangeFor } from "@/lib/projects/feasibility-simple";
import { textProblem, textProblemMessage } from "@/lib/projects/text-quality";
import type { Locale } from "@/types/i18n";

const ProjectLocationPicker = dynamic(
  () => import("@/components/projects/project-location-picker").then((module) => module.ProjectLocationPicker),
  { ssr: false, loading: () => <div className="pa-entry-map is-loading" /> },
);

type Step = "idle" | "data" | "location" | "running" | "done" | "failed";
type Place = { label: string; city: string; district?: string; latitude: number; longitude: number };

const RIYADH = ANALYSIS_CENTER;

type ApiPayload<T> = { code?: string; result?: T; success?: boolean } | null;

async function command<T>(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ApiPayload<T>;
  if (!response.ok || !payload?.success) throw new AnalysisRequestError(response.status, payload?.code);
  return payload.result as T;
}

async function lookup(query: string) {
  const response = await fetch(`/api/projects/geocode?${query}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { results?: Place[]; success?: boolean } | null;
  return response.ok && payload?.success ? (payload.results ?? []) : [];
}

function nearestCity(point: PickedPoint) {
  return SAUDI_CITIES.reduce((best, city) => {
    const distance = (city.latitude - point.latitude) ** 2 + (city.longitude - point.longitude) ** 2;
    return distance < best.distance ? { city, distance } : best;
  }, { city: SAUDI_CITIES[0]!, distance: Infinity }).city;
}

export function ProjectAnalysisDashboard({
  initialStep = "idle",
  latestReportId = null,
  locale,
  userLabel,
}: {
  initialStep?: "idle" | "data";
  /** The user's latest finished analysis; the landing offers «عرض التقرير» only when there is one. */
  latestReportId?: string | null;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [idea, setIdea] = useState("");
  const [capital, setCapital] = useState("");
  const [sector, setSector] = useState("");
  const [audience, setAudience] = useState("");
  const [area, setArea] = useState("");
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [view, setView] = useState<{ center: PickedPoint; zoom: number }>({ center: RIYADH, zoom: 12 });
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const projectId = useRef<string | null>(null);
  const savedKey = useRef("");
  const lookupSeq = useRef(0);

  const busy = step === "running";
  const showArea = sectorNeedsArea(sector);
  const progress = useAnalysisProgress(runId, step === "running");
  const completed = finished ? 5 : completedStages(progress.stage, progress.status);
  const close = useCallback(() => {
    if (busy) return;
    setMessage("");
    setStep("idle");
  }, [busy]);

  useEffect(() => {
    const text = search.trim();
    if (text.length < 2) return;
    const timer = window.setTimeout(() => {
      lookup(`q=${encodeURIComponent(text)}`).then(setHits).catch(() => setHits([]));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [search]);

  function submitData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = textProblem(idea);
    if (problem) return setMessage(textProblemMessage(problem, locale));
    if (!(Number(capital) > 0)) return setMessage(ar ? "أدخل رأس المال بقيمة أكبر من صفر." : "Enter a capital above zero.");
    if (showArea && area.trim() && !(Number(area) > 0)) return setMessage(ar ? "أدخل مساحة أكبر من صفر أو اترك الحقل فارغًا." : "Enter an area above zero, or leave the field empty.");
    setMessage("");
    setStep("location");
  }

  async function pick(next: PickedPoint, known?: Place) {
    setPoint(next);
    setMessage("");
    if (known) return setPlace(known);
    setPlace(null);
    const seq = ++lookupSeq.current;
    const found = await lookup(`lat=${next.latitude}&lon=${next.longitude}`).catch(() => []);
    if (seq !== lookupSeq.current) return;
    const city = nearestCity(next);
    setPlace(found[0] ?? { label: flowText(city.label, true), city: flowText(city.label, true), latitude: next.latitude, longitude: next.longitude });
  }

  function choose(hit: Place) {
    setSearch("");
    setHits([]);
    const next = { latitude: hit.latitude, longitude: hit.longitude };
    setView({ center: next, zoom: 15 });
    void pick(next, hit);
  }

  function locateMe() {
    if (!navigator.geolocation) return setMessage(ar ? "المتصفح لا يدعم تحديد الموقع." : "This browser does not support geolocation.");
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setView({ center: here, zoom: 16 });
        setLocating(false);
        void pick(here);
      },
      () => {
        setLocating(false);
        setMessage(ar ? "تعذر تحديد موقعك. اسمح بالوصول للموقع أو حدده يدويًا على الخريطة." : "Your location could not be read. Allow access or pick it on the map.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function analyse() {
    if (!point) return setMessage(ar ? "اضغط على الخريطة أو ابحث عن مكان لتحديد الموقع." : "Click the map or search for a place to set the location.");
    const city = place?.city || flowText(nearestCity(point).label, true);
    setMessage("");
    setFinished(false);
    setStep("running");
    const input = {
      idea: idea.trim(),
      city,
      targetAudience: audience,
      latitude: Number(point.latitude.toFixed(6)),
      longitude: Number(point.longitude.toFixed(6)),
      expectedCapital: Number(capital),
      ...(budgetRangeFor(Number(capital)) ? { budgetRange: budgetRangeFor(Number(capital)) } : {}),
      ...(showArea && Number(area) > 0 ? { areaSqm: Number(area) } : {}),
      ...(place?.label ? { placeLabel: place.label } : {}),
    };
    try {
      // A retry after a failed run must not create a second project for the same answers.
      const key = JSON.stringify({ input, sector });
      if (!projectId.current || savedKey.current !== key) {
        const created = await command<{ id: string }>({
          action: "create",
          name: input.idea.slice(0, 160),
          description: [input.idea, place?.label ? `${ar ? "الموقع" : "Location"}: ${place.label}` : ""].filter(Boolean).join("\n"),
          sector,
          countryCode: "SA",
        });
        projectId.current = created.id;
        await command({ action: "saveProjectAnalysis", projectId: created.id, input });
        savedKey.current = key;
      }
      setRunId(projectId.current);
      await command({ action: "runProjectAnalysis", projectId: projectId.current });
      // A real finish: let the ring show it for a moment before the next popup replaces it.
      setFinished(true);
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      setStep("done");
    } catch (error) {
      setMessage(analysisFailureMessage(error, ar));
      setStep("failed");
    }
  }

  const openReport = () => {
    if (projectId.current) router.push(`/projects/analysis/result?project=${projectId.current}`);
  };
  const backToData = () => {
    setMessage("");
    setStep("data");
  };
  const stepIndex = step === "location" ? 1 : 0;

  return (
    <main className="pa-entry an-page" data-project-analysis-route="/projects/analysis" data-testid="project-analysis-entry" dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />

      <AnalysisStage ar={ar} onStart={() => setStep("data")} reportHref={latestReportId ? `/projects/analysis/result?project=${latestReportId}` : undefined} />

      {step !== "idle" ? (
        <FlowModal ar={ar} className="af-modal" closable={!busy} onClose={close} step={step}>
          <div className="af-step" key={step}>
            {step === "data" ? (
              <>
                <header className="af-head">
                  <span className="af-head__badge"><Icon name="fileText" /></span>
                  <div><h2 id="pa-modal-title">{ar ? "تحليل مشروع جديد" : "New project analysis"}</h2><p>{ar ? "أدخل بيانات مشروعك للحصول على تحليل شامل ودقيق" : "Enter your project data for a complete, precise analysis"}</p></div>
                </header>
                <FlowStepper ar={ar} current={stepIndex} label={ar ? "مراحل التحليل" : "Analysis steps"} steps={ANALYSIS_STEPS} />
                <form className="af-form" onSubmit={submitData}>
                  <div className={`af-fields${showArea ? " has-area" : ""}`}>
                    <label className="is-idea"><span>{ar ? "فكرة المشروع" : "Project idea"} <b>*</b></span><textarea autoFocus maxLength={500} minLength={10} onChange={(event) => setIdea(event.target.value)} placeholder={ar ? "صف فكرة مشروعك بشكل مختصر" : "Describe your idea briefly"} required value={idea} /><em>{idea.length}/500</em></label>
                    <label className="is-capital"><span>{ar ? "رأس المال المتوقع" : "Expected capital"} <b>*</b></span><div className="af-money"><i>{ar ? "ريال سعودي" : "SAR"}</i><input inputMode="decimal" min={1} onChange={(event) => setCapital(event.target.value)} placeholder={ar ? "مثال: 500,000" : "Example: 500,000"} required type="number" value={capital} /></div></label>
                    <label className="is-sector"><span>{ar ? "القطاع" : "Sector"} <b>*</b></span><select onChange={(event) => setSector(event.target.value)} required value={sector}><option value="">{ar ? "اختر القطاع المناسب" : "Choose a sector"}</option>{FLOW_SECTORS.map((item) => <option key={item.value} value={item.value}>{flowText(item.label, ar)}</option>)}</select></label>
                    <label className="is-audience"><span>{ar ? "الفئة المستهدفة" : "Target audience"} <b>*</b></span><select onChange={(event) => setAudience(event.target.value)} required value={audience}><option value="">{ar ? "اختر الفئة المستهدفة" : "Choose an audience"}</option>{FLOW_AUDIENCES.map((item) => <option key={item.value} value={item.value}>{flowText(item.label, ar)}</option>)}</select></label>
                    {showArea ? (
                      <label className="is-area"><span>{ar ? "المساحة التقريبية (اختياري)" : "Approximate area (optional)"}</span><div className="af-money"><i>{ar ? "م²" : "m²"}</i><input inputMode="decimal" max={10000000} min={1} onChange={(event) => setArea(event.target.value)} placeholder={ar ? "مثال: 150" : "Example: 150"} type="number" value={area} /></div></label>
                    ) : null}
                  </div>
                  {message ? <p className="pa-modal__error" role="alert">{message}</p> : null}
                  <footer className="af-foot">
                    <button className="af-secondary" onClick={close} type="button">{ar ? "إلغاء" : "Cancel"}</button>
                    <button className="af-primary" data-testid="analysis-to-location" type="submit"><Icon name="mapPin" />{ar ? "تحديد الموقع" : "Set location"}</button>
                  </footer>
                </form>
              </>
            ) : null}

            {step === "location" ? (
              <div className="af-locate">
                <header className="af-head">
                  <span className="af-head__badge"><Icon name="mapPin" /></span>
                  <div><h2 id="pa-modal-title">{ar ? "تحديد موقع المشروع" : "Project location"}</h2><p>{ar ? "ابحث عن المكان أو اضغط على الخريطة" : "Search for the place or click the map"}</p></div>
                  <button className="af-back" onClick={backToData} type="button">{ar ? "رجوع" : "Back"}</button>
                </header>
                <div className="af-stagebox">
                  <div className="af-map">
                    <ProjectLocationPicker center={view.center} label={ar ? "خريطة تحديد الموقع" : "Location map"} onPick={(next) => void pick(next)} point={point} zoom={view.zoom} />
                  </div>
                  <div className="af-search">
                    <Icon name="search" />
                    <input aria-label={ar ? "ابحث عن مدينة أو حي" : "Search a city or district"} data-testid="analysis-search" onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim().length < 2) setHits([]); }} placeholder={ar ? "ابحث عن مدينة، حي، شارع..." : "Search a city, district, street..."} value={search} />
                    {hits.length ? (
                      <ul className="af-hits">
                        {hits.slice(0, 5).map((hit) => <li key={`${hit.latitude}-${hit.longitude}`}><button onClick={() => choose(hit)} type="button"><Icon name="mapPin" />{hit.label}</button></li>)}
                      </ul>
                    ) : null}
                  </div>
                  <button aria-label={ar ? "استخدم موقعي" : "Use my location"} className="af-me" data-testid="analysis-locate" disabled={locating} onClick={locateMe} title={ar ? "استخدم موقعي" : "Use my location"} type="button"><Icon name="crosshair" /></button>
                  <div className={`af-card${point ? " is-set" : ""}`}>
                    <span className="af-card__pin"><Icon name="mapPin" /></span>
                    <div className="af-card__text">
                      <b data-testid="analysis-place">{point ? (place?.label ?? (ar ? "جارٍ تحديد اسم المكان..." : "Finding the place name...")) : ar ? "لم يُحدد موقع بعد" : "No location chosen yet"}</b>
                      <small>{message ? <span className="af-card__error" role="alert">{message}</span> : point ? (ar ? "تم تحديد الموقع بنجاح" : "Location set successfully") : ar ? "اضغط على الخريطة أو ابحث عن مكان" : "Click the map or search for a place"}</small>
                    </div>
                    <button className="af-primary" data-testid="analysis-confirm-location" disabled={!point} onClick={() => void analyse()} type="button"><Icon name="check" />{ar ? "تأكيد الموقع" : "Confirm location"}</button>
                  </div>
                </div>
              </div>
            ) : null}

            {step === "running" ? <AnalysisProgress ar={ar} completed={completed} known={finished || progress.known} /> : null}
            {step === "done" ? <AnalysisReady ar={ar} onOpen={openReport} /> : null}
            {step === "failed" ? <AnalysisFailed ar={ar} message={message} onRetry={() => void analyse()} onReview={backToData} /> : null}
          </div>
        </FlowModal>
      ) : null}
    </main>
  );
}
