"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ProjectComplianceWorkspace,
  ProjectVendorWorkspace,
  type ProjectComplianceRecord,
  type ProjectVendorRecord,
} from "@/components/projects/project-launch-records";
import type { Locale } from "@/types/i18n";
import type { ProjectFocus } from "@/lib/projects/project-flow-routes";
import { assessProjectQuality } from "@/services/projects/project-quality";
import { assessProjectReadiness } from "@/services/projects/project-readiness";
import type { FeasibilityResult } from "@/services/projects/project-calculations";

const ProjectIntelligenceMap = dynamic(
  () =>
    import("@/components/projects/project-intelligence-map").then(
      (module) => module.ProjectIntelligenceMap,
    ),
  {
    ssr: false,
    loading: () => <p className="project-map__loading">Loading map...</p>,
  },
);

type PhaseType =
  | "ANALYSIS"
  | "FEASIBILITY"
  | "EVALUATION"
  | "PLANNING"
  | "EXECUTION"
  | "REVIEW"
  | "COMPLETION";
type PhaseStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "BLOCKED" | "SKIPPED";
type AssessmentType =
  "MARKET" | "FINANCIAL" | "OPERATIONAL" | "RISK" | "TECHNICAL" | "COMPLIANCE";
type ProjectPhase = {
  id: string;
  type: PhaseType;
  title: string;
  sequence: number;
  status: PhaseStatus;
  notes: string | null;
};
type ProjectAssessment = {
  id: string;
  type: AssessmentType;
  score: number | null;
  status: PhaseStatus;
  summary: string | null;
  source: string | null;
  assessedAt: string | null;
  evidenceFiles: Array<{
    fileAssetId: string;
    createdAt: string;
    fileAsset: Pick<EvidenceFile, "id" | "fileName" | "mimeType" | "checksum" | "createdAt">;
  }>;
};
type ProjectDecision = {
  id: string;
  verdict: "APPROVE" | "REJECT" | "RETURN_FOR_REVIEW";
  weightedScore: number;
  rationale: string;
  createdAt: string;
  evidenceSnapshot: unknown;
};
type ProjectFinancialPlan = { id: string; version: number; createdAt: string; inputs: Record<string, number>; baseCase: FeasibilityResult & { sensitivity?: SensitivityResult[] }; scenarios: ScenarioResult[] };
type ProjectRisk = {
  id: string;
  category: string;
  title: string;
  likelihood: number;
  impact: number;
  score: number;
  status: "OPEN" | "MITIGATING" | "ACCEPTED" | "CLOSED";
  mitigation: string;
  ownerLabel: string;
  reviewAt: string | null;
};
type EvidenceFile = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  checksum: string | null;
  createdAt: string;
};
type ProjectMember = {
  id: string;
  role: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
  user: { email: string; profile: { displayName: string | null } | null };
};
type Intelligence = {
  location: { latitude: number; longitude: number; label: string } | null;
  population: { value: number | null; year: number | null };
  purchasingPower: { value: number | null; year: number | null };
  costInflation: { value: number | null; year: number | null; metric: string };
  competitors: Array<{
    name: string;
    category: string;
    latitude: number;
    longitude: number;
  }>;
  sources: Array<{ source: string; url: string; fetchedAt: string; confidence: string }>;
  limitations: string[];
};
type Project = {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  countryCode: string | null;
  currency: string;
  status: string;
  currentPhase: PhaseType;
  phases: ProjectPhase[];
  assessments: ProjectAssessment[];
  intelligenceSnapshots: Intelligence[];
  decisions: ProjectDecision[];
  financialPlans: ProjectFinancialPlan[];
  risks: ProjectRisk[];
  complianceItems: ProjectComplianceRecord[];
  vendors: ProjectVendorRecord[];
  evidenceFiles: EvidenceFile[];
  members: ProjectMember[];
};
type Quality = {
  score: number;
  completeness: number;
  readyForDecision: boolean;
  verdict: "APPROVE" | "REVIEW" | "REJECT" | "INCOMPLETE";
};
type Feasibility = FeasibilityResult;
type SensitivityResult = { driver: string; changePercent: number; netPresentValue: number; npvDelta: number };
type ScenarioResult = Feasibility & {
  scenario: "PESSIMISTIC" | "EXPECTED" | "OPTIMISTIC";
};
type Risk = { score: number; level: "LOW" | "MEDIUM" | "HIGH" };

const assessmentTypes: AssessmentType[] = [
  "MARKET",
  "FINANCIAL",
  "OPERATIONAL",
  "RISK",
  "TECHNICAL",
  "COMPLIANCE",
];
const phaseNames: Record<PhaseType, [string, string]> = {
  ANALYSIS: ["التحليل", "Analysis"],
  FEASIBILITY: ["الجدوى", "Feasibility"],
  EVALUATION: ["التقييم", "Evaluation"],
  PLANNING: ["التخطيط", "Planning"],
  EXECUTION: ["التنفيذ", "Execution"],
  REVIEW: ["المراجعة", "Review"],
  COMPLETION: ["الإغلاق", "Completion"],
};
const assessmentNames: Record<AssessmentType, [string, string]> = {
  MARKET: ["السوق", "Market"],
  FINANCIAL: ["المالي", "Financial"],
  OPERATIONAL: ["التشغيل", "Operational"],
  RISK: ["المخاطر", "Risk"],
  TECHNICAL: ["التقني", "Technical"],
  COMPLIANCE: ["الامتثال", "Compliance"],
};
const financialLabels: Record<string, [string, string]> = {
  initialInvestment: ["الاستثمار الأولي", "Initial investment"],
  monthlyFixedCosts: ["التكاليف الثابتة الشهرية", "Monthly fixed costs"],
  variableCostPerUnit: ["التكلفة المتغيرة للوحدة", "Variable cost per unit"],
  pricePerUnit: ["سعر الوحدة", "Price per unit"],
  monthlyUnits: ["الوحدات الشهرية", "Monthly units"],
  months: ["عدد الأشهر", "Months"],
  annualDiscountRate: ["نسبة الخصم السنوية %", "Annual discount rate %"],
  annualInflationRate: ["التضخم السنوي %", "Annual inflation rate %"],
  taxRate: ["الضريبة %", "Tax rate %"],
};
const riskLabels: Record<string, [string, string]> = {
  market: ["مخاطر السوق", "Market risk"],
  financial: ["مخاطر مالية", "Financial risk"],
  operational: ["مخاطر تشغيلية", "Operational risk"],
  technical: ["مخاطر تقنية", "Technical risk"],
  compliance: ["مخاطر امتثال", "Compliance risk"],
};
const focusSelectors: Record<ProjectFocus, string> = {
  assessment: "article[data-project-focus='assessment']",
  compliance: ".project-compliance",
  create: ".project-create-form",
  evidence: ".project-evidence-library",
  feasibility: ".project-calculator",
  governance: ".project-governance",
  intelligence: ".project-intelligence",
  launch: ".project-flow > .project-actions:last-child",
  report: ".project-workflow a[href$='/report']",
  risk: ".project-risk",
  team: ".project-members",
  vendors: ".project-vendors",
  workflow: ".project-workflow",
};

function qualityFor(project: Project | undefined): Quality {
  return assessProjectQuality(project?.assessments ?? []);
}

function statusClass(status: PhaseStatus) {
  return status === "COMPLETED"
    ? "is-complete"
    : status === "ACTIVE"
      ? "is-active"
      : "is-pending";
}

export function ProjectsWorkspace({
  focus = "workflow",
  kind = "workspace",
  locale,
  route = "/projects",
}: {
  focus?: ProjectFocus;
  kind?: string;
  locale: Locale;
  route?: string;
}) {
  const ar = locale === "ar";
  const [projects, setProjects] = useState<Project[]>([]);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [projectName, setProjectName] = useState("");
  const [sector, setSector] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [description, setDescription] = useState("");
  const [assessmentType, setAssessmentType] =
    useState<AssessmentType>("MARKET");
  const [assessmentScore, setAssessmentScore] = useState("");
  const [assessmentSummary, setAssessmentSummary] = useState("");
  const [assessmentSource, setAssessmentSource] = useState("");
  const [assessmentEvidenceSelections, setAssessmentEvidenceSelections] = useState<Record<string, string[]>>({});
  const [phaseNotes, setPhaseNotes] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [intelligenceByProject, setIntelligenceByProject] = useState<
    Record<string, Intelligence>
  >({});
  const [risk, setRisk] = useState<Risk | null>(null);
  const [financials, setFinancials] = useState({
    initialInvestment: "",
    monthlyFixedCosts: "",
    variableCostPerUnit: "",
    pricePerUnit: "",
    monthlyUnits: "",
    months: "",
    annualDiscountRate: "",
    annualInflationRate: "",
    taxRate: "",
  });
  const [riskFactors, setRiskFactors] = useState({
    market: "",
    financial: "",
    operational: "",
    technical: "",
    compliance: "",
  });
  const [decisionRationale, setDecisionRationale] = useState("");
  const [riskRecord, setRiskRecord] = useState({
    category: "MARKET",
    title: "",
    likelihood: "3",
    impact: "3",
    mitigation: "",
    ownerLabel: "",
    reviewAt: "",
  });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<
    "EDITOR" | "REVIEWER" | "VIEWER"
  >("EDITOR");

  async function request<T>(
    body?: unknown,
    query?: URLSearchParams,
  ): Promise<T> {
    const url = query ? `/api/projects?${query.toString()}` : "/api/projects";
    const response = await fetch(
      url,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      result?: T;
      projects?: Project[];
      page?: { hasMore: boolean };
      message?: string;
    } | null;
    if (!response.ok || !payload?.success)
      throw new Error(
        payload?.message ??
          (ar
            ? "تعذر تنفيذ العملية."
            : "The operation could not be completed."),
      );
    return (body ? payload.result : payload.projects) as T;
  }

  async function load(offset = 0, append = false) {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: "20",
        offset: String(offset),
      });
      if (projectSearch.trim()) query.set("search", projectSearch.trim());
      if (projectStatusFilter) query.set("status", projectStatusFilter);
      const response = await fetch(`/api/projects?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        projects?: Project[];
        page?: { hasMore: boolean };
        message?: string;
      } | null;
      if (!response.ok || !payload?.success || !payload.projects)
        throw new Error(
          payload?.message ??
            (ar ? "تعذر تحميل المشاريع." : "Projects could not be loaded."),
        );
      const nextProjects = payload.projects;
      const mergedProjects = append
        ? [...projects, ...nextProjects]
        : nextProjects;
      setProjects(mergedProjects);
      setHasMoreProjects(Boolean(payload.page?.hasMore));
      setIntelligenceByProject(
        Object.fromEntries(
          mergedProjects.flatMap((project) =>
            project.intelligenceSnapshots[0]
              ? [[project.id, project.intelligenceSnapshots[0]]]
              : [],
          ),
        ),
      );
      setSelectedId((current) =>
        mergedProjects.some((project) => project.id === current)
          ? current
          : (mergedProjects[0]?.id ?? ""),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر تحميل المشاريع."
            : "Projects could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  const reloadForFilters = useEffectEvent(() => {
    void load();
  });
  const initialLoad = useRef(true);

  useEffect(() => {
    const timeout = window.setTimeout(
      reloadForFilters,
      initialLoad.current ? 0 : 250,
    );
    initialLoad.current = false;
    return () => window.clearTimeout(timeout);
  }, [projectSearch, projectStatusFilter]);

  useEffect(() => {
    if (loading) return;
    const timeout = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(focusSelectors[focus]);
      if (!target) return;
      const header = document.querySelector<HTMLElement>(".platform-header");
      target.style.scrollMarginTop = `${Math.ceil(header?.getBoundingClientRect().height ?? 0) + 26}px`;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [focus, loading, selectedId]);

  const selected = projects.find((project) => project.id === selectedId);
  const assessmentEvidenceSelectionKey = `${selectedId}:${assessmentType}`;
  const assessmentEvidenceFileIds = (
    assessmentEvidenceSelections[assessmentEvidenceSelectionKey] ??
    selected?.assessments.find((item) => item.type === assessmentType)?.evidenceFiles.map((item) => item.fileAssetId) ??
    []
  ).filter((id) => selected?.evidenceFiles.some((file) => file.id === id));
  const intelligence = selected
    ? (intelligenceByProject[selected.id] ?? null)
    : null;
  const quality = qualityFor(selected);
  const activePhase = selected?.phases.find(
    (phase) => phase.status === "ACTIVE",
  );
  const nextPhase = selected?.phases.find(
    (phase) => phase.status === "PENDING",
  );
  const latestDecision = selected?.decisions[0];
  const latestFinancialPlan = selected?.financialPlans[0];
  const feasibility = latestFinancialPlan?.baseCase?.modelVersion === "JENAN_FINANCE_V2" ? latestFinancialPlan.baseCase : null;
  const scenarios = feasibility ? latestFinancialPlan?.scenarios ?? [] : [];
  const readiness = selected ? assessProjectReadiness(selected) : null;
  const financialProjectId = selected?.id;
  const financialVersion = latestFinancialPlan?.version;
  const hydrateFinancialInputs = useEffectEvent(() => {
    const inputs = latestFinancialPlan?.inputs;
    setFinancials((current) => Object.fromEntries(Object.keys(current).map((key) => [key, typeof inputs?.[key] === "number" ? String(inputs[key]) : ""])) as typeof current);
    setRisk(null);
  });
  useEffect(() => {
    const timeout = window.setTimeout(hydrateFinancialInputs, 0);
    return () => window.clearTimeout(timeout);
  }, [financialProjectId, financialVersion]);
  const prerequisitesComplete = selected
    ? ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING"].every((type) =>
        selected.phases.some(
          (phase) => phase.type === type && phase.status === "COMPLETED",
        ),
      )
    : false;

  async function run(action: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      await request(action);
      setMessage(successMessage);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حفظ التغيير."
            : "The change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const project = await request<Project>({
        action: "create",
        name: projectName,
        description: description || undefined,
        sector: sector || undefined,
        countryCode: countryCode || undefined,
      });
      setProjectName("");
      setDescription("");
      setSector("");
      setCountryCode("");
      setProjects((current) => [project, ...current]);
      setSelectedId(project.id);
      setMessage(
        ar
          ? "تم إنشاء المشروع كمسودة مع مسار مراحل واضح."
          : "Project created as a draft with a defined delivery path.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر إنشاء المشروع."
            : "Project could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await run(
      {
        action: "recordAssessment",
        projectId: selected.id,
        type: assessmentType,
        score: Number(assessmentScore),
        summary: assessmentSummary,
        source: assessmentSource,
        evidenceFileIds: assessmentEvidenceFileIds,
      },
      ar ? "تم حفظ دليل التقييم." : "Assessment evidence saved.",
    );
    setAssessmentSummary("");
    setAssessmentSource("");
  }

  async function calculateFeasibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!selected) return;
      await request<{
        base: Feasibility;
        scenarios: ScenarioResult[];
      }>({
        action: "calculateFeasibility",
        projectId: selected.id,
        persist: true,
        inputs: Object.fromEntries(
          Object.entries(financials).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
      });
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حساب الجدوى."
            : "Feasibility could not be calculated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function calculateRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await request<Risk>({
        action: "calculateRisk",
        factors: Object.fromEntries(
          Object.entries(riskFactors).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
      });
      setRisk(result);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حساب المخاطر."
            : "Risk could not be calculated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function recordDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await run(
      {
        action: "recordDecision",
        projectId: selected.id,
        verdict:
          quality.verdict === "APPROVE" ? "APPROVE" : "RETURN_FOR_REVIEW",
        rationale: decisionRationale,
      },
      ar ? "تم توثيق قرار التقييم." : "Evaluation decision recorded.",
    );
    setDecisionRationale("");
  }

  async function createRiskRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await run(
      {
        action: "createRisk",
        projectId: selected.id,
        category: riskRecord.category,
        title: riskRecord.title,
        likelihood: Number(riskRecord.likelihood),
        impact: Number(riskRecord.impact),
        mitigation: riskRecord.mitigation,
        ownerLabel: riskRecord.ownerLabel,
        reviewAt: riskRecord.reviewAt
          ? new Date(riskRecord.reviewAt).toISOString()
          : undefined,
      },
      ar ? "تمت إضافة خطر وخطة تخفيفه." : "Risk and mitigation plan added.",
    );
    setRiskRecord((current) => ({
      ...current,
      title: "",
      mitigation: "",
      ownerLabel: "",
      reviewAt: "",
    }));
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !evidenceFile) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("projectId", selected.id);
      form.set("file", evidenceFile);
      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!response.ok)
        throw new Error(
          payload?.message ??
            (ar ? "تعذر حفظ ملف الدليل." : "Evidence file could not be saved."),
        );
      setEvidenceFile(null);
      await load();
      setMessage(
        ar
          ? "تم حفظ ملف الدليل مع المشروع."
          : "Evidence file saved with the project.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر حفظ ملف الدليل."
            : "Evidence file could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await run(
      {
        action: "addMember",
        projectId: selected.id,
        email: memberEmail,
        role: memberRole,
      },
      ar ? "تمت إضافة عضو المشروع." : "Project member added.",
    );
    setMemberEmail("");
  }

  async function searchIntelligence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await request<Intelligence>({
        action: "searchIntelligence",
        projectId: selected.id,
        query: locationQuery,
        countryCode: selected.countryCode ?? undefined,
        sector: selected.sector ?? undefined,
      });
      setIntelligenceByProject((current) => ({
        ...current,
        [selected.id]: result,
      }));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : ar
            ? "تعذر جلب بيانات السوق."
            : "Market intelligence could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  const screenLabels: Record<string, [string, string]> = {
    form: ["إدخال البيانات", "Data input"],
    progress: ["المعالجة", "Processing"],
    dashboard: ["النتيجة", "Result"],
    detail: ["التفاصيل", "Details"],
    report: ["التقرير", "Report"],
    map: ["الخريطة", "Map"],
    timeline: ["الخط الزمني", "Timeline"],
    checklist: ["قائمة التحقق", "Checklist"],
    wizard: ["المعالج", "Wizard"],
    workspace: ["مساحة العمل", "Workspace"],
  };
  const screenLabel = screenLabels[kind] ?? screenLabels.workspace;
  return (
    <section
      className="projects-workspace"
      aria-busy={loading || busy}
      aria-label={
        ar
          ? `${screenLabel[0]} لتقييم المشروع`
          : `${screenLabel[1]} for project evaluation`
      }
      data-project-view={focus}
      data-project-kind={kind}
      data-project-route={route}
    >
      <header className="section-heading projects-workspace__screen-heading">
        <div>
          <span className="eyebrow eyebrow--small">
            {ar ? screenLabel[0] : screenLabel[1]}
          </span>
          <h2>
            {ar ? "مساحة القرار والتنفيذ" : "Decision and delivery workspace"}
          </h2>
          <p>
            {ar
              ? "تظهر السجلات الفعلية فقط. لا يبدأ التنفيذ إلا بعد اكتمال الأدلة والمراحل المطلوبة."
              : "Only live records are shown. Execution begins only after evidence and prerequisite phases are complete."}
          </p>
        </div>
        <span className="projects-workspace__source-state">
          {ar ? "بيانات مصدرية" : "Sourced records"}
        </span>
      </header>
      <form
        className="project-create-form card"
        data-project-focus="create"
        hidden={focus !== "create"}
        onSubmit={createProject}
      >
        <label>
          {ar ? "اسم المشروع" : "Project name"}
          <input
            required
            minLength={2}
            maxLength={160}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
        </label>
        <label>
          {ar ? "القطاع" : "Sector"}
          <input
            maxLength={120}
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          />
        </label>
        <label>
          {ar ? "الدولة" : "Country"}
          <input
            maxLength={2}
            value={countryCode}
            onChange={(event) =>
              setCountryCode(event.target.value.toUpperCase())
            }
          />
        </label>
        <label>
          {ar ? "وصف موجز" : "Brief description"}
          <input
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <button
          className="button button--primary"
          type="submit"
          disabled={busy}
        >
          {ar ? "مشروع جديد" : "New project"}
        </button>
      </form>
      <div className="project-list-controls" hidden={focus === "create"}>
        <input
          aria-label={ar ? "بحث في المشاريع" : "Search projects"}
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
          placeholder={
            ar ? "ابحث بالاسم أو القطاع" : "Search by name or sector"
          }
        />
        <select
          aria-label={ar ? "حالة المشروع" : "Project status"}
          value={projectStatusFilter}
          onChange={(event) => setProjectStatusFilter(event.target.value)}
        >
          <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
          {[
            "DRAFT",
            "ANALYSIS",
            "FEASIBILITY",
            "EVALUATION",
            "APPROVED",
            "IN_PROGRESS",
            "ON_HOLD",
            "COMPLETED",
            "REJECTED",
            "ARCHIVED",
          ].map((status) => (
            <option value={status} key={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      {message ? (
        <p className="project-error" role="status">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="project-error">
          {ar ? "جارٍ تحميل المشاريع..." : "Loading projects..."}
        </p>
      ) : null}
      {!loading && !projects.length ? (
        <p className="project-error">
          {ar
            ? "ابدأ بإنشاء مشروع، ثم وثّق تقييماته ومراحله."
            : "Create a project to document assessments and move it through delivery."}
        </p>
      ) : null}
      <div className="projects-list" hidden={focus === "create"}>
        {projects.map((project) => (
          <article className="project-list-item card" key={project.id}>
            <div>
              <h3>{project.name}</h3>
              <p>
                {[project.sector, project.countryCode, project.status]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="project-quality">
              <div>
                <span>{ar ? "قرار التقييم" : "Decision"}</span>
                <strong>{qualityFor(project).verdict}</strong>
              </div>
              <small>
                {qualityFor(project).score}/100 ·{" "}
                {qualityFor(project).completeness}%
              </small>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setSelectedId(project.id)}
            >
              {selectedId === project.id
                ? ar
                  ? "المشروع النشط"
                  : "Active project"
                : ar
                  ? "فتح"
                  : "Open"}
            </button>
          </article>
        ))}
        {hasMoreProjects ? (
          <button
            className="button button--secondary project-load-more"
            type="button"
            disabled={loading || busy}
            onClick={() => void load(projects.length, true)}
          >
            {ar ? "تحميل المزيد" : "Load more"}
          </button>
        ) : null}
      </div>
      {selected && focus !== "create" ? (
        <div className="project-flow">
          <article className="card project-review-panel" aria-label={ar ? "فحص جودة المشروع" : "Project review checks"}>
            <header className="section-heading">
              <h3>{ar ? "فحص جودة الأدلة وجاهزية التنفيذ" : "Evidence review and delivery readiness"}</h3>
              <p>{ar ? "سجلات المستخدم وليست تحققاً مستقلاً. اكتمال البيانات أو بصمة الملف لا يثبت صحة المصدر ولا يضمن الاستثمار." : "User-recorded data, not independent verification. Completeness and file checksums do not prove source validity or guarantee an investment."}</p>
            </header>
            <div className="project-quality">
              <div><span>{ar ? "اكتمال الأدلة" : "Evidence completeness"}</span><strong>{readiness?.quality.completeness}%</strong></div>
              <div><span>{ar ? "أدلة ببصمة رقمية" : "Checksummed files"}</span><strong>{readiness?.checksummedFiles}/{readiness?.evidenceFiles}</strong></div>
              <div><span>{ar ? "مخاطر عالية مفتوحة" : "Open high risks"}</span><strong>{readiness?.highOpenRisks}</strong></div>
              <div><span>{ar ? "امتثال يحتاج متابعة" : "Pending compliance"}</span><strong>{readiness?.pendingCompliance}</strong></div>
            </div>
            <p>{ar ? "مراجعات مخاطر متأخرة" : "Overdue risk reviews"}: {readiness?.overdueRiskReviews} · {ar ? "مطابقة الاعتماد للأدلة الحالية" : "Approval matches current evidence"}: {readiness?.decisionCurrent ? (ar ? "نعم" : "Yes") : (ar ? "تحتاج مراجعة" : "Review required")}</p>
            <details>
              <summary>{ar ? "قائمة المراجعة قبل اتخاذ القرار" : "Review checklist before a decision"}</summary>
              <ul>
                <li>{ar ? "تحقق من المصدر وتاريخ جمع البيانات وافتراضات الطلب والتكاليف مع مختص." : "Validate sources, collection dates, demand and cost assumptions with a qualified reviewer."}</li>
                <li>{ar ? "راجع الضرائب والتراخيص والمخاطر والسيناريوهات؛ النتيجة ليست تصديقاً مهنياً مستقلاً." : "Review taxes, permits, risks and scenarios; the result is not independent professional certification."}</li>
                {readiness?.quality.missing.map((type) => <li key={type}>{ar ? `دليل ناقص أو غير صالح: ${assessmentNames[type][0]}` : `Missing or invalid evidence: ${assessmentNames[type][1]}`}</li>)}
                {readiness?.blockers.map((blocker) => <li key={blocker}>{({
                  INCOMPLETE_OR_UNAPPROVED_ASSESSMENTS: ar ? "أكمل أدلة التقييم ومراجعتها." : "Complete and review assessment evidence.",
                  NO_SAVED_FINANCIAL_PLAN: ar ? "احفظ دراسة مالية بمدخلات صريحة." : "Save a financial study with explicit inputs.",
                  NO_APPROVAL_DECISION: ar ? "سجل قرار اعتماد بشري موثق." : "Record a documented human approval.",
                  APPROVAL_REQUIRES_REVIEW: ar ? "تغيرت الأدلة أو النسخة المالية؛ أعد مراجعة الاعتماد." : "Evidence or financial version changed; review the approval.",
                  OPEN_HIGH_RISKS: ar ? "عالج المخاطر العالية المفتوحة." : "Address open high risks.",
                  INCOMPLETE_PREREQUISITE_PHASES: ar ? "أكمل مراحل التحليل والجدوى والتقييم والتخطيط." : "Complete analysis, feasibility, evaluation and planning.",
                } as Record<string, string>)[blocker]}</li>)}
              </ul>
            </details>
          </article>
          <article
            className="card project-workflow"
            data-project-focus={
              focus === "report"
                ? "report"
                : focus === "launch"
                  ? "launch"
                  : "workflow"
            }
            hidden={
              !(["workflow", "report", "launch"] as ProjectFocus[]).includes(
                focus,
              )
            }
          >
            <strong>{selected.name}</strong>
            <div className="project-workflow__steps">
              {selected.phases.map((phase) => (
                <span className={statusClass(phase.status)} key={phase.id}>
                  <i>{phase.sequence}</i>
                  <b>
                    {ar ? phaseNames[phase.type][0] : phaseNames[phase.type][1]}
                  </b>
                  <small>{phase.status}</small>
                </span>
              ))}
            </div>
            <div className="project-actions">
              {activePhase ? (
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      {
                        action: "updatePhase",
                        projectId: selected.id,
                        phaseType: activePhase.type,
                        status: "COMPLETED",
                        notes: phaseNotes,
                      },
                      ar
                        ? "اكتملت المرحلة الحالية."
                        : "Current phase completed.",
                    )
                  }
                >
                  {ar
                    ? `إكمال ${phaseNames[activePhase.type][0]}`
                    : `Complete ${phaseNames[activePhase.type][1]}`}
                </button>
              ) : null}
              {!activePhase && nextPhase ? (
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      {
                        action: "updatePhase",
                        projectId: selected.id,
                        phaseType: nextPhase.type,
                        status: "ACTIVE",
                        notes: phaseNotes,
                      },
                      ar ? "فُعّلت المرحلة التالية." : "Next phase activated.",
                    )
                  }
                >
                  {ar
                    ? `بدء ${phaseNames[nextPhase.type][0]}`
                    : `Start ${phaseNames[nextPhase.type][1]}`}
                </button>
              ) : null}
              <input
                aria-label={ar ? "ملاحظات المرحلة" : "Phase notes"}
                maxLength={4000}
                placeholder={ar ? "ملاحظات المرحلة" : "Phase notes"}
                value={phaseNotes}
                onChange={(event) => setPhaseNotes(event.target.value)}
              />
              <a
                className="button button--ghost"
                href={`/api/projects/${selected.id}/report`}
              >
                {ar ? "تنزيل التقرير" : "Download report"}
              </a>
            </div>
          </article>
          <div
            className="grid-2"
            hidden={!(["feasibility", "assessment", "governance"] as ProjectFocus[]).includes(focus)}
          >
            <article
              className="card project-calculator"
              data-project-focus="feasibility"
              hidden={focus !== "feasibility"}
            >
              <header className="section-heading">
                <h3>{ar ? "دراسة الجدوى" : "Feasibility"}</h3>
                <p>
                  {ar
                    ? "حسابات قابلة للتكرار من مدخلات مالية صريحة، تشمل الضريبة والتضخم والخصم النقدي."
                    : "Repeatable calculations from explicit financial inputs, including tax, inflation, and discounting."}
                </p>
                <p>{ar ? "أدخل قيمك الفعلية؛ لا توجد قيم تجريبية. تظهر النتائج للنسخة المحفوظة فقط بعد الحساب." : "Enter your actual inputs; no demo values are prefilled. Results belong to the saved version, not unsaved edits."}</p>
              </header>
              <form
                className="project-calculator-form"
                onSubmit={calculateFeasibility}
              >
                {Object.entries(financials).map(([field, value]) => (
                  <label key={field}>
                    {ar
                      ? financialLabels[field]![0]
                      : financialLabels[field]![1]}
                    <input
                      required
                      min={field === "months" || field === "monthlyUnits" ? "1" : "0"}
                      max={field === "months" ? "600" : field === "monthlyUnits" ? "1000000000" : field.endsWith("Rate") ? "100" : "1000000000000"}
                      step={field === "months" || field === "monthlyUnits" ? "1" : "any"}
                      type="number"
                      value={value}
                      onChange={(event) =>
                        setFinancials((current) => ({
                          ...current,
                          [field]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={busy}
                >
                  {ar ? "احسب واحفظ النسخة" : "Calculate and save version"}
                </button>
              </form>
              {feasibility ? (
                <div className="project-calculation-result">
                  <div className="card">
                    <span>{ar ? "الإيراد الشهري" : "Monthly revenue"}</span>
                    <strong>
                      {feasibility.monthlyRevenue.toLocaleString()}
                    </strong>
                  </div>
                  <div className="card">
                    <span>
                      {ar
                        ? "الربح الشهري بعد الضريبة"
                        : "After-tax monthly profit"}
                    </span>
                    <strong>
                      {feasibility.monthlyProfit.toLocaleString()}
                    </strong>
                  </div>
                  <div className="card">
                    <span>ROI</span>
                    <strong>{feasibility.roiPercent === null ? (ar ? "غير معرّف" : "Undefined") : `${feasibility.roiPercent.toFixed(1)}%`}</strong>
                  </div>
                  <div className="card">
                    <span>{ar ? "نقطة التعادل" : "Break-even"}</span>
                    <strong>{feasibility.breakEvenUnits ?? (ar ? "لا هامش مساهمة موجب" : "No positive contribution")}</strong>
                  </div>
                  <div className="card">
                    <span>NPV</span>
                    <strong>
                      {feasibility.netPresentValue.toLocaleString()}
                    </strong>
                  </div>
                  <div className="card">
                    <span>IRR</span>
                    <strong>
                      {feasibility.internalRateReturn === null
                        ? "-"
                        : `${feasibility.internalRateReturn.toFixed(1)}%`}
                    </strong>
                  </div>
                  <div className="card"><span>{ar ? "الاسترداد خلال أفق الدراسة (شهر)" : "Payback within study horizon (months)"}</span><strong>{feasibility.paybackMonths?.toFixed(2) ?? (ar ? "لم يتحقق" : "Not reached")}</strong></div>
                  <div className="card"><span>{ar ? "الاسترداد المخصوم (شهر)" : "Discounted payback (months)"}</span><strong>{feasibility.discountedPaybackMonths?.toFixed(2) ?? (ar ? "لم يتحقق" : "Not reached")}</strong></div>
                  <div className="card"><span>{ar ? "هامش الأمان %" : "Margin of safety %"}</span><strong>{feasibility.marginOfSafetyPercent?.toFixed(2) ?? "—"}</strong></div>
                </div>
              ) : null}
              {latestFinancialPlan && !feasibility ? <p role="status">{ar ? "نسخة مالية سابقة؛ أعد الحساب من مدخلات مراجعة لتفعيل النموذج الحالي." : "Legacy financial version; recalculate reviewed inputs to use the current model."}</p> : null}
              {feasibility ? (
                <section className="project-financial-audit">
                  <h3>{ar ? "منهجية النموذج وحدوده" : "Model methodology and limitations"}</h3>
                  <p>{ar ? `النسخة المحفوظة ${latestFinancialPlan?.version} · ${feasibility.modelVersion} · ${latestFinancialPlan?.createdAt}` : `Saved version ${latestFinancialPlan?.version} · ${feasibility.modelVersion} · ${latestFinancialPlan?.createdAt}`}</p>
                  <p>{ar ? "معدلات سنوية فعالة وتدفقات نهاية الشهر. يفترض ثبات الطلب وتضخماً موحداً للإيراد والتكلفة؛ لا يشمل التمويل أو الإهلاك أو رأس المال العامل أو قيمة نهائية. المدخلات غير متحقق منها مستقلاً." : "Effective annual rates and month-end cash flows. Constant demand and equal revenue/cost escalation are assumed; financing, depreciation, working capital and terminal value are excluded. Inputs are not independently verified."}</p>
                  <details>
                    <summary>{ar ? "سجل التدفقات النقدية الشهري" : "Monthly cash-flow schedule"}</summary>
                    <div className="project-table-scroll" role="region" aria-label={ar ? "جدول التدفقات النقدية" : "Cash-flow table"} tabIndex={0}>
                      <table>
                        <caption>{ar ? "الشهر صفر هو الاستثمار الأولي؛ القيم بعملة المشروع." : "Month zero is the initial investment; amounts use project currency."}</caption>
                        <thead><tr>{(ar ? ["شهر", "إيراد", "تكلفة", "ضريبة", "صافي", "مخصوم", "تراكمي"] : ["Month", "Revenue", "Costs", "Tax", "Net", "Discounted", "Cumulative"]).map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                        <tbody>{feasibility.cashFlows.map((row) => <tr key={row.month}>{[row.month, row.revenue, row.costs, row.tax, row.netCashFlow, row.discountedCashFlow, row.cumulativeCashFlow].map((item, index) => <td key={index}>{item.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 2 })}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                  <details>
                    <summary>{ar ? "حساسية عامل واحد ±١٠٪" : "One-factor sensitivity ±10%"}</summary>
                    <p>{ar ? "يتغير عامل واحد فقط مع تثبيت بقية المدخلات؛ هذه افتراضات وليست احتمالات أو توقعات سوقية." : "Only one factor changes while other inputs remain fixed; these are assumptions, not probabilities or market forecasts."}</p>
                    <ul>{feasibility.sensitivity?.map((item) => <li key={`${item.driver}-${item.changePercent}`}>{financialLabels[item.driver]?.[ar ? 0 : 1]} {item.changePercent}% · NPV {item.netPresentValue.toLocaleString()} · Δ {item.npvDelta.toLocaleString()}</li>)}</ul>
                  </details>
                </section>
              ) : null}
              {scenarios.length ? (
                <div className="project-scenarios">
                  <h3>
                    {ar
                      ? "سيناريوهات حساسية الطلب والتكلفة"
                      : "Demand and cost sensitivity scenarios"}
                  </h3>
                  {scenarios.map((scenario) => (
                    <div key={scenario.scenario}>
                      <span>{scenario.scenario}</span>
                      <strong>
                        {ar ? "الربح الشهري" : "Monthly profit"}:{" "}
                        {scenario.monthlyProfit.toLocaleString()}
                      </strong>
                      <small>
                        NPV {scenario.netPresentValue.toLocaleString()} · ROI{" "}
                        {scenario.roiPercent === null ? "—" : `${scenario.roiPercent.toFixed(1)}%`}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
            <article
              className="card"
              data-project-focus={focus === "governance" ? "governance" : "assessment"}
              hidden={!(["assessment", "governance"] as ProjectFocus[]).includes(focus)}
            >
              <header className="section-heading">
                <h3>{ar ? "جودة التقييم" : "Evaluation quality"}</h3>
                <p>
                  {ar
                    ? "القرار محسوب من الدرجة والدليل والمصدر لكل محور."
                    : "The rule-based recommendation uses user-recorded scores and source claims; it is not independent verification."}
                </p>
              </header>
              <div className="project-quality">
                <div>
                  <span>{ar ? "النتيجة" : "Score"}</span>
                  <strong>{quality.score}/100</strong>
                </div>
                <div>
                  <span>{ar ? "الاكتمال" : "Completeness"}</span>
                  <strong>{quality.completeness}%</strong>
                </div>
                <div>
                  <span>{ar ? "القرار" : "Verdict"}</span>
                  <strong>{quality.verdict}</strong>
                </div>
              </div>
              <form className="project-create-form" onSubmit={saveAssessment}>
                <label>
                  {ar ? "المحور" : "Area"}
                  <select
                    value={assessmentType}
                    onChange={(event) =>
                      setAssessmentType(event.target.value as AssessmentType)
                    }
                  >
                    {assessmentTypes.map((type) => (
                      <option key={type} value={type}>
                        {ar
                          ? assessmentNames[type][0]
                          : assessmentNames[type][1]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {ar ? "الدرجة" : "Score"}
                  <input
                    required
                    min="0"
                    max="100"
                    type="number"
                    value={assessmentScore}
                    onChange={(event) => setAssessmentScore(event.target.value)}
                  />
                </label>
                <label>
                  {ar ? "الدليل" : "Evidence"}
                  <input
                    required
                    minLength={3}
                    maxLength={4000}
                    value={assessmentSummary}
                    onChange={(event) =>
                      setAssessmentSummary(event.target.value)
                    }
                  />
                </label>
                <label>
                  {ar ? "المصدر" : "Source"}
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={assessmentSource}
                    onChange={(event) =>
                      setAssessmentSource(event.target.value)
                    }
                  />
                </label>
                <fieldset className="project-assessment-evidence-picker">
                  <legend>{ar ? "ملفات داعمة من مكتبة المشروع" : "Supporting files from project library"}</legend>
                  {selected.evidenceFiles.length ? (
                    <div className="project-assessment-evidence-picker__list">
                      {selected.evidenceFiles.map((file) => (
                        <label className="project-assessment-evidence-picker__item" key={file.id}>
                          <input
                            checked={assessmentEvidenceFileIds.includes(file.id)}
                            onChange={(event) => setAssessmentEvidenceSelections((current) => {
                              const existingIds = current[assessmentEvidenceSelectionKey] ??
                                selected.assessments.find((item) => item.type === assessmentType)?.evidenceFiles.map((item) => item.fileAssetId) ??
                                [];
                              return {
                                ...current,
                                [assessmentEvidenceSelectionKey]: event.target.checked
                                  ? [...new Set([...existingIds, file.id])]
                                  : existingIds.filter((id) => id !== file.id),
                              };
                            })}
                            type="checkbox"
                          />
                          <span>{file.fileName}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p>{ar ? "ارفع ملفات المشروع أولاً من مكتبة الأدلة لربطها بهذا التقييم." : "Upload project files in the evidence library before linking them to this assessment."}</p>
                  )}
                </fieldset>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={busy}
                >
                  {ar ? "حفظ التقييم" : "Save assessment"}
                </button>
              </form>
              <ul className="project-evidence-list">
                {selected.assessments.map((assessment) => (
                  <li key={assessment.id}>
                    <strong>
                      {ar
                        ? assessmentNames[assessment.type][0]
                        : assessmentNames[assessment.type][1]}
                    </strong>
                    <span>{assessment.score ?? "-"}/100</span>
                    <small>
                      {assessment.summary?.trim()
                        ? `${assessment.summary} · ${assessment.source}`
                        : ar
                          ? "بانتظار دليل موثق"
                          : "Awaiting documented evidence"}
                    </small>
                    {assessment.evidenceFiles.length ? (
                          <small>
                            {ar ? "الملفات الداعمة" : "Supporting files"}:{" "}
                            {assessment.evidenceFiles.map((item) => item.fileAsset.fileName).join("، ")}
                          </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          </div>
          <article
            className="card project-intelligence"
            data-project-focus="intelligence"
            hidden={focus !== "intelligence"}
          >
            <header className="section-heading">
              <h3>
                {ar
                  ? "استخبارات الموقع والسوق"
                  : "Location and market intelligence"}
              </h3>
              <p>
                {ar
                  ? "تُحفظ اللقطة مع المشروع وتعرض مصادرها وحدودها بوضوح."
                  : "The snapshot is saved with the project and shows its sources and limitations."}
              </p>
            </header>
            <form
              className="project-intelligence-form"
              onSubmit={searchIntelligence}
            >
              <label>
                {ar ? "الموقع أو المدينة" : "Location or city"}
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                />
              </label>
              <button
                className="button button--secondary"
                type="submit"
                disabled={busy}
              >
                {ar ? "بحث" : "Research"}
              </button>
            </form>
            {intelligence ? (
              <div className="project-intelligence-result">
                <p>
                  {intelligence.location?.label ??
                    (ar ? "لم يُحسم الموقع" : "Location was not resolved")}
                </p>
                <div className="project-intelligence-metrics">
                  <div>
                    <span>{ar ? "السكان" : "Population"}</span>
                    <strong>
                      {intelligence.population.value?.toLocaleString() ?? "-"}
                    </strong>
                    <small>{intelligence.population.year ?? ""}</small>
                  </div>
                  <div>
                    <span>{ar ? "القوة الشرائية" : "Purchasing power"}</span>
                    <strong>
                      {intelligence.purchasingPower.value?.toLocaleString() ??
                        "-"}
                    </strong>
                    <small>{intelligence.purchasingPower.year ?? ""}</small>
                  </div>
                  <div>
                    <span>{ar ? "تضخم التكلفة" : "Cost inflation"}</span>
                    <strong>
                      {intelligence.costInflation.value === null
                        ? "-"
                        : `${intelligence.costInflation.value.toFixed(2)}%`}
                    </strong>
                    <small>{intelligence.costInflation.year ?? ""}</small>
                    {intelligence.costInflation.value !== null ? (
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() =>
                          setFinancials((current) => ({
                            ...current,
                            annualInflationRate:
                              intelligence.costInflation.value!.toFixed(2),
                          }))
                        }
                      >
                        {ar ? "تطبيق في الجدوى" : "Apply to feasibility"}
                      </button>
                    ) : null}
                  </div>
                  <div>
                    <span>{ar ? "منشآت قريبة على الخريطة" : "Nearby mapped businesses"}</span>
                    <strong>{intelligence.competitors.length}</strong>
                  </div>
                </div>
                {intelligence.location ? (
                  <ProjectIntelligenceMap
                    locale={locale}
                    location={intelligence.location}
                    competitors={intelligence.competitors}
                  />
                ) : null}
                {intelligence.sources.length ? (
                  <ul className="project-sources">
                    {intelligence.sources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} rel="noreferrer" target="_blank">
                          {source.source}
                        </a>
                        <small>
                          {source.confidence} · {new Date(source.fetchedAt).toLocaleString(ar ? "ar-SA" : "en-US")}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {intelligence.limitations.length ? (
                  <ul>
                    {intelligence.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </article>
          <article
            className="card project-risk"
            data-project-focus="risk"
            hidden={focus !== "risk"}
          >
            <header className="section-heading">
              <h3>{ar ? "مصفوفة المخاطر" : "Risk matrix"}</h3>
              <p>
                {ar
                  ? "أدخل درجة من 0 إلى 100 لكل محور؛ النتيجة متوسط واضح وقابل للمراجعة."
                  : "Enter a score from 0 to 100 for each area; the result is a transparent, reviewable average."}
              </p>
            </header>
            <form className="project-risk__form" onSubmit={calculateRisk}>
              {Object.entries(riskFactors).map(([field, value]) => (
                <label key={field}>
                  {ar ? riskLabels[field]![0] : riskLabels[field]![1]}
                  <input
                    required
                    min="0"
                    max="100"
                    step="1"
                    type="number"
                    value={value}
                    onChange={(event) =>
                      setRiskFactors((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
              <button
                className="button button--secondary"
                type="submit"
                disabled={busy}
              >
                {ar ? "احسب المخاطر" : "Calculate risk"}
              </button>
            </form>
            {risk ? (
              <p
                className={`project-risk__result project-risk__result--${risk.level.toLowerCase()}`}
              >
                {ar ? "المستوى" : "Level"}: <strong>{risk.level}</strong> ·{" "}
                {ar ? "الدرجة" : "Score"}: {risk.score}/100
              </p>
            ) : null}
          </article>
          <div
            className="grid-2 project-governance"
            hidden={!(["governance", "risk"] as ProjectFocus[]).includes(focus)}
          >
            <article
              className="card"
              data-project-focus="governance"
              hidden={focus !== "governance"}
            >
              <header className="section-heading">
                <h3>{ar ? "قرار الاعتماد" : "Approval decision"}</h3>
                <p>
                  {ar
                    ? "قرار بشري موثق يلتقط الأدلة والنتيجة وقت اعتماده."
                    : "A documented human decision captures evidence and the score at approval time."}
                </p>
              </header>
              <dl className="project-governance__summary">
                <div>
                  <dt>{ar ? "القرار الحالي" : "Current decision"}</dt>
                  <dd>
                    {latestDecision?.verdict ??
                      (ar ? "غير مسجل" : "Not recorded")}
                  </dd>
                </div>
                <div>
                  <dt>{ar ? "نسخة الجدوى" : "Financial plan"}</dt>
                  <dd>
                    {latestFinancialPlan
                      ? `v${latestFinancialPlan.version}`
                      : ar
                        ? "غير محفوظة"
                        : "Not saved"}
                  </dd>
                </div>
              </dl>
              <form
                className="project-governance__form"
                onSubmit={recordDecision}
              >
                <label>
                  {ar ? "مبرر القرار" : "Decision rationale"}
                  <textarea
                    required
                    minLength={10}
                    maxLength={4000}
                    value={decisionRationale}
                    onChange={(event) =>
                      setDecisionRationale(event.target.value)
                    }
                    placeholder={
                      ar
                        ? "اشرح سبب الاعتماد أو الإعادة للمراجعة."
                        : "Explain why the project is approved or returned for review."
                    }
                  />
                </label>
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={busy || !quality.readyForDecision}
                >
                  {ar ? "تسجيل القرار" : "Record decision"}
                </button>
              </form>
            </article>
            <article
              className="card project-risk-register"
              data-project-focus="risk"
              hidden={focus !== "risk"}
            >
              <header className="section-heading">
                <h3>{ar ? "سجل المخاطر" : "Risk register"}</h3>
                <p>
                  {ar
                    ? "لكل خطر مالك وخطة تخفيف وحالة مراجعة قابلة للتتبع."
                    : "Every risk has an owner, mitigation plan, and trackable review state."}
                </p>
              </header>
              <form
                className="project-risk-register__form"
                onSubmit={createRiskRecord}
              >
                <label>
                  {ar ? "الفئة" : "Category"}
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={riskRecord.category}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {ar ? "الخطر" : "Risk"}
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    value={riskRecord.title}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {ar ? "الاحتمال 1-5" : "Likelihood 1-5"}
                  <input
                    required
                    min="1"
                    max="5"
                    type="number"
                    value={riskRecord.likelihood}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        likelihood: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {ar ? "الأثر 1-5" : "Impact 1-5"}
                  <input
                    required
                    min="1"
                    max="5"
                    type="number"
                    value={riskRecord.impact}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        impact: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {ar ? "المالك" : "Owner"}
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={riskRecord.ownerLabel}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        ownerLabel: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {ar ? "خطة التخفيف" : "Mitigation plan"}
                  <input
                    required
                    minLength={3}
                    maxLength={4000}
                    value={riskRecord.mitigation}
                    onChange={(event) =>
                      setRiskRecord((current) => ({
                        ...current,
                        mitigation: event.target.value,
                      }))
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={busy}
                >
                  {ar ? "إضافة خطر" : "Add risk"}
                </button>
              </form>
              <ul className="project-risk-register__list">
                {selected.risks.map((projectRisk) => (
                  <li key={projectRisk.id}>
                    <strong>{projectRisk.title}</strong>
                    <span>
                      {projectRisk.category} · {projectRisk.score}/25 ·{" "}
                      {projectRisk.status}
                    </span>
                    <small>
                      {projectRisk.ownerLabel}: {projectRisk.mitigation}
                    </small>
                    <select
                      aria-label={
                        ar
                          ? `حالة ${projectRisk.title}`
                          : `${projectRisk.title} status`
                      }
                      value={projectRisk.status}
                      disabled={busy}
                      onChange={(event) =>
                        void run(
                          {
                            action: "updateRiskStatus",
                            projectId: selected.id,
                            riskId: projectRisk.id,
                            status: event.target.value,
                          },
                          ar ? "تم تحديث حالة الخطر." : "Risk status updated.",
                        )
                      }
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="MITIGATING">MITIGATING</option>
                      <option value="ACCEPTED">ACCEPTED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </li>
                ))}
                {!selected.risks.length ? (
                  <li>
                    {ar ? "لا توجد مخاطر مسجلة بعد." : "No risks recorded yet."}
                  </li>
                ) : null}
              </ul>
            </article>
          </div>
          <article
            className="card project-evidence-library"
            data-project-focus="evidence"
            hidden={focus !== "evidence"}
          >
            <header className="section-heading">
              <h3>{ar ? "مكتبة الأدلة" : "Evidence library"}</h3>
              <p>
                {ar
                  ? "ارفع مستندات المشروع الفعلية؛ تحفظ المنصة البصمة الرقمية وسجل الرفع."
                  : "Upload real project documents; the platform stores a digital checksum and upload record."}
              </p>
            </header>
            <form
              className="project-evidence-library__form"
              onSubmit={uploadEvidence}
            >
              <input
                aria-label={ar ? "ملف دليل المشروع" : "Project evidence file"}
                accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.txt"
                type="file"
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEvidenceFile(event.target.files?.[0] ?? null)
                }
              />
              <button
                className="button button--secondary"
                disabled={busy || !evidenceFile}
                type="submit"
              >
                {ar ? "رفع دليل" : "Upload evidence"}
              </button>
            </form>
            <ul className="project-evidence-library__list">
              {selected.evidenceFiles.map((file) => (
                <li key={file.id}>
                  <a href={`/api/files/${file.id}`}>{file.fileName}</a>
                  <span>
                    {file.mimeType} · {Number(file.sizeBytes).toLocaleString()}{" "}
                    B · {ar ? "رفع" : "Uploaded"} {new Date(file.createdAt).toLocaleString(ar ? "ar-SA" : "en-US")}
                  </span>
                  <small>
                    {file.checksum
                      ? `${ar ? "بصمة" : "Checksum"}: ${file.checksum.slice(0, 12)}...`
                      : "-"}
                  </small>
                </li>
              ))}
              {!selected.evidenceFiles.length ? (
                <li>
                  {ar ? "لا توجد ملفات أدلة بعد." : "No evidence files yet."}
                </li>
              ) : null}
            </ul>
          </article>
          <article
            className="card project-members"
            data-project-focus="team"
            hidden={focus !== "team"}
          >
            <header className="section-heading">
              <h3>{ar ? "فريق المشروع" : "Project team"}</h3>
              <p>
                {ar
                  ? "المالك يدير العضويات؛ المحرر يحدّث المحتوى، والمراجع يسجل القرار، والقارئ يطّلع فقط."
                  : "The owner manages membership; editors update content, reviewers record decisions, and viewers have read-only access."}
              </p>
            </header>
            <form className="project-members__form" onSubmit={addMember}>
              <label>
                {ar ? "بريد المستخدم المسجل" : "Registered user email"}
                <input
                  required
                  type="email"
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                />
              </label>
              <label>
                {ar ? "الدور" : "Role"}
                <select
                  value={memberRole}
                  onChange={(event) =>
                    setMemberRole(
                      event.target.value as "EDITOR" | "REVIEWER" | "VIEWER",
                    )
                  }
                >
                  <option value="EDITOR">EDITOR</option>
                  <option value="REVIEWER">REVIEWER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </label>
              <button
                className="button button--secondary"
                type="submit"
                disabled={busy}
              >
                {ar ? "إضافة عضو" : "Add member"}
              </button>
            </form>
            <ul className="project-members__list">
              {selected.members.map((member) => (
                <li key={member.id}>
                  <strong>
                    {member.user.profile?.displayName ?? member.user.email}
                  </strong>
                  <span>{member.user.email}</span>
                  <small>{member.role}</small>
                </li>
              ))}
            </ul>
          </article>
          {focus === "compliance" ? (
            <ProjectComplianceWorkspace
              items={selected.complianceItems}
              locale={locale}
              onChanged={() => load()}
              projectId={selected.id}
            />
          ) : null}
          {focus === "vendors" ? (
            <ProjectVendorWorkspace
              items={selected.vendors}
              locale={locale}
              onChanged={() => load()}
              projectId={selected.id}
            />
          ) : null}
          <div
            className="project-actions"
            data-project-focus="launch"
            hidden={focus !== "launch"}
          >
            <button
              className="button button--primary"
              type="button"
              disabled={
                busy ||
                latestDecision?.verdict !== "APPROVE" ||
                !latestFinancialPlan ||
                !prerequisitesComplete ||
                !readiness?.readyToLaunch
              }
              onClick={() =>
                void run(
                  { action: "start", projectId: selected.id },
                  ar
                    ? "بدأ المشروع في مرحلة التنفيذ."
                    : "Project started in execution.",
                )
              }
            >
              {ar ? "بدء التنفيذ" : "Start execution"}
            </button>
            <small>
              {latestDecision?.verdict !== "APPROVE" ||
              !latestFinancialPlan ||
              !prerequisitesComplete
                ? ar
                  ? "يتطلب البدء قرار APPROVE موثقاً ونسخة جدوى محفوظة وإكمال التحليل والجدوى والتقييم والتخطيط."
                  : "Starting requires a recorded APPROVE decision, a saved financial plan, and completed analysis, feasibility, evaluation, and planning."
                : ar
                  ? "المشروع مستوفٍ لشروط البدء."
                  : "This project meets the start criteria."}
            </small>
          </div>
        </div>
      ) : null}
    </section>
  );
}
