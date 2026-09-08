"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { Locale } from "@/types/i18n";
import { assessProjectQuality } from "@/services/projects/project-quality";

type Project = {
  id: string;
  name: string;
  sector: string | null;
  countryCode: string | null;
  status: string;
  currentPhase: string;
  phases: Array<{ type: string; status: string }>;
  assessments: Array<{ type: "MARKET" | "FINANCIAL" | "OPERATIONAL" | "RISK" | "TECHNICAL" | "COMPLIANCE"; status: string; score: number | null; summary: string | null; source: string | null }>;
};

const copy = {
  ar: {
    title: "مشاريعك",
    name: "اسم المشروع",
    sector: "القطاع",
    country: "رمز الدولة",
    create: "إنشاء مشروع",
    creating: "جارٍ الإنشاء...",
    empty: "لا توجد مشاريع بعد. ابدأ بإضافة فكرتك الأولى.",
    loading: "جارٍ تحميل المشاريع...",
    error: "تعذر تحميل المشاريع.",
    retry: "إعادة المحاولة",
    helper: "ابدأ بالاسم، ثم أضف التفاصيل التي تساعد على تقييم الفكرة.",
    helperEn: "Start with a name, then add details that help assess the idea.",
    phase: "المرحلة الحالية",
    assessments: "التقييمات المكتملة",
    status: "الحالة",
    draft: "مسودة",
    projectProgress: "تقدم المشروع",
    readonly: "للقراءة فقط",
    calculator: "حاسبة الجدوى",
    investment: "الاستثمار الأولي",
    fixedCosts: "التكاليف الثابتة الشهرية",
    variableCost: "التكلفة لكل وحدة",
    unitPrice: "سعر الوحدة",
    units: "الوحدات الشهرية",
    months: "مدة الدراسة بالأشهر",
    calculate: "حساب الجدوى",
    calculating: "جارٍ الحساب...",
    breakEven: "نقطة التعادل",
    monthlyProfit: "الربح الشهري",
    roi: "العائد على الاستثمار",
    payback: "فترة الاسترداد",
    scenario: "السيناريو",
    report: "التقرير",
    print: "طباعة",
    quality: "جودة التقييم",
    evidence: "اكتمال الأدلة",
    intelligence: "بحث السوق والموقع",
    location: "موقع المشروع أو المدينة",
    latitude: "خط العرض (اختياري)",
    longitude: "خط الطول (اختياري)",
    project: "المشروع المرتبط (اختياري)",
    search: "بحث موثق",
    searching: "جارٍ البحث...",
    population: "السكان",
    purchasingPower: "القوة الشرائية",
    competitors: "المنافسون المكتشفون",
    limitations: "حدود البيانات",
    assessmentType: "نوع الدليل",
    score: "النتيجة",
    summary: "ملخص الدليل",
    source: "مصدر الدليل",
    record: "حفظ الدليل",
    recording: "جارٍ الحفظ...",
    start: "بدء المشروع",
    starting: "جارٍ البدء...",
    notReady: "أكمل الأدلة الستة قبل بدء المشروع.",
    evaluate: "تقييم موثق",
    evaluating: "جارٍ التقييم...",
    verdict: "قرار التقييم",
    workflow: "مسار المخرجات",
    analysisStep: "تحليل المشروع",
    feasibilityStep: "دراسة الجدوى",
    evaluationStep: "التقييم الموثق",
    startStep: "بدء المشروع",
    complete: "مكتمل",
    pending: "بانتظار المتطلب السابق",
    active: "الخطوة الحالية",
  },
  en: {
    title: "Your projects",
    name: "Project name",
    sector: "Sector",
    country: "Country code",
    create: "Create project",
    creating: "Creating...",
    empty: "No projects yet. Start by adding your first idea.",
    loading: "Loading projects...",
    error: "Projects could not be loaded.",
    retry: "Try again",
    helper: "Start with a name, then add details that help assess the idea.",
    helperEn: "Start with a name, then add details that help assess the idea.",
    phase: "Current phase",
    assessments: "Completed assessments",
    status: "Status",
    draft: "Draft",
    projectProgress: "Project progress",
    readonly: "Read only",
    calculator: "Feasibility calculator",
    investment: "Initial investment",
    fixedCosts: "Monthly fixed costs",
    variableCost: "Variable cost per unit",
    unitPrice: "Price per unit",
    units: "Monthly units",
    months: "Study period in months",
    calculate: "Calculate feasibility",
    calculating: "Calculating...",
    breakEven: "Break-even units",
    monthlyProfit: "Monthly profit",
    roi: "Return on investment",
    payback: "Payback period",
    scenario: "Scenario",
    report: "Report",
    print: "Print",
    quality: "Assessment quality",
    evidence: "Evidence completeness",
    intelligence: "Market and location research",
    location: "Project location or city",
    latitude: "Latitude (optional)",
    longitude: "Longitude (optional)",
    project: "Linked project (optional)",
    search: "Run sourced search",
    searching: "Searching...",
    population: "Population",
    purchasingPower: "Purchasing power",
    competitors: "Discovered competitors",
    limitations: "Data limitations",
    assessmentType: "Evidence type",
    score: "Score",
    summary: "Evidence summary",
    source: "Evidence source",
    record: "Save evidence",
    recording: "Saving...",
    start: "Start project",
    starting: "Starting...",
    notReady: "Complete all six evidence records before starting the project.",
    evaluate: "Run sourced evaluation",
    evaluating: "Evaluating...",
    verdict: "Evaluation verdict",
    workflow: "Output workflow",
    analysisStep: "Project analysis",
    feasibilityStep: "Feasibility study",
    evaluationStep: "Sourced evaluation",
    startStep: "Project start",
    complete: "Complete",
    pending: "Waiting for the previous gate",
    active: "Current step",
  },
} as const;

export function ProjectsWorkspace({ locale }: { locale: Locale }) {
  const language = locale === "ar" ? "ar" : "en";
  const text = copy[language];
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [calculation, setCalculation] = useState<{ base: { breakEvenUnits: number; monthlyProfit: number; roiPercent: number; paybackMonths: number | null }; scenarios: Array<{ scenario: string; monthlyProfit: number; roiPercent: number }> } | null>(null);
  const [financials, setFinancials] = useState({ initialInvestment: "", monthlyFixedCosts: "", variableCostPerUnit: "", pricePerUnit: "", monthlyUnits: "", months: "12" });
  const [intelligenceInput, setIntelligenceInput] = useState({ query: "", countryCode: "", sector: "", latitude: "", longitude: "" });
  const [intelligenceProjectId, setIntelligenceProjectId] = useState("");
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [assessment, setAssessment] = useState({ type: "MARKET" as Project["assessments"][number]["type"], score: "", summary: "", source: "" });
  const [assessmentProjectId, setAssessmentProjectId] = useState("");
  const [recordingAssessment, setRecordingAssessment] = useState(false);
  const [startingProjectId, setStartingProjectId] = useState("");
  const [evaluatingProjectId, setEvaluatingProjectId] = useState("");
  const [evaluation, setEvaluation] = useState<{ projectId: string; score: number; completeness: number; verdict: string } | null>(null);
  const [intelligence, setIntelligence] = useState<{ location: { label: string; latitude: number; longitude: number } | null; population: { value: number | null; year: number | null }; purchasingPower: { value: number | null; year: number | null }; competitors: Array<{ name: string; category: string }>; sources: Array<{ source: string; confidence: string }>; limitations: string[] } | null>(null);

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error(text.error);
      const data = (await response.json()) as { projects: Project[] };
      setProjects(data.projects);
    } catch {
      setError(text.error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(text.error);
        return (await response.json()) as { projects: Project[] };
      })
      .then((data) => {
        if (active) setProjects(data.projects);
      })
      .catch(() => {
        if (active) setError(text.error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [text.error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name, sector, countryCode }),
      });
      if (!response.ok) throw new Error(text.error);
      const data = (await response.json()) as { result: Project };
      setProjects((current) => [data.result, ...current]);
      setName("");
      setSector("");
      setCountryCode("");
    } catch {
      setError(text.error);
    } finally {
      setSubmitting(false);
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCalculating(true);
    setError("");
    try {
      const inputs = Object.fromEntries(Object.entries(financials).map(([key, value]) => [key, Number(value)]));
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "calculateFeasibility", inputs }) });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? text.error);
      }
      const data = (await response.json()) as { result: typeof calculation };
      setCalculation(data.result);
    } catch {
      setError(text.error);
    } finally {
      setCalculating(false);
    }
  }

  async function searchIntelligence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntelligenceLoading(true);
    setError("");
    try {
      const optional = (value: string) => value.trim() ? Number(value) : undefined;
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "searchIntelligence", projectId: intelligenceProjectId || undefined, query: intelligenceInput.query, countryCode: intelligenceInput.countryCode || undefined, sector: intelligenceInput.sector || undefined, latitude: optional(intelligenceInput.latitude), longitude: optional(intelligenceInput.longitude) }) });
      if (!response.ok) throw new Error(text.error);
      const data = (await response.json()) as { result: typeof intelligence };
      setIntelligence(data.result);
    } catch {
      setError(text.error);
    } finally {
      setIntelligenceLoading(false);
    }
  }

  async function recordAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assessmentProjectId) return;
    setRecordingAssessment(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recordAssessment", projectId: assessmentProjectId, type: assessment.type, score: Number(assessment.score), summary: assessment.summary, source: assessment.source }),
      });
      if (!response.ok) throw new Error(text.error);
      const updated = (await response.json()) as { result: Project["assessments"][number] };
      setProjects((current) => current.map((project) => project.id !== assessmentProjectId ? project : { ...project, assessments: project.assessments.map((item) => item.type === updated.result.type ? updated.result : item) }));
      setAssessment((current) => ({ ...current, score: "", summary: "", source: "" }));
    } catch {
      setError(text.error);
    } finally {
      setRecordingAssessment(false);
    }
  }

  async function startProject(projectId: string) {
    setStartingProjectId(projectId);
    setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", projectId }) });
      const data = (await response.json()) as { success?: boolean; result?: Project; message?: string };
      if (!response.ok || !data.success || !data.result) throw new Error(data.message ?? text.notReady);
      setProjects((current) => current.map((project) => project.id === projectId ? { ...project, status: data.result!.status, currentPhase: data.result!.currentPhase, phases: data.result!.phases } : project));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setStartingProjectId("");
    }
  }

  async function evaluateProject(project: Project) {
    setEvaluatingProjectId(project.id);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assessQuality", assessments: project.assessments }),
      });
      const data = (await response.json()) as { success?: boolean; result?: { score: number; completeness: number; verdict: string }; message?: string };
      if (!response.ok || !data.success || !data.result) throw new Error(data.message ?? text.error);
      setEvaluation({ projectId: project.id, ...data.result });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : text.error);
    } finally {
      setEvaluatingProjectId("");
    }
  }

  return (
    <section className="projects-workspace" aria-labelledby="projects-workspace-title" aria-busy={loading}>
      <div className="section-heading">
        <span className="eyebrow eyebrow--small">{text.title}</span>
        <h2 id="projects-workspace-title">{text.create}</h2>
        <p>{language === "ar" ? text.helper : text.helperEn}</p>
      </div>
      <nav className="projects-live-links" aria-label={language === "ar" ? "خدمات المشاريع الفعلية" : "Live project services"}>
        <Link className="button button--secondary" href="/projects/analysis">{language === "ar" ? "تحليل المشروع" : "Project analysis"}</Link>
        <Link className="button button--secondary" href="/projects/feasibility">{language === "ar" ? "دراسة الجدوى" : "Feasibility study"}</Link>
        <Link className="button button--secondary" href="/projects/evaluation">{language === "ar" ? "تقييم المشروع" : "Project evaluation"}</Link>
        <Link className="button button--secondary" href="/projects/start">{language === "ar" ? "بدء المشروع" : "Start project"}</Link>
      </nav>
      <form className="card project-create-form" onSubmit={submit}>
        <label>
          <span>{text.name}</span>
          <input aria-required="true" required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span>{text.sector}</span>
          <input maxLength={120} value={sector} onChange={(event) => setSector(event.target.value)} />
        </label>
        <label>
          <span>{text.country}</span>
          <input maxLength={2} pattern="[A-Za-z]{2}" value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} />
        </label>
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? text.creating : text.create}
        </button>
      </form>
      {error && (
        <div className="notice project-error" role="alert">
          <span>{error}</span>
          <button className="button button--ghost" type="button" onClick={() => void loadProjects()}>{text.retry}</button>
        </div>
      )}
      <div className="projects-list" aria-live="polite">
        {loading ? <div className="card empty-state" role="status">{text.loading}</div> : projects.length === 0 ? <div className="card empty-state">{text.empty}</div> : projects.map((project) => {
          const completedPhases = project.phases.filter((phase) => phase.status === "COMPLETED").length;
          const completedAssessments = project.assessments.filter((assessment) => assessment.status === "COMPLETED").length;
          const progress = Math.round((completedPhases / project.phases.length) * 100);
          const quality = assessProjectQuality(project.assessments);
          const analysisDone = project.phases.some((phase) => phase.type === "ANALYSIS" && phase.status === "COMPLETED");
          const feasibilityDone = project.phases.some((phase) => phase.type === "FEASIBILITY" && phase.status === "COMPLETED");
          const evaluationDone = quality.readyForDecision;
          const startDone = project.status === "IN_PROGRESS";
          const workflow = [
            [text.analysisStep, analysisDone],
            [text.feasibilityStep, feasibilityDone],
            [text.evaluationStep, evaluationDone],
            [text.startStep, startDone],
          ] as const;
          return (
          <article className="card project-list-item" key={project.id}>
            <div>
              <h3>{project.name}</h3>
              <p>{project.sector || "-"}{project.countryCode ? ` · ${project.countryCode}` : ""}</p>
            </div>
            <dl>
              <div><dt>{text.status}</dt><dd>{project.status === "DRAFT" ? text.draft : project.status}</dd></div>
              <div><dt>{text.phase}</dt><dd>{project.currentPhase}</dd></div>
              <div><dt>{text.assessments}</dt><dd>{completedAssessments}/6</dd></div>
            </dl>
            <div className="project-workflow" aria-label={text.workflow}>
              <strong>{text.workflow}</strong>
              <div className="project-workflow__steps">
                {workflow.map(([label, done], index) => {
                  const previousDone = index === 0 || workflow[index - 1][1];
                  return <span className={done ? "is-complete" : previousDone ? "is-active" : "is-pending"} key={label}><i>{done ? "✓" : index + 1}</i>{label}<small>{done ? text.complete : previousDone ? text.active : text.pending}</small></span>;
                })}
              </div>
            </div>
            <div className="project-progress" aria-label={`${text.projectProgress}: ${progress}%`}>
              <div className="project-progress-label"><span>{text.projectProgress}</span><strong>{completedPhases}/{project.phases.length}</strong></div>
              <div className="project-progress-track"><span style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="project-quality" aria-label={`${text.quality}: ${quality.score}%`}>
              <div><span>{text.quality}</span><strong>{quality.score}%</strong></div>
              <small>{text.evidence}: {quality.completeness}%</small>
            </div>
            <div className="project-actions">
              <a className="button button--secondary" href={`/api/projects/${project.id}/report${intelligenceInput.query ? `?location=${encodeURIComponent(intelligenceInput.query)}&countryCode=${encodeURIComponent(intelligenceInput.countryCode)}&sector=${encodeURIComponent(intelligenceInput.sector)}` : ""}`} download>{text.report}</a>
              <button className="button button--ghost" type="button" onClick={() => window.print()}>{text.print}</button>
              <button className="button button--primary" type="button" disabled={quality.completeness < 100 || startingProjectId === project.id || project.status === "IN_PROGRESS"} onClick={() => void startProject(project.id)}>{startingProjectId === project.id ? text.starting : project.status === "IN_PROGRESS" ? text.start : text.start}</button>
              <button className="button button--secondary" type="button" disabled={evaluatingProjectId === project.id} onClick={() => void evaluateProject(project)}>{evaluatingProjectId === project.id ? text.evaluating : text.evaluate}</button>
            </div>
            <form className="project-assessment-form" onSubmit={recordAssessment}>
              <label><span>{text.assessmentType}</span><select value={assessmentProjectId === project.id ? assessment.type : "MARKET"} onChange={(event) => { setAssessmentProjectId(project.id); setAssessment((current) => ({ ...current, type: event.target.value as typeof current.type })); }}><option value="MARKET">MARKET</option><option value="FINANCIAL">FINANCIAL</option><option value="OPERATIONAL">OPERATIONAL</option><option value="RISK">RISK</option><option value="TECHNICAL">TECHNICAL</option><option value="COMPLIANCE">COMPLIANCE</option></select></label>
              <label><span>{text.score}</span><input required min="0" max="100" type="number" value={assessmentProjectId === project.id ? assessment.score : ""} onFocus={() => setAssessmentProjectId(project.id)} onChange={(event) => { setAssessmentProjectId(project.id); setAssessment((current) => ({ ...current, score: event.target.value })); }} /></label>
              <label><span>{text.summary}</span><input required maxLength={4000} value={assessmentProjectId === project.id ? assessment.summary : ""} onFocus={() => setAssessmentProjectId(project.id)} onChange={(event) => { setAssessmentProjectId(project.id); setAssessment((current) => ({ ...current, summary: event.target.value })); }} /></label>
              <label><span>{text.source}</span><input required maxLength={500} value={assessmentProjectId === project.id ? assessment.source : ""} onFocus={() => setAssessmentProjectId(project.id)} onChange={(event) => { setAssessmentProjectId(project.id); setAssessment((current) => ({ ...current, source: event.target.value })); }} /></label>
              <button className="button button--secondary" type="submit" disabled={recordingAssessment}>{recordingAssessment ? text.recording : text.record}</button>
            </form>
            {evaluation?.projectId === project.id && <div className="notice" role="status"><strong>{text.verdict}: {evaluation.verdict}</strong><span>{evaluation.score}% · {evaluation.completeness}%</span></div>}
          </article>
          );
        })}
      </div>
      <section className="project-calculator" aria-labelledby="project-calculator-title">
        <div className="section-heading">
          <span className="eyebrow eyebrow--small">{text.calculator}</span>
          <h2 id="project-calculator-title">{text.calculator}</h2>
        </div>
        <form className="card project-calculator-form" onSubmit={calculate}>
          {([
            ["initialInvestment", text.investment], ["monthlyFixedCosts", text.fixedCosts], ["variableCostPerUnit", text.variableCost], ["pricePerUnit", text.unitPrice], ["monthlyUnits", text.units], ["months", text.months],
          ] as const).map(([key, label]) => (
            <label key={key}><span>{label}</span><input required min="0" step="any" type="number" value={financials[key]} onChange={(event) => setFinancials((current) => ({ ...current, [key]: event.target.value }))} /></label>
          ))}
          <button className="button button--primary" type="submit" disabled={calculating}>{calculating ? text.calculating : text.calculate}</button>
        </form>
        {calculation && (
          <div className="project-calculation-result" aria-live="polite">
            {([[text.breakEven, calculation.base.breakEvenUnits], [text.monthlyProfit, calculation.base.monthlyProfit], [text.roi, Number.isFinite(calculation.base.roiPercent) ? `${calculation.base.roiPercent.toFixed(1)}%` : "-"], [text.payback, calculation.base.paybackMonths === null ? "-" : `${calculation.base.paybackMonths.toFixed(1)}`]] as const).map(([label, value]) => <div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
            <div className="card project-scenarios"><h3>{text.scenario}</h3>{calculation.scenarios.map((item) => <div key={item.scenario}><span>{item.scenario}</span><strong>{item.monthlyProfit.toFixed(2)} · {Number.isFinite(item.roiPercent) ? `${item.roiPercent.toFixed(1)}%` : "-"}</strong></div>)}</div>
          </div>
        )}
      </section>
      <section className="project-intelligence" aria-labelledby="project-intelligence-title">
        <div className="section-heading"><span className="eyebrow eyebrow--small">{text.intelligence}</span><h2 id="project-intelligence-title">{text.intelligence}</h2></div>
        <form className="card project-intelligence-form" onSubmit={searchIntelligence}>
          <label><span>{text.project}</span><select value={intelligenceProjectId} onChange={(event) => setIntelligenceProjectId(event.target.value)}><option value="">-</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          {([ ["query", text.location], ["countryCode", text.country], ["sector", text.sector], ["latitude", text.latitude], ["longitude", text.longitude] ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input required={key === "query"} inputMode={key === "latitude" || key === "longitude" ? "decimal" : undefined} value={intelligenceInput[key]} onChange={(event) => setIntelligenceInput((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          <button className="button button--primary" type="submit" disabled={intelligenceLoading}>{intelligenceLoading ? text.searching : text.search}</button>
        </form>
        {intelligence && <div className="card project-intelligence-result" aria-live="polite"><div className="project-intelligence-metrics"><div><span>{text.population}</span><strong>{intelligence.population.value === null ? "-" : intelligence.population.value.toLocaleString()}</strong><small>{intelligence.population.year ?? ""}</small></div><div><span>{text.purchasingPower}</span><strong>{intelligence.purchasingPower.value === null ? "-" : intelligence.purchasingPower.value.toLocaleString()}</strong><small>{intelligence.purchasingPower.year ?? ""}</small></div><div><span>{text.competitors}</span><strong>{intelligence.competitors.length}</strong></div></div><p>{intelligence.location ? `${intelligence.location.label} · ${intelligence.location.latitude.toFixed(5)}, ${intelligence.location.longitude.toFixed(5)}` : text.location}</p>{intelligence.location && <a href={`https://www.openstreetmap.org/?mlat=${intelligence.location.latitude}&mlon=${intelligence.location.longitude}#map=14/${intelligence.location.latitude}/${intelligence.location.longitude}`} target="_blank" rel="noreferrer">Open map</a>}<div className="project-competitors">{intelligence.competitors.slice(0, 10).map((competitor) => <span key={`${competitor.name}-${competitor.category}`}>{competitor.name} · {competitor.category}</span>)}</div><small>{intelligence.sources.map((source) => `${source.source} (${source.confidence})`).join(" · ")}</small>{intelligence.limitations.length > 0 && <div className="notice"><strong>{text.limitations}</strong><ul>{intelligence.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>}</div>}
      </section>
    </section>
  );
}
