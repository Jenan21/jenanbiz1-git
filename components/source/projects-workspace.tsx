"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/types/i18n";
import { assessProjectQuality } from "@/services/projects/project-quality";
import {
  projectAssessmentTypes,
  projectPhasePlan,
} from "@/services/projects/project-lifecycle";

type ProjectPhaseStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "BLOCKED"
  | "SKIPPED";
type ProjectPhaseType =
  | "ANALYSIS"
  | "FEASIBILITY"
  | "EVALUATION"
  | "PLANNING"
  | "EXECUTION"
  | "REVIEW"
  | "COMPLETION";
type ProjectAssessmentType =
  | "MARKET"
  | "FINANCIAL"
  | "OPERATIONAL"
  | "RISK"
  | "TECHNICAL"
  | "COMPLIANCE";

type Project = {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  countryCode: string | null;
  currency: string;
  status: string;
  currentPhase: ProjectPhaseType;
  phases: Array<{
    type: ProjectPhaseType;
    title: string;
    sequence: number;
    status: ProjectPhaseStatus;
    notes: string | null;
  }>;
  assessments: Array<{
    type: ProjectAssessmentType;
    status: ProjectPhaseStatus;
    score: number | null;
    summary: string | null;
    source: string | null;
  }>;
};

const phaseStatuses: readonly ProjectPhaseStatus[] = [
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "BLOCKED",
  "SKIPPED",
] as const;

const copy = {
  ar: {
    title: "مشاريعك",
    createTitle: "إنشاء مشروع",
    name: "اسم المشروع",
    description: "الوصف",
    sector: "القطاع",
    country: "رمز الدولة",
    currency: "العملة",
    create: "إنشاء مشروع",
    creating: "جارٍ الإنشاء...",
    empty: "لا توجد مشاريع بعد. ابدأ بإضافة فكرتك الأولى.",
    loading: "جارٍ تحميل المشاريع...",
    error: "تعذر تنفيذ العملية على المشاريع.",
    retry: "إعادة المحاولة",
    helper: "ابدأ بالاسم والوصف والقطاع ثم أكمل التقييمات ومراحل التنفيذ من نفس المساحة.",
    phase: "المرحلة الحالية",
    assessments: "التقييمات المكتملة",
    status: "الحالة",
    draft: "مسودة",
    projectProgress: "تقدم المشروع",
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
    scenario: "السيناريوهات",
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
    manage: "إدارة المشروع",
    managing: "جارٍ الحفظ...",
    selected: "المشروع المحدد",
    phasePlan: "خطة المراحل",
    phaseUpdate: "تحديث مرحلة",
    phaseNotes: "ملاحظات المرحلة",
    savePhase: "حفظ المرحلة",
    assessmentUpdate: "تحديث تقييم",
    assessmentType: "نوع التقييم",
    assessmentScore: "الدرجة",
    assessmentSummary: "ملخص موثق",
    assessmentSource: "المصدر",
    saveAssessment: "حفظ التقييم",
    startProject: "بدء المشروع",
    startingProject: "جارٍ البدء...",
    decision: "جاهزية القرار",
    missing: "العناصر الناقصة",
    verdict: "النتيجة",
    openMap: "فتح الخريطة",
    projectSaved: "تم تحديث المشروع بنجاح.",
    ready: "جاهز",
    notReady: "غير مكتمل",
  },
  en: {
    title: "Your projects",
    createTitle: "Create project",
    name: "Project name",
    description: "Description",
    sector: "Sector",
    country: "Country code",
    currency: "Currency",
    create: "Create project",
    creating: "Creating...",
    empty: "No projects yet. Start by adding your first idea.",
    loading: "Loading projects...",
    error: "The project action could not be completed.",
    retry: "Try again",
    helper: "Start with the core details, then complete assessments and lifecycle steps from the same workspace.",
    phase: "Current phase",
    assessments: "Completed assessments",
    status: "Status",
    draft: "Draft",
    projectProgress: "Project progress",
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
    scenario: "Scenarios",
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
    manage: "Manage project",
    managing: "Saving...",
    selected: "Selected project",
    phasePlan: "Phase plan",
    phaseUpdate: "Update phase",
    phaseNotes: "Phase notes",
    savePhase: "Save phase",
    assessmentUpdate: "Update assessment",
    assessmentType: "Assessment type",
    assessmentScore: "Score",
    assessmentSummary: "Verified summary",
    assessmentSource: "Source",
    saveAssessment: "Save assessment",
    startProject: "Start project",
    startingProject: "Starting...",
    decision: "Decision readiness",
    missing: "Missing items",
    verdict: "Verdict",
    openMap: "Open map",
    projectSaved: "Project updated successfully.",
    ready: "Ready",
    notReady: "Incomplete",
  },
} as const;

function createAssessmentDraft(project: Project, type: ProjectAssessmentType) {
  const current = project.assessments.find((assessment) => assessment.type === type);
  return {
    type,
    score: current?.score === null || current?.score === undefined ? "" : String(current.score),
    summary: current?.summary ?? "",
    source: current?.source ?? "",
  };
}

function createPhaseDraft(project: Project) {
  const current = project.phases.find((phase) => phase.type === project.currentPhase);
  return {
    phaseType: project.currentPhase,
    status: current?.status ?? "ACTIVE",
    notes: current?.notes ?? "",
  };
}

export function ProjectsWorkspace({ locale }: { locale: Locale }) {
  const language = locale === "ar" ? "ar" : "en";
  const text = copy[language];
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingPhase, setSavingPhase] = useState(false);
  const [savingAssessment, setSavingAssessment] = useState(false);
  const [startingProjectId, setStartingProjectId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [phaseDraft, setPhaseDraft] = useState<{
    phaseType: ProjectPhaseType;
    status: ProjectPhaseStatus;
    notes: string;
  }>({ phaseType: "ANALYSIS", status: "ACTIVE", notes: "" });
  const [assessmentDraft, setAssessmentDraft] = useState<{
    type: ProjectAssessmentType;
    score: string;
    summary: string;
    source: string;
  }>({ type: "MARKET", score: "", summary: "", source: "" });
  const [calculating, setCalculating] = useState(false);
  const [calculation, setCalculation] = useState<{
    base: {
      breakEvenUnits: number;
      monthlyProfit: number;
      roiPercent: number;
      paybackMonths: number | null;
    };
    scenarios: Array<{
      scenario: string;
      monthlyProfit: number;
      roiPercent: number;
    }>;
  } | null>(null);
  const [financials, setFinancials] = useState({
    initialInvestment: "",
    monthlyFixedCosts: "",
    variableCostPerUnit: "",
    pricePerUnit: "",
    monthlyUnits: "",
    months: "12",
  });
  const [intelligenceInput, setIntelligenceInput] = useState({
    query: "",
    countryCode: "",
    sector: "",
    latitude: "",
    longitude: "",
  });
  const [intelligenceProjectId, setIntelligenceProjectId] = useState("");
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligence, setIntelligence] = useState<{
    location: { label: string; latitude: number; longitude: number } | null;
    population: { value: number | null; year: number | null };
    purchasingPower: { value: number | null; year: number | null };
    competitors: Array<{ name: string; category: string }>;
    sources: Array<{ source: string; confidence: string }>;
    limitations: string[];
  } | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedQuality = useMemo(
    () =>
      selectedProject
        ? assessProjectQuality(selectedProject.assessments)
        : null,
    [selectedProject],
  );

  const syncSelectedProject = useCallback((
    nextProjects: Project[],
    preferredId?: string,
    preferredAssessmentType?: ProjectAssessmentType,
  ) => {
    const fallbackId =
      preferredId && nextProjects.some((project) => project.id === preferredId)
        ? preferredId
        : nextProjects[0]?.id ?? "";
    setSelectedProjectId(fallbackId);
    const current = nextProjects.find((project) => project.id === fallbackId);
    if (!current) return;
    setPhaseDraft(createPhaseDraft(current));
    const assessmentType =
      preferredAssessmentType ??
      assessmentDraft.type ??
      projectAssessmentTypes[0];
    setAssessmentDraft(createAssessmentDraft(current, assessmentType));
  }, [assessmentDraft.type]);

  const loadProjects = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = (await response.json()) as {
        projects?: Project[];
        message?: string;
      };
      if (!response.ok) throw new Error(data.message ?? text.error);
      const nextProjects = data.projects ?? [];
      setProjects(nextProjects);
      syncSelectedProject(nextProjects, preferredId);
      return nextProjects;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : text.error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [syncSelectedProject, text.error]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          description,
          sector,
          countryCode,
          currency,
        }),
      });
      const data = (await response.json()) as {
        result?: Project;
        message?: string;
      };
      if (!response.ok || !data.result) throw new Error(data.message ?? text.error);
      setName("");
      setDescription("");
      setSector("");
      setCountryCode("");
      setCurrency("SAR");
      setMessage(text.projectSaved);
      await loadProjects(data.result.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : text.error);
    } finally {
      setSubmitting(false);
    }
  }

  async function savePhase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    setSavingPhase(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "updatePhase",
          projectId: selectedProject.id,
          phaseType: phaseDraft.phaseType,
          status: phaseDraft.status,
          notes: phaseDraft.notes.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? text.error);
      setMessage(text.projectSaved);
      await loadProjects(selectedProject.id);
    } catch (phaseError) {
      setError(phaseError instanceof Error ? phaseError.message : text.error);
    } finally {
      setSavingPhase(false);
    }
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    setSavingAssessment(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "recordAssessment",
          projectId: selectedProject.id,
          type: assessmentDraft.type,
          score: Number(assessmentDraft.score),
          summary: assessmentDraft.summary.trim(),
          source: assessmentDraft.source.trim(),
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? text.error);
      setMessage(text.projectSaved);
      await loadProjects(selectedProject.id);
    } catch (assessmentError) {
      setError(
        assessmentError instanceof Error ? assessmentError.message : text.error,
      );
    } finally {
      setSavingAssessment(false);
    }
  }

  async function startSelectedProject() {
    if (!selectedProject) return;
    setStartingProjectId(selectedProject.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          projectId: selectedProject.id,
        }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? text.error);
      setMessage(text.projectSaved);
      await loadProjects(selectedProject.id);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : text.error);
    } finally {
      setStartingProjectId("");
    }
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCalculating(true);
    setError("");
    try {
      const inputs = Object.fromEntries(
        Object.entries(financials).map(([key, value]) => [key, Number(value)]),
      );
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "calculateFeasibility", inputs }),
      });
      const data = (await response.json()) as {
        result?: typeof calculation;
        message?: string;
      };
      if (!response.ok || !data.result) throw new Error(data.message ?? text.error);
      setCalculation(data.result);
    } catch (calculationError) {
      setError(
        calculationError instanceof Error ? calculationError.message : text.error,
      );
    } finally {
      setCalculating(false);
    }
  }

  async function searchIntelligence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntelligenceLoading(true);
    setError("");
    try {
      const optionalNumber = (value: string) =>
        value.trim() ? Number(value) : undefined;
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "searchIntelligence",
          projectId: intelligenceProjectId || undefined,
          query: intelligenceInput.query,
          countryCode: intelligenceInput.countryCode || undefined,
          sector: intelligenceInput.sector || undefined,
          latitude: optionalNumber(intelligenceInput.latitude),
          longitude: optionalNumber(intelligenceInput.longitude),
        }),
      });
      const data = (await response.json()) as {
        result?: typeof intelligence;
        message?: string;
      };
      if (!response.ok || !data.result) throw new Error(data.message ?? text.error);
      setIntelligence(data.result);
    } catch (intelligenceError) {
      setError(
        intelligenceError instanceof Error ? intelligenceError.message : text.error,
      );
    } finally {
      setIntelligenceLoading(false);
    }
  }

  return (
    <section
      className="projects-workspace"
      aria-labelledby="projects-workspace-title"
      aria-busy={loading}
    >
      <div className="section-heading">
        <span className="eyebrow eyebrow--small">{text.title}</span>
        <h2 id="projects-workspace-title">{text.createTitle}</h2>
        <p>{text.helper}</p>
      </div>

      <form className="card project-create-form" onSubmit={submit}>
        <label>
          <span>{text.name}</span>
          <input
            aria-required="true"
            required
            minLength={2}
            maxLength={160}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>{text.description}</span>
          <input
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          <span>{text.sector}</span>
          <input
            maxLength={120}
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          />
        </label>
        <label>
          <span>{text.country}</span>
          <input
            maxLength={2}
            pattern="[A-Za-z]{2}"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          <span>{text.currency}</span>
          <input
            required
            maxLength={3}
            pattern="[A-Za-z]{3}"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </label>
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? text.creating : text.create}
        </button>
      </form>

      {(error || message) && (
        <div
          className={`notice project-error ${error ? "project-error--danger" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || message}</span>
          {error && (
            <button
              className="button button--ghost"
              type="button"
              onClick={() => void loadProjects(selectedProjectId)}
            >
              {text.retry}
            </button>
          )}
        </div>
      )}

      <div className="projects-list" aria-live="polite">
        {loading ? (
          <div className="card empty-state" role="status">
            {text.loading}
          </div>
        ) : projects.length === 0 ? (
          <div className="card empty-state">{text.empty}</div>
        ) : (
          projects.map((project) => {
            const completedPhases = project.phases.filter(
              (phase) => phase.status === "COMPLETED",
            ).length;
            const completedAssessments = project.assessments.filter(
              (assessment) => assessment.status === "COMPLETED",
            ).length;
            const progress = Math.round(
              (completedPhases / project.phases.length) * 100,
            );
            const quality = assessProjectQuality(project.assessments);

            return (
              <article
                className={`card project-list-item ${
                  project.id === selectedProjectId ? "project-list-item--active" : ""
                }`}
                key={project.id}
              >
                <div>
                  <h3>{project.name}</h3>
                  <p>
                    {project.sector || "-"}
                    {project.countryCode ? ` · ${project.countryCode}` : ""}
                    {project.currency ? ` · ${project.currency}` : ""}
                  </p>
                  {project.description && <p>{project.description}</p>}
                </div>
                <dl>
                  <div>
                    <dt>{text.status}</dt>
                    <dd>{project.status === "DRAFT" ? text.draft : project.status}</dd>
                  </div>
                  <div>
                    <dt>{text.phase}</dt>
                    <dd>{project.currentPhase}</dd>
                  </div>
                  <div>
                    <dt>{text.assessments}</dt>
                    <dd>
                      {completedAssessments}/{projectAssessmentTypes.length}
                    </dd>
                  </div>
                </dl>
                <div className="project-progress" aria-label={`${text.projectProgress}: ${progress}%`}>
                  <div className="project-progress-label">
                    <span>{text.projectProgress}</span>
                    <strong>
                      {completedPhases}/{project.phases.length}
                    </strong>
                  </div>
                  <div className="project-progress-track">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="project-quality" aria-label={`${text.quality}: ${quality.score}%`}>
                  <div>
                    <span>{text.quality}</span>
                    <strong>{quality.score}%</strong>
                  </div>
                  <small>
                    {text.evidence}: {quality.completeness}%
                  </small>
                </div>
                <div className="project-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    onClick={() => syncSelectedProject(projects, project.id)}
                  >
                    {text.manage}
                  </button>
                  <a
                    className="button button--secondary"
                    href={`/api/projects/${project.id}/report${
                      intelligenceInput.query
                        ? `?location=${encodeURIComponent(
                            intelligenceInput.query,
                          )}&countryCode=${encodeURIComponent(
                            intelligenceInput.countryCode,
                          )}&sector=${encodeURIComponent(intelligenceInput.sector)}`
                        : ""
                    }`}
                    download
                  >
                    {text.report}
                  </a>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => window.print()}
                  >
                    {text.print}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {selectedProject && selectedQuality && (
        <section className="project-operations" aria-labelledby="project-operations-title">
          <div className="section-heading">
            <span className="eyebrow eyebrow--small">{text.selected}</span>
            <h2 id="project-operations-title">{selectedProject.name}</h2>
            <p>
              {selectedProject.status} · {selectedProject.currentPhase}
            </p>
          </div>

          <div className="project-operations-grid">
            <section className="card project-readiness-card">
              <div className="project-readiness-card__top">
                <div>
                  <span>{text.quality}</span>
                  <strong>{selectedQuality.score}%</strong>
                </div>
                <div>
                  <span>{text.decision}</span>
                  <strong>
                    {selectedQuality.readyForDecision ? text.ready : text.notReady}
                  </strong>
                </div>
              </div>
              <div className="project-readiness-card__meta">
                <span>
                  {text.evidence}: {selectedQuality.completeness}%
                </span>
                <span>
                  {text.verdict}: {selectedQuality.verdict}
                </span>
              </div>
              <div className="project-missing-list">
                <strong>{text.missing}</strong>
                <div>
                  {selectedQuality.missing.length === 0
                    ? text.ready
                    : selectedQuality.missing.join(" · ")}
                </div>
              </div>
              <button
                className="button button--primary"
                type="button"
                disabled={
                  startingProjectId === selectedProject.id ||
                  !selectedQuality.readyForDecision
                }
                onClick={() => void startSelectedProject()}
              >
                {startingProjectId === selectedProject.id
                  ? text.startingProject
                  : text.startProject}
              </button>
            </section>

            <section className="card project-phase-card">
              <div className="project-card-heading">
                <h3>{text.phaseUpdate}</h3>
                <span>{text.phasePlan}</span>
              </div>
              <form className="project-operations-form" onSubmit={savePhase}>
                <label>
                  <span>{text.phase}</span>
                  <select
                    value={phaseDraft.phaseType}
                    onChange={(event) =>
                      setPhaseDraft((current) => ({
                        ...current,
                        phaseType: event.target.value as ProjectPhaseType,
                      }))
                    }
                  >
                    {projectPhasePlan.map((phase) => (
                      <option key={phase.type} value={phase.type}>
                        {phase.type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{text.status}</span>
                  <select
                    value={phaseDraft.status}
                    onChange={(event) =>
                      setPhaseDraft((current) => ({
                        ...current,
                        status: event.target.value as ProjectPhaseStatus,
                      }))
                    }
                  >
                    {phaseStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="project-operations-form__full">
                  <span>{text.phaseNotes}</span>
                  <textarea
                    rows={3}
                    value={phaseDraft.notes}
                    onChange={(event) =>
                      setPhaseDraft((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={savingPhase}
                >
                  {savingPhase ? text.managing : text.savePhase}
                </button>
              </form>
              <div className="project-phase-list">
                {selectedProject.phases.map((phase) => (
                  <div className="project-phase-row" key={phase.type}>
                    <strong>{phase.type}</strong>
                    <span>{phase.status}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card project-assessment-card">
              <div className="project-card-heading">
                <h3>{text.assessmentUpdate}</h3>
                <span>{selectedProject.assessments.length}/{projectAssessmentTypes.length}</span>
              </div>
              <form className="project-operations-form" onSubmit={saveAssessment}>
                <label>
                  <span>{text.assessmentType}</span>
                  <select
                    value={assessmentDraft.type}
                    onChange={(event) => {
                      const nextType = event.target.value as ProjectAssessmentType;
                      setAssessmentDraft(createAssessmentDraft(selectedProject, nextType));
                    }}
                  >
                    {projectAssessmentTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{text.assessmentScore}</span>
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentDraft.score}
                    onChange={(event) =>
                      setAssessmentDraft((current) => ({
                        ...current,
                        score: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="project-operations-form__full">
                  <span>{text.assessmentSummary}</span>
                  <textarea
                    required
                    rows={3}
                    value={assessmentDraft.summary}
                    onChange={(event) =>
                      setAssessmentDraft((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="project-operations-form__full">
                  <span>{text.assessmentSource}</span>
                  <input
                    required
                    value={assessmentDraft.source}
                    onChange={(event) =>
                      setAssessmentDraft((current) => ({
                        ...current,
                        source: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={savingAssessment}
                >
                  {savingAssessment ? text.managing : text.saveAssessment}
                </button>
              </form>
            </section>
          </div>
        </section>
      )}

      <section className="project-calculator" aria-labelledby="project-calculator-title">
        <div className="section-heading">
          <span className="eyebrow eyebrow--small">{text.calculator}</span>
          <h2 id="project-calculator-title">{text.calculator}</h2>
        </div>
        <form className="card project-calculator-form" onSubmit={calculate}>
          {(
            [
              ["initialInvestment", text.investment],
              ["monthlyFixedCosts", text.fixedCosts],
              ["variableCostPerUnit", text.variableCost],
              ["pricePerUnit", text.unitPrice],
              ["monthlyUnits", text.units],
              ["months", text.months],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                required
                min="0"
                step="any"
                type="number"
                value={financials[key]}
                onChange={(event) =>
                  setFinancials((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <button className="button button--primary" type="submit" disabled={calculating}>
            {calculating ? text.calculating : text.calculate}
          </button>
        </form>
        {calculation && (
          <div className="project-calculation-result" aria-live="polite">
            {(
              [
                [text.breakEven, calculation.base.breakEvenUnits],
                [text.monthlyProfit, calculation.base.monthlyProfit],
                [text.roi, `${calculation.base.roiPercent.toFixed(1)}%`],
                [
                  text.payback,
                  calculation.base.paybackMonths === null
                    ? "-"
                    : `${calculation.base.paybackMonths.toFixed(1)}`,
                ],
              ] as const
            ).map(([label, value]) => (
              <div className="card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
            <div className="card project-scenarios">
              <h3>{text.scenario}</h3>
              {calculation.scenarios.map((item) => (
                <div key={item.scenario}>
                  <span>{item.scenario}</span>
                  <strong>
                    {item.monthlyProfit.toFixed(2)} · {item.roiPercent.toFixed(1)}%
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="project-intelligence" aria-labelledby="project-intelligence-title">
        <div className="section-heading">
          <span className="eyebrow eyebrow--small">{text.intelligence}</span>
          <h2 id="project-intelligence-title">{text.intelligence}</h2>
        </div>
        <form className="card project-intelligence-form" onSubmit={searchIntelligence}>
          <label>
            <span>{text.project}</span>
            <select
              value={intelligenceProjectId}
              onChange={(event) => setIntelligenceProjectId(event.target.value)}
            >
              <option value="">-</option>
              {projects.map((project) => (
                <option value={project.id} key={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["query", text.location],
              ["countryCode", text.country],
              ["sector", text.sector],
              ["latitude", text.latitude],
              ["longitude", text.longitude],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                required={key === "query"}
                inputMode={
                  key === "latitude" || key === "longitude" ? "decimal" : undefined
                }
                value={intelligenceInput[key]}
                onChange={(event) =>
                  setIntelligenceInput((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
          <button
            className="button button--primary"
            type="submit"
            disabled={intelligenceLoading}
          >
            {intelligenceLoading ? text.searching : text.search}
          </button>
        </form>
        {intelligence && (
          <div className="card project-intelligence-result" aria-live="polite">
            <div className="project-intelligence-metrics">
              <div>
                <span>{text.population}</span>
                <strong>
                  {intelligence.population.value === null
                    ? "-"
                    : intelligence.population.value.toLocaleString()}
                </strong>
                <small>{intelligence.population.year ?? ""}</small>
              </div>
              <div>
                <span>{text.purchasingPower}</span>
                <strong>
                  {intelligence.purchasingPower.value === null
                    ? "-"
                    : intelligence.purchasingPower.value.toLocaleString()}
                </strong>
                <small>{intelligence.purchasingPower.year ?? ""}</small>
              </div>
              <div>
                <span>{text.competitors}</span>
                <strong>{intelligence.competitors.length}</strong>
              </div>
            </div>
            <p>
              {intelligence.location
                ? `${intelligence.location.label} · ${intelligence.location.latitude.toFixed(5)}, ${intelligence.location.longitude.toFixed(5)}`
                : text.location}
            </p>
            {intelligence.location && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${intelligence.location.latitude}&mlon=${intelligence.location.longitude}#map=14/${intelligence.location.latitude}/${intelligence.location.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {text.openMap}
              </a>
            )}
            <div className="project-competitors">
              {intelligence.competitors.slice(0, 10).map((competitor) => (
                <span key={`${competitor.name}-${competitor.category}`}>
                  {competitor.name} · {competitor.category}
                </span>
              ))}
            </div>
            <small>
              {intelligence.sources
                .map((source) => `${source.source} (${source.confidence})`)
                .join(" · ")}
            </small>
            {intelligence.limitations.length > 0 && (
              <div className="notice">
                <strong>{text.limitations}</strong>
                <ul>
                  {intelligence.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
