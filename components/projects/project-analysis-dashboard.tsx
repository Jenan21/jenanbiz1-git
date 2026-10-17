"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import {
  AnalysisModal,
  AnalysisScene,
  AnalysisStatus,
  AnalysisSteps,
  pick,
  type AnalysisStep as Step,
  type Copy,
} from "@/components/projects/project-analysis-dialogs";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { PickedPoint } from "@/components/projects/project-location-picker";
import { textProblem, textProblemMessage } from "@/lib/projects/text-quality";
import type { Locale } from "@/types/i18n";

const ProjectLocationPicker = dynamic(
  () => import("@/components/projects/project-location-picker").then((module) => module.ProjectLocationPicker),
  { ssr: false, loading: () => <div className="pa-entry-map is-loading" /> },
);

const CITIES: ReadonlyArray<{ value: string; label: Copy; latitude: number; longitude: number }> = [
  { value: "Riyadh", label: ["الرياض", "Riyadh"], latitude: 24.7136, longitude: 46.6753 },
  { value: "Jeddah", label: ["جدة", "Jeddah"], latitude: 21.5433, longitude: 39.1728 },
  { value: "Dammam", label: ["الدمام", "Dammam"], latitude: 26.4207, longitude: 50.0888 },
  { value: "Khobar", label: ["الخبر", "Khobar"], latitude: 26.2172, longitude: 50.1971 },
  { value: "Makkah", label: ["مكة المكرمة", "Makkah"], latitude: 21.3891, longitude: 39.8579 },
  { value: "Madinah", label: ["المدينة المنورة", "Madinah"], latitude: 24.5247, longitude: 39.5692 },
  { value: "Taif", label: ["الطائف", "Taif"], latitude: 21.2854, longitude: 40.415 },
  { value: "Buraydah", label: ["بريدة", "Buraydah"], latitude: 26.326, longitude: 43.975 },
  { value: "Tabuk", label: ["تبوك", "Tabuk"], latitude: 28.3838, longitude: 36.5662 },
  { value: "Abha", label: ["أبها", "Abha"], latitude: 18.2164, longitude: 42.5053 },
  { value: "Hail", label: ["حائل", "Hail"], latitude: 27.5114, longitude: 41.7208 },
  { value: "Jazan", label: ["جازان", "Jazan"], latitude: 16.8892, longitude: 42.5511 },
];

const SECTORS: ReadonlyArray<{ value: string; label: Copy }> = [
  { value: "Technology", label: ["التقنية والذكاء الاصطناعي", "Technology and AI"] },
  { value: "Food", label: ["الأغذية والمشروبات", "Food and beverage"] },
  { value: "Real Estate", label: ["العقار والبناء", "Real estate and construction"] },
  { value: "Energy", label: ["الطاقة", "Energy"] },
  { value: "Services", label: ["الخدمات", "Services"] },
];

const AUDIENCES: ReadonlyArray<{ value: string; label: Copy }> = [
  { value: "CONSUMERS", label: ["الأفراد والمستهلكون", "Consumers"] },
  { value: "BUSINESSES", label: ["الشركات والمنشآت", "Businesses"] },
  { value: "YOUTH", label: ["الشباب والموظفون", "Young people and employees"] },
  { value: "FAMILIES", label: ["العائلات", "Families"] },
];

const BUDGETS: ReadonlyArray<{ value: string; label: Copy }> = [
  { value: "UNDER_100K", label: ["أقل من 100 ألف ر.س", "Under SAR 100K"] },
  { value: "BETWEEN_100K_500K", label: ["100 - 500 ألف ر.س", "SAR 100K - 500K"] },
  { value: "BETWEEN_500K_1M", label: ["500 ألف - مليون ر.س", "SAR 500K - 1M"] },
  { value: "ABOVE_1M", label: ["أكثر من مليون ر.س", "Above SAR 1M"] },
];

const FEATURES: ReadonlyArray<{ icon: IconName; label: Copy }> = [
  { icon: "globe", label: ["مصادر معلنة وموثقة", "Disclosed sources"] },
  { icon: "mapPin", label: ["موقعك على الخريطة", "Your exact location"] },
  { icon: "bolt", label: ["حسابات حتمية", "Deterministic rules"] },
  { icon: "eye", label: ["مراجعة بشرية", "Human review"] },
];

const labelOf = (list: ReadonlyArray<{ value: string; label: Copy }>, value: string, ar: boolean) => {
  const item = list.find((entry) => entry.value === value);
  return item ? pick(item.label, ar) : "—";
};

type ApiPayload<T> = { message?: string; result?: T; success?: boolean } | null;

async function projectCommand<T>(body: Record<string, unknown>, fallback: string) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ApiPayload<T>;
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? fallback);
  return payload.result as T;
}

export function ProjectAnalysisDashboard({
  initialStep = "idle",
  locale,
  userLabel,
}: {
  initialStep?: "idle" | "data";
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [idea, setIdea] = useState("");
  const [sector, setSector] = useState("");
  const [audience, setAudience] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [cityValue, setCityValue] = useState("");
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [view, setView] = useState<{ center: PickedPoint; zoom: number } | null>(null);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const projectId = useRef<string | null>(null);
  const savedInput = useRef("");

  const city = CITIES.find((entry) => entry.value === cityValue);
  const open = step !== "idle";
  const busy = step === "running";

  const close = useCallback(() => {
    if (busy) return;
    setMessage("");
    setStep("idle");
  }, [busy]);

  function submitData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = textProblem(idea);
    if (problem) {
      setMessage(textProblemMessage(problem, locale));
      return;
    }
    setMessage("");
    setStep("location");
  }

  function chooseCity(value: string) {
    setCityValue(value);
    const next = CITIES.find((entry) => entry.value === value);
    const center = next ? { latitude: next.latitude, longitude: next.longitude } : null;
    setPoint(center);
    setView(center ? { center, zoom: 12 } : null);
    setMessage("");
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setMessage(ar ? "المتصفح لا يدعم تحديد الموقع." : "This browser does not support geolocation.");
      return;
    }
    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setPoint(here);
        setView({ center: here, zoom: 16 });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setMessage(ar ? "تعذر تحديد موقعك. اسمح بالوصول للموقع أو حدده يدويًا على الخريطة." : "Your location could not be read. Allow location access or pick it on the map.");
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  function confirmLocation() {
    if (!city || !point) {
      setMessage(ar ? "اختر المدينة ثم حدد الموقع على الخريطة." : "Choose a city, then pick the location on the map.");
      return;
    }
    setMessage("");
    setStep("review");
  }

  async function startAnalysis() {
    if (!city || !point) return;
    setMessage("");
    setStep("running");
    const input = {
      idea: idea.trim(),
      city: city.value,
      targetAudience: audience,
      latitude: Number(point.latitude.toFixed(6)),
      longitude: Number(point.longitude.toFixed(6)),
      ...(budgetRange ? { budgetRange } : {}),
    };
    try {
      // A retry after a failed run must not create a second project for the same submission.
      const fingerprint = JSON.stringify({ input, sector });
      if (!projectId.current || savedInput.current !== fingerprint) {
        const created = await projectCommand<{ id: string }>(
          {
            action: "create",
            name: input.idea.slice(0, 160),
            description: [
              input.idea,
              `${ar ? "المدينة" : "City"}: ${pick(city.label, ar)}`,
              `${ar ? "الفئة المستهدفة" : "Target audience"}: ${labelOf(AUDIENCES, audience, ar)}`,
            ].join("\n"),
            sector,
            countryCode: "SA",
          },
          ar ? "تعذر إنشاء سجل المشروع." : "The project record could not be created.",
        );
        projectId.current = created.id;
        await projectCommand(
          { action: "saveProjectAnalysis", projectId: created.id, input },
          ar ? "تعذر حفظ مدخلات التحليل." : "The analysis input could not be saved.",
        );
        savedInput.current = fingerprint;
      }
      await projectCommand(
        { action: "runProjectAnalysis", projectId: projectId.current },
        ar ? "تعذر إكمال التحليل." : "The analysis could not be completed.",
      );
      setStep("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ar ? "تعذر بدء التحليل." : "The analysis could not be started.");
      setStep("failed");
    }
  }

  const viewReport = () => {
    if (projectId.current) router.push(`/projects/analysis/result?project=${projectId.current}`);
  };

  return (
    <main className="pa-entry" data-project-analysis-route="/projects/analysis" data-testid="project-analysis-entry" dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />

      <section className="pa-entry__stage">
        <AnalysisScene ar={ar} />

        <div className="pa-entry__copy">
          <nav aria-label={ar ? "مسار الصفحة" : "Breadcrumb"} className="pa-entry__crumbs">
            <Link href="/projects">{ar ? "المشاريع والاستثمار" : "Projects and investment"}</Link>
            <Icon name="chevron" />
            <span>{ar ? "تحليل المشاريع" : "Project analysis"}</span>
          </nav>
          <h1>{ar ? <>تحليل مشروع <b>ذكي</b></> : <>Smart project <b>analysis</b></>}</h1>
          <p>
            {ar
              ? "حلّل فكرة مشروعك والسوق المستهدف والموقع الجغرافي ومصادر البيانات المعلنة، واحصل على تقرير موثق بمصادره وقيوده."
              : "Analyze your idea, target market, and exact location against disclosed data sources, and get a report with its sources and limits."}
          </p>
          <div className="pa-entry__actions">
            <button className="pa-entry__start" data-testid="analysis-start" onClick={() => setStep("data")} type="button">
              <Icon name="barChart" />{ar ? "ابدأ التحليل" : "Start analysis"}
            </button>
            <Link className="pa-entry__ghost" href="/projects/analysis/report">
              <Icon name="fileText" />{ar ? "عرض التقرير" : "View report"}
            </Link>
          </div>
          <ul className="pa-entry__features">
            {FEATURES.map((feature) => (
              <li key={feature.label[0]}><Icon name={feature.icon} /><span>{pick(feature.label, ar)}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {open ? (
        <AnalysisModal
          ar={ar}
          closable={!busy}
          onClose={close}
          size={step === "location" ? "wide" : step === "running" || step === "done" || step === "failed" ? "status" : "default"}
          step={step}
        >
          <>
            {step === "done" || step === "failed" ? null : <AnalysisSteps ar={ar} step={step} />}

            {step === "data" ? (
              <form className="pa-modal__body" onSubmit={submitData}>
                <header>
                  <span className="pa-modal__badge"><Icon name="fileText" /></span>
                  <div><h2 id="pa-modal-title">{ar ? "تحليل مشروع جديد" : "New project analysis"}</h2><p>{ar ? "أدخل بيانات مشروعك للحصول على تحليل شامل ودقيق" : "Enter your project data for a complete, precise analysis"}</p></div>
                </header>
                <div className="pa-form">
                  <label className="is-wide"><span>{ar ? "فكرة المشروع" : "Project idea"} <b>*</b></span>
                    <textarea autoFocus maxLength={500} minLength={10} onChange={(event) => setIdea(event.target.value)} placeholder={ar ? "صف فكرة مشروعك بشكل مختصر" : "Describe your project idea briefly"} required rows={3} value={idea} />
                    <em>{idea.length}/500</em>
                  </label>
                  <label><span>{ar ? "القطاع" : "Sector"} <b>*</b></span>
                    <select onChange={(event) => setSector(event.target.value)} required value={sector}>
                      <option value="">{ar ? "اختر القطاع المناسب" : "Choose a sector"}</option>
                      {SECTORS.map((item) => <option key={item.value} value={item.value}>{pick(item.label, ar)}</option>)}
                    </select>
                  </label>
                  <label><span>{ar ? "الفئة المستهدفة" : "Target audience"} <b>*</b></span>
                    <select onChange={(event) => setAudience(event.target.value)} required value={audience}>
                      <option value="">{ar ? "اختر الفئة المستهدفة" : "Choose an audience"}</option>
                      {AUDIENCES.map((item) => <option key={item.value} value={item.value}>{pick(item.label, ar)}</option>)}
                    </select>
                  </label>
                  <label><span>{ar ? "رأس المال المتوقع" : "Expected capital"}</span>
                    <select onChange={(event) => setBudgetRange(event.target.value)} value={budgetRange}>
                      <option value="">{ar ? "غير محدد" : "Not specified"}</option>
                      {BUDGETS.map((item) => <option key={item.value} value={item.value}>{pick(item.label, ar)}</option>)}
                    </select>
                  </label>
                </div>
                {message ? <p className="pa-modal__error" role="alert">{message}</p> : null}
                <footer>
                  <button className="pa-btn is-ghost" onClick={close} type="button">{ar ? "إلغاء" : "Cancel"}</button>
                  <button className="pa-btn is-primary" data-testid="analysis-to-location" type="submit"><Icon name="mapPin" />{ar ? "تحديد الموقع" : "Set location"}</button>
                </footer>
              </form>
            ) : null}

            {step === "location" ? (
              <div className="pa-modal__body">
                <header>
                  <span className="pa-modal__badge"><Icon name="mapPin" /></span>
                  <div><h2 id="pa-modal-title">{ar ? "تحديد موقع المشروع" : "Project location"}</h2><p>{ar ? "اختر المدينة ثم حدد الموقع على الخريطة أو استخدم موقعك الحالي" : "Choose the city, then pick the spot on the map or use your current location"}</p></div>
                </header>
                <label className="pa-city"><span>{ar ? "المدينة" : "City"} <b>*</b></span>
                  <select data-testid="analysis-city" onChange={(event) => chooseCity(event.target.value)} value={cityValue}>
                    <option value="">{ar ? "اختر المدينة" : "Choose a city"}</option>
                    {CITIES.map((item) => <option key={item.value} value={item.value}>{pick(item.label, ar)}</option>)}
                  </select>
                </label>
                {city && point && view ? (
                  <>
                    <ProjectLocationPicker
                      center={view.center}
                      label={ar ? "خريطة تحديد الموقع" : "Location map"}
                      onPick={setPoint}
                      point={point}
                      zoom={view.zoom}
                    />
                    <p className="pa-map-note"><Icon name="mapPin" />{ar ? "انقر على الخريطة لتحديد الموقع بدقة." : "Click the map to place the exact location."} <bdi dir="ltr">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</bdi></p>
                  </>
                ) : (
                  <div className="pa-map-empty"><Icon name="globe" /><span>{ar ? "تظهر الخريطة بعد اختيار المدينة" : "The map appears once you choose a city"}</span></div>
                )}
                {message ? <p className="pa-modal__error" role="alert">{message}</p> : null}
                <footer>
                  <button className="pa-btn is-ghost" onClick={() => { setMessage(""); setStep("data"); }} type="button">{ar ? "السابق" : "Back"}</button>
                  <button className="pa-btn is-outline" disabled={!city || locating} onClick={locateMe} type="button"><Icon name="crosshair" />{locating ? (ar ? "جارٍ التحديد..." : "Locating...") : ar ? "حدد موقعي" : "Use my location"}</button>
                  <button className="pa-btn is-primary" data-testid="analysis-confirm-location" disabled={!city || !point} onClick={confirmLocation} type="button"><Icon name="check" />{ar ? "موافق" : "Confirm"}</button>
                </footer>
              </div>
            ) : null}

            {step === "review" && city && point ? (
              <div className="pa-modal__body">
                <header>
                  <span className="pa-modal__badge"><Icon name="eye" /></span>
                  <div><h2 id="pa-modal-title">{ar ? "مراجعة البيانات" : "Review your data"}</h2><p>{ar ? "تأكد من صحة بيانات المشروع قبل بدء التحليل" : "Confirm the project data before the analysis starts"}</p></div>
                </header>
                <dl className="pa-review">
                  <div className="is-wide"><dt>{ar ? "فكرة المشروع" : "Project idea"}</dt><dd>{idea.trim()}</dd></div>
                  <div><dt>{ar ? "القطاع" : "Sector"}</dt><dd>{labelOf(SECTORS, sector, ar)}</dd></div>
                  <div><dt>{ar ? "الفئة المستهدفة" : "Target audience"}</dt><dd>{labelOf(AUDIENCES, audience, ar)}</dd></div>
                  <div><dt>{ar ? "رأس المال المتوقع" : "Expected capital"}</dt><dd>{budgetRange ? labelOf(BUDGETS, budgetRange, ar) : ar ? "غير محدد" : "Not specified"}</dd></div>
                  <div><dt>{ar ? "الموقع" : "Location"}</dt><dd>{pick(city.label, ar)} · <bdi dir="ltr">{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</bdi></dd></div>
                </dl>
                <footer>
                  <button className="pa-btn is-ghost" onClick={() => setStep("data")} type="button">{ar ? "تعديل البيانات" : "Edit data"}</button>
                  <button className="pa-btn is-outline" onClick={() => setStep("location")} type="button">{ar ? "تعديل الموقع" : "Edit location"}</button>
                  <button className="pa-btn is-primary" data-testid="analysis-run" onClick={startAnalysis} type="button"><Icon name="barChart" />{ar ? "بدء التحليل" : "Start analysis"}</button>
                </footer>
              </div>
            ) : null}

            {step === "running" || step === "done" || step === "failed" ? (
              <AnalysisStatus
                ar={ar}
                message={message}
                onClose={close}
                onOpenReport={viewReport}
                onRetry={startAnalysis}
                onReview={() => setStep("review")}
                state={step}
              />
            ) : null}
          </>
        </AnalysisModal>
      ) : null}
    </main>
  );
}
