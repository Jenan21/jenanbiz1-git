"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { Locale } from "@/types/i18n";

const ProjectIntelligenceMap = dynamic(
  () =>
    import("@/components/projects/project-intelligence-map").then(
      (module) => module.ProjectIntelligenceMap,
    ),
  {
    ssr: false,
    loading: () => <p className="pfs-empty">Loading map...</p>,
  },
);

type SectionKey =
  | "GENERAL"
  | "MARKET"
  | "MARKETING"
  | "TECHNICAL"
  | "FINANCIAL"
  | "SWOT"
  | "TIMELINE";

type GeneralData = {
  projectType: string;
  legalNature: string;
  size: "SMALL" | "MEDIUM" | "LARGE";
  location: string;
  description: string;
};
type MarketData = {
  scope: "LOCAL" | "REGIONAL" | "NATIONAL" | "INTERNATIONAL";
  customerSegment: string;
  demandTrend: string;
  marketSizeNotes: string;
  competitorNotes: string;
  pricingNotes: string;
  distributionNotes: string;
};
type MarketingData = {
  objectives: Array<"AWARENESS" | "ACQUISITION" | "RETENTION" | "SALES">;
  strategy: "DIGITAL" | "DIRECT" | "PARTNERSHIPS" | "MIXED";
  budget: number;
  channels: Array<
    "SEARCH" | "SOCIAL" | "EMAIL" | "CONTENT" | "EVENTS" | "PARTNERS"
  >;
  awarenessMonths: number;
  launchMonths: number;
  growthMonths: number;
};
type TechnicalData = {
  facilityType: string;
  facilityArea: number;
  equipmentCount: number;
  productsServices: string;
  rawMaterials: string;
  staffingPlan: string;
  organizationNotes: string;
};
type FinancialData = {
  initialInvestment: number;
  monthlyFixedCosts: number;
  variableCostPerUnit: number;
  pricePerUnit: number;
  monthlyUnits: number;
  months: number;
  annualDiscountRate: number;
  annualInflationRate: number;
  taxRate?: number;
};
type SwotData = {
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
  recommendation: string;
};
type TimelineData = {
  startDate: string;
  durationMonths: number;
  preparationMonths: number;
  launchMonths: number;
  growthMonths: number;
  milestones: string;
};
type StudySections = {
  GENERAL: GeneralData;
  MARKET: MarketData;
  MARKETING: MarketingData;
  TECHNICAL: TechnicalData;
  FINANCIAL: FinancialData;
  SWOT: SwotData;
  TIMELINE: TimelineData;
};
type FeasibilityResult = {
  breakEvenUnits: number;
  monthlyRevenue: number;
  monthlyProfit: number;
  roiPercent: number;
  paybackMonths: number | null;
  netPresentValue: number;
  internalRateReturn: number | null;
};
type Intelligence = {
  location: { latitude: number; longitude: number; label: string } | null;
  population: { value: number | null; year: number | null };
  purchasingPower: {
    value: number | null;
    year: number | null;
    metric?: string;
  };
  costInflation: {
    value: number | null;
    year: number | null;
    metric?: string;
  };
  competitors: Array<{
    name: string;
    category: string;
    latitude: number;
    longitude: number;
  }>;
  sources: Array<{ source: string; url: string; confidence: string }>;
  limitations: string[];
};
type Project = {
  id: string;
  name: string;
  description: string | null;
  sector: string | null;
  countryCode: string | null;
  currency: string;
  feasibilityStudy: { sections?: Partial<StudySections> } | null;
  feasibilityStudyUpdatedAt: string | null;
  intelligenceSnapshots: Intelligence[];
  financialPlans: Array<{
    id: string;
    version: number;
    inputs: FinancialData;
    baseCase: FeasibilityResult;
    scenarios: Array<FeasibilityResult & { scenario: string }>;
  }>;
};

type Step = {
  key: SectionKey | "REVIEW" | "REPORT";
  href: string;
  icon: IconName;
  label: readonly [string, string];
  short: readonly [string, string];
};

const steps: readonly Step[] = [
  {
    key: "GENERAL",
    href: "/projects/feasibility/pro/new",
    icon: "briefcase",
    label: ["المعلومات العامة", "General information"],
    short: ["العامة", "General"],
  },
  {
    key: "MARKET",
    href: "/projects/feasibility/pro/market",
    icon: "barChart",
    label: ["السوق والمنافسون", "Market and competitors"],
    short: ["السوق", "Market"],
  },
  {
    key: "MARKETING",
    href: "/projects/feasibility/pro/marketing",
    icon: "megaphone",
    label: ["الخطة التسويقية", "Marketing plan"],
    short: ["التسويق", "Marketing"],
  },
  {
    key: "TECHNICAL",
    href: "/projects/feasibility/pro/technical",
    icon: "settings",
    label: ["الفني والتشغيلي", "Technical and operational"],
    short: ["الفني", "Technical"],
  },
  {
    key: "FINANCIAL",
    href: "/projects/feasibility/pro/financial",
    icon: "wallet",
    label: ["الجانب المالي", "Financial study"],
    short: ["المالي", "Financial"],
  },
  {
    key: "REVIEW",
    href: "/projects/feasibility/pro/result",
    icon: "check",
    label: ["المراجعة والنتائج", "Review and results"],
    short: ["المراجعة", "Review"],
  },
  {
    key: "REPORT",
    href: "/projects/feasibility/pro/report",
    icon: "pieChart",
    label: ["التقرير النهائي", "Final report"],
    short: ["التقرير", "Report"],
  },
];

const sectionLabels: ReadonlyArray<{
  key: SectionKey;
  label: readonly [string, string];
  route: string;
}> = [
  {
    key: "GENERAL",
    label: ["بيانات المشروع", "Project information"],
    route: steps[0].href,
  },
  {
    key: "MARKET",
    label: ["دراسة السوق", "Market study"],
    route: steps[1].href,
  },
  {
    key: "MARKETING",
    label: ["الخطة التسويقية", "Marketing plan"],
    route: steps[2].href,
  },
  {
    key: "TECHNICAL",
    label: ["الفني والتشغيلي", "Technical and operations"],
    route: steps[3].href,
  },
  {
    key: "FINANCIAL",
    label: ["التحليل المالي", "Financial analysis"],
    route: steps[4].href,
  },
  {
    key: "SWOT",
    label: ["تحليل SWOT", "SWOT analysis"],
    route: "/projects/feasibility/pro/swot",
  },
  {
    key: "TIMELINE",
    label: ["الجدول الزمني", "Delivery timeline"],
    route: "/projects/feasibility/pro/timeline",
  },
];

function copy(locale: Locale, value: readonly [string, string]) {
  return locale === "ar" ? value[0] : value[1];
}

function readString(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function readNumber(form: FormData, name: string) {
  const value = Number(readString(form, name));
  if (!Number.isFinite(value)) throw new Error(`Invalid number: ${name}`);
  return value;
}

function readEnum<T extends string>(
  form: FormData,
  name: string,
  values: readonly T[],
) {
  const value = readString(form, name);
  if (!values.includes(value as T)) throw new Error(`Invalid value: ${name}`);
  return value as T;
}

function readEnums<T extends string>(
  form: FormData,
  name: string,
  values: readonly T[],
) {
  const selected = form.getAll(name).map(String);
  if (!selected.length || selected.some((value) => !values.includes(value as T))) {
    throw new Error(`Invalid value: ${name}`);
  }
  return selected as T[];
}

function FormCard({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: IconName;
  title: string;
}) {
  return (
    <section className="pfs-card pfs-form-card">
      <header>
        <span>
          <Icon name={icon} />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ActionBar({
  busy,
  locale,
  previous,
  submitLabel,
}: {
  busy: boolean;
  locale: Locale;
  previous?: string;
  submitLabel?: string;
}) {
  return (
    <div className="pfs-actions">
      {previous ? (
        <Link className="pfs-button pfs-button--ghost" href={previous}>
          <Icon name="chevron" />
          {copy(locale, ["السابق", "Previous"])}
        </Link>
      ) : (
        <span />
      )}
      <button className="pfs-button pfs-button--primary" disabled={busy} type="submit">
        {submitLabel ?? copy(locale, ["حفظ ومتابعة", "Save and continue"])}
        <Icon name="arrow" />
      </button>
    </div>
  );
}

export function ProfessionalFeasibilityWorkspace({
  locale,
  route,
  userLabel,
}: {
  locale: Locale;
  route: string;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project") ?? "";
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [searchedIntelligence, setSearchedIntelligence] =
    useState<Intelligence | null>(null);
  const [calculation, setCalculation] = useState<FeasibilityResult | null>(null);

  const api = useCallback(async function request<T>(body?: unknown): Promise<T> {
    const response = await fetch(
      body ? "/api/projects" : "/api/projects?limit=100&offset=0",
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
      projects?: T;
      message?: string;
    } | null;
    if (!response.ok || !payload?.success) {
      throw new Error(
        payload?.message ??
          copy(locale, ["تعذر تنفيذ العملية.", "The operation could not be completed."]),
      );
    }
    return (body ? payload.result : payload.projects) as T;
  }, [locale]);

  const loadProjects = useCallback(async (preferredId = "") => {
    setLoading(true);
    try {
      const loaded = await api<Project[]>();
      setProjects(loaded);
      setSelectedId((current) => {
        const preferred = preferredId || current;
        return loaded.some((project) => project.id === preferred)
          ? preferred
          : (loaded[0]?.id ?? "");
      });
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر تحميل المشاريع.", "Projects could not be loaded."]),
      );
    } finally {
      setLoading(false);
    }
  }, [api, locale]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadProjects(requestedProjectId);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadProjects, requestedProjectId]);

  const selected = projects.find((project) => project.id === selectedId);
  const sections = selected?.feasibilityStudy?.sections ?? {};
  const completedSections = new Set(
    sectionLabels
      .filter((section) => Boolean(sections[section.key]))
      .map((section) => section.key),
  );
  const completion = Math.round(
    (completedSections.size / sectionLabels.length) * 100,
  );
  const latestPlan = selected?.financialPlans[0];
  const financialResult = calculation ?? latestPlan?.baseCase ?? null;
  const intelligence =
    searchedIntelligence ?? selected?.intelligenceSnapshots[0] ?? null;

  const activeStepIndex = route.endsWith("/new")
    ? 0
    : route.endsWith("/market")
      ? 1
      : route.endsWith("/marketing")
        ? 2
        : route.endsWith("/technical") || route.endsWith("/operational")
          ? 3
          : route.endsWith("/financial")
            ? 4
            : route.endsWith("/report")
              ? 6
              : 5;
  const activeStep = steps[activeStepIndex];

  function routeWithProject(path: string, projectId = selectedId) {
    return projectId ? `${path}?project=${encodeURIComponent(projectId)}` : path;
  }

  function selectProject(projectId: string) {
    setSelectedId(projectId);
    setSearchedIntelligence(null);
    setCalculation(null);
    router.replace(routeWithProject(route, projectId));
  }

  async function saveSection<K extends SectionKey>(
    projectId: string,
    section: K,
    data: StudySections[K],
  ) {
    await api({
      action: "saveFeasibilityStudy",
      projectId,
      payload: { section, data },
    });
  }

  async function submitGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      let project = selected;
      if (!project) {
        project = await api<Project>({
          action: "create",
          name: readString(form, "name"),
          sector: readString(form, "sector"),
          countryCode: readString(form, "countryCode"),
          currency: readString(form, "currency"),
          description: readString(form, "description"),
        });
      }
      const data: GeneralData = {
        projectType: readString(form, "projectType"),
        legalNature: readString(form, "legalNature"),
        size: readEnum(form, "size", ["SMALL", "MEDIUM", "LARGE"] as const),
        location: readString(form, "location"),
        description: readString(form, "description"),
      };
      await saveSection(project.id, "GENERAL", data);
      await loadProjects(project.id);
      router.push(routeWithProject(steps[1].href, project.id));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ البيانات.", "The information could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMarket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const locationQuery =
        readString(form, "locationQuery") ||
        sections.GENERAL?.location ||
        selected.countryCode ||
        "";
      const result = await api<Intelligence>({
        action: "searchIntelligence",
        projectId: selected.id,
        query: locationQuery,
        countryCode: selected.countryCode || undefined,
        sector: selected.sector || undefined,
      });
      const data: MarketData = {
        scope: readEnum(form, "scope", [
          "LOCAL",
          "REGIONAL",
          "NATIONAL",
          "INTERNATIONAL",
        ] as const),
        customerSegment: readString(form, "customerSegment"),
        demandTrend: readString(form, "demandTrend"),
        marketSizeNotes: readString(form, "marketSizeNotes"),
        competitorNotes: readString(form, "competitorNotes"),
        pricingNotes: readString(form, "pricingNotes"),
        distributionNotes: readString(form, "distributionNotes"),
      };
      await saveSection(selected.id, "MARKET", data);
      setSearchedIntelligence(result);
      await loadProjects(selected.id);
      router.push(routeWithProject(steps[2].href));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ دراسة السوق.", "The market study could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitMarketing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const data: MarketingData = {
        objectives: readEnums(form, "objectives", [
          "AWARENESS",
          "ACQUISITION",
          "RETENTION",
          "SALES",
        ] as const),
        strategy: readEnum(form, "strategy", [
          "DIGITAL",
          "DIRECT",
          "PARTNERSHIPS",
          "MIXED",
        ] as const),
        budget: readNumber(form, "budget"),
        channels: readEnums(form, "channels", [
          "SEARCH",
          "SOCIAL",
          "EMAIL",
          "CONTENT",
          "EVENTS",
          "PARTNERS",
        ] as const),
        awarenessMonths: readNumber(form, "awarenessMonths"),
        launchMonths: readNumber(form, "launchMonths"),
        growthMonths: readNumber(form, "growthMonths"),
      };
      await saveSection(selected.id, "MARKETING", data);
      await loadProjects(selected.id);
      router.push(routeWithProject(steps[3].href));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ الخطة.", "The marketing plan could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitTechnical(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const data: TechnicalData = {
        facilityType: readString(form, "facilityType"),
        facilityArea: readNumber(form, "facilityArea"),
        equipmentCount: readNumber(form, "equipmentCount"),
        productsServices: readString(form, "productsServices"),
        rawMaterials: readString(form, "rawMaterials"),
        staffingPlan: readString(form, "staffingPlan"),
        organizationNotes: readString(form, "organizationNotes"),
      };
      await saveSection(selected.id, "TECHNICAL", data);
      await loadProjects(selected.id);
      router.push(routeWithProject(steps[4].href));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ الدراسة الفنية.", "The technical study could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitFinancial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const data: FinancialData = {
        initialInvestment: readNumber(form, "initialInvestment"),
        monthlyFixedCosts: readNumber(form, "monthlyFixedCosts"),
        variableCostPerUnit: readNumber(form, "variableCostPerUnit"),
        pricePerUnit: readNumber(form, "pricePerUnit"),
        monthlyUnits: readNumber(form, "monthlyUnits"),
        months: readNumber(form, "months"),
        annualDiscountRate: readNumber(form, "annualDiscountRate"),
        annualInflationRate: readNumber(form, "annualInflationRate"),
        taxRate: readNumber(form, "taxRate"),
      };
      const result = await api<{
        base: FeasibilityResult;
        scenarios: Array<FeasibilityResult & { scenario: string }>;
      }>({
        action: "calculateFeasibility",
        projectId: selected.id,
        persist: true,
        inputs: data,
      });
      await saveSection(selected.id, "FINANCIAL", data);
      setCalculation(result.base);
      await loadProjects(selected.id);
      router.push(routeWithProject("/projects/feasibility/pro/swot"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حساب الجدوى.", "Feasibility could not be calculated."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitSwot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const data: SwotData = {
        strengths: readString(form, "strengths"),
        weaknesses: readString(form, "weaknesses"),
        opportunities: readString(form, "opportunities"),
        threats: readString(form, "threats"),
        recommendation: readString(form, "recommendation"),
      };
      await saveSection(selected.id, "SWOT", data);
      await loadProjects(selected.id);
      router.push(routeWithProject("/projects/feasibility/pro/timeline"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ التحليل.", "The SWOT analysis could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitTimeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const data: TimelineData = {
        startDate: readString(form, "startDate"),
        durationMonths: readNumber(form, "durationMonths"),
        preparationMonths: readNumber(form, "preparationMonths"),
        launchMonths: readNumber(form, "launchMonths"),
        growthMonths: readNumber(form, "growthMonths"),
        milestones: readString(form, "milestones"),
      };
      await saveSection(selected.id, "TIMELINE", data);
      await loadProjects(selected.id);
      router.push(routeWithProject(steps[5].href));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : copy(locale, ["تعذر حفظ الجدول.", "The timeline could not be saved."]),
      );
    } finally {
      setBusy(false);
    }
  }

  function money(value: number | null | undefined) {
    if (value === null || value === undefined || !selected) return "—";
    return new Intl.NumberFormat(ar ? "ar-SA" : "en-US", {
      maximumFractionDigits: 0,
      style: "currency",
      currency: selected.currency,
    }).format(value);
  }

  function renderGeneral() {
    const data = sections.GENERAL;
    return (
      <FormCard
        description={copy(locale, [
          "أسّس الدراسة ببيانات المشروع الفعلية. يمكنك متابعة مشروع قائم أو إنشاء مشروع جديد.",
          "Start with factual project information. Continue an existing project or create a new one.",
        ])}
        icon="briefcase"
        title={copy(locale, ["معلومات المشروع", "Project information"])}
      >
        <form
          className="pfs-form"
          key={`${selected?.id ?? "new"}-${selected?.feasibilityStudyUpdatedAt ?? ""}`}
          onSubmit={submitGeneral}
        >
          <div className="pfs-form-grid">
            <label>
              {copy(locale, ["اسم المشروع", "Project name"])}
              <input
                defaultValue={selected?.name ?? ""}
                disabled={Boolean(selected)}
                maxLength={160}
                minLength={2}
                name="name"
                required
              />
            </label>
            <label>
              {copy(locale, ["نوع المشروع", "Project type"])}
              <input
                defaultValue={data?.projectType ?? ""}
                maxLength={120}
                minLength={2}
                name="projectType"
                required
              />
            </label>
            <label>
              {copy(locale, ["القطاع", "Sector"])}
              <input
                defaultValue={selected?.sector ?? ""}
                disabled={Boolean(selected)}
                maxLength={120}
                minLength={2}
                name="sector"
                required
              />
            </label>
            <label>
              {copy(locale, ["الطبيعة القانونية", "Legal nature"])}
              <input
                defaultValue={data?.legalNature ?? ""}
                maxLength={120}
                minLength={2}
                name="legalNature"
                required
              />
            </label>
            <label>
              {copy(locale, ["حجم المشروع", "Project size"])}
              <select defaultValue={data?.size ?? ""} name="size" required>
                <option disabled value="">
                  {copy(locale, ["اختر الحجم", "Select size"])}
                </option>
                <option value="SMALL">{copy(locale, ["صغير", "Small"])}</option>
                <option value="MEDIUM">{copy(locale, ["متوسط", "Medium"])}</option>
                <option value="LARGE">{copy(locale, ["كبير", "Large"])}</option>
              </select>
            </label>
            <label>
              {copy(locale, ["الموقع أو المدينة", "Location or city"])}
              <input
                defaultValue={data?.location ?? ""}
                maxLength={200}
                minLength={2}
                name="location"
                required
              />
            </label>
            <label>
              {copy(locale, ["رمز الدولة", "Country code"])}
              <input
                defaultValue={selected?.countryCode ?? ""}
                disabled={Boolean(selected)}
                maxLength={2}
                minLength={2}
                name="countryCode"
                pattern="[A-Za-z]{2}"
                required
              />
            </label>
            <label>
              {copy(locale, ["العملة", "Currency"])}
              <select
                defaultValue={selected?.currency ?? "SAR"}
                disabled={Boolean(selected)}
                name="currency"
                required
              >
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label className="is-wide">
              {copy(locale, ["وصف المشروع", "Project description"])}
              <textarea
                defaultValue={data?.description ?? selected?.description ?? ""}
                maxLength={4000}
                minLength={10}
                name="description"
                required
                rows={4}
              />
            </label>
          </div>
          <ActionBar busy={busy} locale={locale} />
        </form>
      </FormCard>
    );
  }

  function renderMarket() {
    const data = sections.MARKET;
    return (
      <div className="pfs-stage-stack">
        <FormCard
          description={copy(locale, [
            "ابحث عن الموقع واحفظ قراءة السوق والمنافسة من مصادر قابلة للتتبع.",
            "Research the location and save a traceable market and competitor assessment.",
          ])}
          icon="barChart"
          title={copy(locale, ["تحليل السوق والمنافسين", "Market and competitor analysis"])}
        >
          <form className="pfs-form" key={selected?.id} onSubmit={submitMarket}>
            <div className="pfs-form-grid">
              <label>
                {copy(locale, ["الموقع للبحث", "Research location"])}
                <input
                  defaultValue={sections.GENERAL?.location ?? ""}
                  maxLength={200}
                  minLength={2}
                  name="locationQuery"
                  required
                />
              </label>
              <label>
                {copy(locale, ["نطاق السوق", "Market scope"])}
                <select defaultValue={data?.scope ?? ""} name="scope" required>
                  <option disabled value="">
                    {copy(locale, ["اختر النطاق", "Select scope"])}
                  </option>
                  <option value="LOCAL">{copy(locale, ["محلي", "Local"])}</option>
                  <option value="REGIONAL">{copy(locale, ["إقليمي", "Regional"])}</option>
                  <option value="NATIONAL">{copy(locale, ["وطني", "National"])}</option>
                  <option value="INTERNATIONAL">{copy(locale, ["دولي", "International"])}</option>
                </select>
              </label>
              <label>
                {copy(locale, ["شريحة العملاء", "Customer segment"])}
                <textarea defaultValue={data?.customerSegment ?? ""} minLength={3} name="customerSegment" required />
              </label>
              <label>
                {copy(locale, ["اتجاه الطلب", "Demand trend"])}
                <textarea defaultValue={data?.demandTrend ?? ""} minLength={3} name="demandTrend" required />
              </label>
              <label>
                {copy(locale, ["حجم السوق ومصادره", "Market size and sources"])}
                <textarea defaultValue={data?.marketSizeNotes ?? ""} minLength={3} name="marketSizeNotes" required />
              </label>
              <label>
                {copy(locale, ["قراءة المنافسين", "Competitor assessment"])}
                <textarea defaultValue={data?.competitorNotes ?? ""} minLength={3} name="competitorNotes" required />
              </label>
              <label>
                {copy(locale, ["ملاحظات التسعير", "Pricing notes"])}
                <textarea defaultValue={data?.pricingNotes ?? ""} minLength={3} name="pricingNotes" required />
              </label>
              <label>
                {copy(locale, ["قنوات التوزيع", "Distribution channels"])}
                <textarea defaultValue={data?.distributionNotes ?? ""} minLength={3} name="distributionNotes" required />
              </label>
            </div>
            <ActionBar busy={busy} locale={locale} previous={routeWithProject(steps[0].href)} />
          </form>
        </FormCard>
        <section className="pfs-card pfs-market-visual">
          <header className="pfs-card-heading">
            <div>
              <h2>{copy(locale, ["الخريطة والبيانات المصدرية", "Map and sourced data"])}</h2>
              <p>{copy(locale, ["لا تظهر أرقام أو منافسون قبل توفر نتيجة فعلية.", "No numbers or competitors appear until a real result is available."])}</p>
            </div>
            <span className="pfs-source-badge">{copy(locale, ["مصادر خارجية", "External sources"])}</span>
          </header>
          {intelligence?.location ? (
            <ProjectIntelligenceMap
              competitors={intelligence.competitors}
              locale={locale}
              location={intelligence.location}
            />
          ) : (
            <p className="pfs-empty">{copy(locale, ["احفظ مرحلة السوق لتشغيل البحث الجغرافي.", "Save the market stage to run location research."])}</p>
          )}
          {intelligence ? (
            <>
              <div className="pfs-metrics">
                <span><small>{copy(locale, ["السكان", "Population"])}</small><strong>{intelligence.population.value?.toLocaleString() ?? "—"}</strong><em>{intelligence.population.year ?? ""}</em></span>
                <span><small>{copy(locale, ["القوة الشرائية", "Purchasing power"])}</small><strong>{intelligence.purchasingPower.value?.toLocaleString() ?? "—"}</strong><em>{intelligence.purchasingPower.year ?? ""}</em></span>
                <span><small>{copy(locale, ["المنافسون المرصودون", "Observed competitors"])}</small><strong>{intelligence.competitors.length}</strong><em>{copy(locale, ["ضمن نتيجة المزود", "Provider result"])}</em></span>
              </div>
              {intelligence.competitors.length ? (
                <div className="pfs-table-wrap">
                  <table>
                    <thead><tr><th>{copy(locale, ["المنافس", "Competitor"])}</th><th>{copy(locale, ["التصنيف", "Category"])}</th><th>{copy(locale, ["الإحداثيات", "Coordinates"])}</th></tr></thead>
                    <tbody>{intelligence.competitors.slice(0, 8).map((competitor) => <tr key={`${competitor.name}-${competitor.latitude}`}><td>{competitor.name}</td><td>{competitor.category}</td><td>{competitor.latitude.toFixed(3)}, {competitor.longitude.toFixed(3)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    );
  }

  function renderMarketing() {
    const data = sections.MARKETING;
    const objectives = data?.objectives ?? [];
    const channels = data?.channels ?? [];
    return (
      <FormCard
        description={copy(locale, ["حدّد أهداف الوصول والمزيج التسويقي والميزانية والمدة دون افتراضات تلقائية.", "Define reach objectives, channel mix, budget, and timing without automatic assumptions."])}
        icon="megaphone"
        title={copy(locale, ["الخطة التسويقية", "Marketing plan"])}
      >
        <form className="pfs-form" key={selected?.id} onSubmit={submitMarketing}>
          <fieldset className="pfs-choice-panel">
            <legend>{copy(locale, ["الأهداف التسويقية", "Marketing objectives"])}</legend>
            {([
              ["AWARENESS", ["الوعي بالعلامة", "Brand awareness"]],
              ["ACQUISITION", ["اكتساب العملاء", "Customer acquisition"]],
              ["RETENTION", ["الاحتفاظ", "Retention"]],
              ["SALES", ["نمو المبيعات", "Sales growth"]],
            ] as const).map(([value, label]) => (
              <label key={value}><input defaultChecked={objectives.includes(value)} name="objectives" type="checkbox" value={value} />{copy(locale, label)}</label>
            ))}
          </fieldset>
          <div className="pfs-form-grid">
            <label>
              {copy(locale, ["الاستراتيجية", "Strategy"])}
              <select defaultValue={data?.strategy ?? ""} name="strategy" required>
                <option disabled value="">{copy(locale, ["اختر الاستراتيجية", "Select strategy"])}</option>
                <option value="DIGITAL">{copy(locale, ["رقمية", "Digital"])}</option>
                <option value="DIRECT">{copy(locale, ["مباشرة", "Direct"])}</option>
                <option value="PARTNERSHIPS">{copy(locale, ["شراكات", "Partnerships"])}</option>
                <option value="MIXED">{copy(locale, ["مزيج متكامل", "Integrated mix"])}</option>
              </select>
            </label>
            <label>{copy(locale, ["الميزانية", "Budget"])}<input defaultValue={data?.budget ?? ""} min="0" name="budget" required step="0.01" type="number" /></label>
            <label>{copy(locale, ["أشهر الوعي", "Awareness months"])}<input defaultValue={data?.awarenessMonths ?? ""} max="36" min="0" name="awarenessMonths" required type="number" /></label>
            <label>{copy(locale, ["أشهر الإطلاق", "Launch months"])}<input defaultValue={data?.launchMonths ?? ""} max="36" min="0" name="launchMonths" required type="number" /></label>
            <label>{copy(locale, ["أشهر النمو", "Growth months"])}<input defaultValue={data?.growthMonths ?? ""} max="36" min="0" name="growthMonths" required type="number" /></label>
          </div>
          <fieldset className="pfs-choice-panel">
            <legend>{copy(locale, ["القنوات", "Channels"])}</legend>
            {([
              ["SEARCH", ["البحث", "Search"]],
              ["SOCIAL", ["الشبكات الاجتماعية", "Social media"]],
              ["EMAIL", ["البريد", "Email"]],
              ["CONTENT", ["المحتوى", "Content"]],
              ["EVENTS", ["الفعاليات", "Events"]],
              ["PARTNERS", ["الشركاء", "Partners"]],
            ] as const).map(([value, label]) => (
              <label key={value}><input defaultChecked={channels.includes(value)} name="channels" type="checkbox" value={value} />{copy(locale, label)}</label>
            ))}
          </fieldset>
          <div className="pfs-gantt" aria-label={copy(locale, ["المخطط الزمني التسويقي", "Marketing timeline"])}>
            <span><b>{copy(locale, ["الوعي", "Awareness"])}</b><i style={{ width: `${Math.min(100, (data?.awarenessMonths ?? 0) * 8)}%` }} /></span>
            <span><b>{copy(locale, ["الإطلاق", "Launch"])}</b><i style={{ width: `${Math.min(100, (data?.launchMonths ?? 0) * 8)}%` }} /></span>
            <span><b>{copy(locale, ["النمو", "Growth"])}</b><i style={{ width: `${Math.min(100, (data?.growthMonths ?? 0) * 8)}%` }} /></span>
          </div>
          <ActionBar busy={busy} locale={locale} previous={routeWithProject(steps[1].href)} />
        </form>
      </FormCard>
    );
  }

  function renderTechnical() {
    const data = sections.TECHNICAL;
    return (
      <div className="pfs-stage-stack">
        <FormCard
          description={copy(locale, ["وثّق المتطلبات الفنية والتشغيلية والموارد البشرية المرتبطة مباشرة بالمشروع.", "Document the project-specific technical, operating, and workforce requirements."])}
          icon="settings"
          title={copy(locale, ["الجانب الفني والتشغيلي", "Technical and operational study"])}
        >
          <form className="pfs-form" key={selected?.id} onSubmit={submitTechnical}>
            <div className="pfs-form-grid">
              <label>{copy(locale, ["نوع المقر", "Facility type"])}<input defaultValue={data?.facilityType ?? ""} minLength={2} name="facilityType" required /></label>
              <label>{copy(locale, ["المساحة بالمتر", "Area in square metres"])}<input defaultValue={data?.facilityArea ?? ""} min="0" name="facilityArea" required step="0.01" type="number" /></label>
              <label>{copy(locale, ["عدد المعدات", "Equipment count"])}<input defaultValue={data?.equipmentCount ?? ""} min="0" name="equipmentCount" required type="number" /></label>
              <label>{copy(locale, ["المنتجات والخدمات", "Products and services"])}<textarea defaultValue={data?.productsServices ?? ""} minLength={3} name="productsServices" required /></label>
              <label>{copy(locale, ["المواد والمدخلات", "Materials and inputs"])}<textarea defaultValue={data?.rawMaterials ?? ""} minLength={3} name="rawMaterials" required /></label>
              <label>{copy(locale, ["خطة الكادر", "Workforce plan"])}<textarea defaultValue={data?.staffingPlan ?? ""} minLength={3} name="staffingPlan" required /></label>
              <label className="is-wide">{copy(locale, ["الهيكل والمسؤوليات", "Organisation and responsibilities"])}<textarea defaultValue={data?.organizationNotes ?? ""} minLength={3} name="organizationNotes" required rows={4} /></label>
            </div>
            <ActionBar busy={busy} locale={locale} previous={routeWithProject(steps[2].href)} />
          </form>
        </FormCard>
        <section className="pfs-card pfs-org-chart">
          <h2>{copy(locale, ["هيكل تشغيلي إرشادي", "Operating structure"])}</h2>
          <div><span>{copy(locale, ["الإدارة", "Management"])}</span><i /><span>{copy(locale, ["التشغيل", "Operations"])}</span><span>{copy(locale, ["المالية", "Finance"])}</span><span>{copy(locale, ["التسويق", "Marketing"])}</span></div>
          <p>{copy(locale, ["الهيكل بصري فقط؛ تعتمد المسؤوليات النهائية على النص المحفوظ أعلاه.", "The chart is visual only; final responsibilities come from the saved notes above."])}</p>
        </section>
      </div>
    );
  }

  function renderFinancial() {
    const data = sections.FINANCIAL ?? latestPlan?.inputs;
    const fields: ReadonlyArray<[keyof FinancialData, readonly [string, string]]> = [
      ["initialInvestment", ["الاستثمار الأولي", "Initial investment"]],
      ["monthlyFixedCosts", ["التكاليف الثابتة الشهرية", "Monthly fixed costs"]],
      ["variableCostPerUnit", ["التكلفة المتغيرة للوحدة", "Variable cost per unit"]],
      ["pricePerUnit", ["سعر الوحدة", "Unit price"]],
      ["monthlyUnits", ["الوحدات الشهرية", "Monthly units"]],
      ["months", ["مدة التحليل بالأشهر", "Analysis months"]],
      ["annualDiscountRate", ["الخصم السنوي %", "Annual discount %"]],
      ["annualInflationRate", ["التضخم السنوي %", "Annual inflation %"]],
      ["taxRate", ["الضريبة %", "Tax rate %"]],
    ];
    return (
      <div className="pfs-stage-stack">
        <FormCard
          description={copy(locale, ["تُحسب المؤشرات حتميًا من المدخلات المحفوظة، ولا تستخدم أي قيم تجريبية.", "Metrics are calculated deterministically from saved inputs; no demo values are used."])}
          icon="wallet"
          title={copy(locale, ["الجانب المالي", "Financial study"])}
        >
          <form className="pfs-form" key={`${selected?.id}-${latestPlan?.version ?? 0}`} onSubmit={submitFinancial}>
            <div className="pfs-form-grid pfs-form-grid--numbers">
              {fields.map(([name, label]) => (
                <label key={name}>{copy(locale, label)}<input defaultValue={data?.[name] ?? ""} min="0" name={name} required step={name === "months" || name === "monthlyUnits" ? "1" : "0.01"} type="number" /></label>
              ))}
            </div>
            <ActionBar busy={busy} locale={locale} previous={routeWithProject(steps[3].href)} submitLabel={copy(locale, ["احسب واحفظ", "Calculate and save"])} />
          </form>
        </FormCard>
        {financialResult ? (
          <section className="pfs-card">
            <header className="pfs-card-heading"><div><h2>{copy(locale, ["نتائج الحساب", "Calculated results"])}</h2><p>{copy(locale, ["آخر خطة مالية محفوظة", "Latest saved financial plan"])}</p></div><span className="pfs-source-badge">v{latestPlan?.version ?? 1}</span></header>
            <div className="pfs-metrics pfs-metrics--financial">
              <span><small>{copy(locale, ["الإيراد الشهري", "Monthly revenue"])}</small><strong>{money(financialResult.monthlyRevenue)}</strong></span>
              <span><small>{copy(locale, ["الربح الشهري", "Monthly profit"])}</small><strong>{money(financialResult.monthlyProfit)}</strong></span>
              <span><small>ROI</small><strong>{financialResult.roiPercent.toFixed(1)}%</strong></span>
              <span><small>NPV</small><strong>{money(financialResult.netPresentValue)}</strong></span>
              <span><small>{copy(locale, ["نقطة التعادل", "Break-even"])}</small><strong>{financialResult.breakEvenUnits.toLocaleString()}</strong></span>
              <span><small>{copy(locale, ["فترة الاسترداد", "Payback"])}</small><strong>{financialResult.paybackMonths === null ? "—" : `${financialResult.paybackMonths.toFixed(1)} ${copy(locale, ["شهر", "months"])}`}</strong></span>
            </div>
          </section>
        ) : (
          <p className="pfs-empty">{copy(locale, ["أدخل البيانات لتظهر المؤشرات المالية.", "Enter the inputs to produce financial metrics."])}</p>
        )}
      </div>
    );
  }

  function renderSwot() {
    const data = sections.SWOT;
    return (
      <FormCard description={copy(locale, ["سجّل عوامل SWOT والتوصية المبنية عليها ضمن الدراسة.", "Record SWOT factors and the evidence-based recommendation."])} icon="shield" title={copy(locale, ["تحليل SWOT والمخاطر", "SWOT and risk analysis"])}>
        <form className="pfs-form" key={selected?.id} onSubmit={submitSwot}>
          <div className="pfs-swot-grid">
            <label className="is-strength">{copy(locale, ["نقاط القوة", "Strengths"])}<textarea defaultValue={data?.strengths ?? ""} minLength={3} name="strengths" required /></label>
            <label className="is-weakness">{copy(locale, ["نقاط الضعف", "Weaknesses"])}<textarea defaultValue={data?.weaknesses ?? ""} minLength={3} name="weaknesses" required /></label>
            <label className="is-opportunity">{copy(locale, ["الفرص", "Opportunities"])}<textarea defaultValue={data?.opportunities ?? ""} minLength={3} name="opportunities" required /></label>
            <label className="is-threat">{copy(locale, ["التهديدات", "Threats"])}<textarea defaultValue={data?.threats ?? ""} minLength={3} name="threats" required /></label>
          </div>
          <label className="pfs-wide-label">{copy(locale, ["التوصية", "Recommendation"])}<textarea defaultValue={data?.recommendation ?? ""} minLength={10} name="recommendation" required rows={4} /></label>
          <ActionBar busy={busy} locale={locale} previous={routeWithProject(steps[4].href)} />
        </form>
      </FormCard>
    );
  }

  function renderTimeline() {
    const data = sections.TIMELINE;
    return (
      <FormCard description={copy(locale, ["حوّل الدراسة إلى مراحل زمنية قابلة للمراجعة قبل إصدار التقرير.", "Translate the study into reviewable delivery stages before reporting."])} icon="rocket" title={copy(locale, ["الجدول الزمني والتنفيذ", "Timeline and delivery"])}>
        <form className="pfs-form" key={selected?.id} onSubmit={submitTimeline}>
          <div className="pfs-form-grid">
            <label>{copy(locale, ["تاريخ البداية", "Start date"])}<input defaultValue={data?.startDate ?? ""} name="startDate" required type="date" /></label>
            <label>{copy(locale, ["المدة الكلية", "Total months"])}<input defaultValue={data?.durationMonths ?? ""} max="120" min="1" name="durationMonths" required type="number" /></label>
            <label>{copy(locale, ["الإعداد", "Preparation"])}<input defaultValue={data?.preparationMonths ?? ""} max="120" min="0" name="preparationMonths" required type="number" /></label>
            <label>{copy(locale, ["الإطلاق", "Launch"])}<input defaultValue={data?.launchMonths ?? ""} max="120" min="0" name="launchMonths" required type="number" /></label>
            <label>{copy(locale, ["النمو", "Growth"])}<input defaultValue={data?.growthMonths ?? ""} max="120" min="0" name="growthMonths" required type="number" /></label>
            <label className="is-wide">{copy(locale, ["المعالم الرئيسية", "Key milestones"])}<textarea defaultValue={data?.milestones ?? ""} minLength={3} name="milestones" required rows={4} /></label>
          </div>
          <ActionBar busy={busy} locale={locale} previous={routeWithProject("/projects/feasibility/pro/swot")} />
        </form>
      </FormCard>
    );
  }

  function renderReview() {
    const ready = completion === 100 && Boolean(financialResult);
    return (
      <div className="pfs-review-grid">
        <section className="pfs-card pfs-checklist">
          <header className="pfs-card-heading"><div><h2>{copy(locale, ["مراجعة الأقسام", "Section review"])}</h2><p>{copy(locale, ["تعكس الحالة السجلات المحفوظة فقط.", "Status reflects saved records only."])}</p></div></header>
          <ul>{sectionLabels.map((section) => {
            const complete = completedSections.has(section.key);
            return <li key={section.key}><span className={complete ? "is-complete" : ""}><Icon name={complete ? "check" : "x"} /></span><b>{copy(locale, section.label)}</b><small>{complete ? copy(locale, ["مكتمل", "Complete"]) : copy(locale, ["يتطلب إدخالًا", "Input required"])}</small><Link href={routeWithProject(section.route)}>{copy(locale, ["مراجعة", "Review"])}</Link></li>;
          })}</ul>
        </section>
        <section className="pfs-card pfs-quality-card">
          <div className="pfs-score" style={{ "--score": `${completion * 3.6}deg` } as React.CSSProperties}><strong>{completion}%</strong><small>{copy(locale, ["اكتمال الدراسة", "Study completion"])}</small></div>
          <h2>{ready ? copy(locale, ["الدراسة جاهزة للتقرير", "Study is ready for reporting"]) : copy(locale, ["الدراسة غير مكتملة", "Study is incomplete"])}</h2>
          <p>{ready ? copy(locale, ["اكتملت الأقسام المطلوبة وتوجد خطة مالية محفوظة.", "All required sections and a saved financial plan are available."]) : copy(locale, ["أكمل الأقسام الناقصة والخطة المالية قبل إصدار التقرير.", "Complete missing sections and the financial plan before reporting."])}</p>
          {ready ? <Link className="pfs-button pfs-button--primary" href={routeWithProject(steps[6].href)}>{copy(locale, ["إنشاء التقرير النهائي", "Create final report"])}<Icon name="arrow" /></Link> : <button className="pfs-button pfs-button--primary" disabled type="button">{copy(locale, ["التقرير غير متاح", "Report unavailable"])}</button>}
        </section>
        {financialResult ? (
          <section className="pfs-card pfs-review-metrics">
            <h2>{copy(locale, ["ملخص النتائج", "Results summary"])}</h2>
            <div className="pfs-metrics">
              <span><small>ROI</small><strong>{financialResult.roiPercent.toFixed(1)}%</strong></span>
              <span><small>NPV</small><strong>{money(financialResult.netPresentValue)}</strong></span>
              <span><small>{copy(locale, ["الربح الشهري", "Monthly profit"])}</small><strong>{money(financialResult.monthlyProfit)}</strong></span>
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderReport() {
    const ready = completion === 100 && Boolean(financialResult && selected);
    if (!ready || !selected) {
      return (
        <section className="pfs-card pfs-report-gate">
          <Icon name="lock" />
          <h2>{copy(locale, ["التقرير النهائي غير جاهز", "The final report is not ready"])}</h2>
          <p>{copy(locale, ["أكمل جميع الأقسام المطلوبة والحساب المالي أولًا.", "Complete every required section and the financial calculation first."])}</p>
          <Link className="pfs-button pfs-button--primary" href={routeWithProject(steps[5].href)}>{copy(locale, ["العودة للمراجعة", "Return to review"])}</Link>
        </section>
      );
    }
    return (
      <div className="pfs-report-layout">
        <section className="pfs-report-toolbar">
          <div><span>{copy(locale, ["التقرير النهائي", "Final report"])}</span><strong>{selected.name}</strong></div>
          <a className="pfs-button pfs-button--primary" href={`/api/projects/${selected.id}/report`}>{copy(locale, ["تنزيل PDF", "Download PDF"])}<Icon name="arrow" /></a>
          <button className="pfs-button pfs-button--ghost" onClick={() => window.print()} type="button">{copy(locale, ["طباعة", "Print"])}</button>
          <button className="pfs-button pfs-button--ghost" disabled title={copy(locale, ["مشاركة البريد غير مهيأة", "Email sharing is not configured"])} type="button">{copy(locale, ["مشاركة", "Share"])}</button>
        </section>
        <article className="pfs-report-paper">
          <header><div><strong>Jenan <b>PRO</b></strong><small>{copy(locale, ["دراسة جدوى احترافية", "Professional feasibility study"])}</small></div><span>{new Date().toLocaleDateString(ar ? "ar-SA" : "en-GB")}</span></header>
          <section className="pfs-report-cover"><small>{copy(locale, ["التقرير النهائي", "Final report"])}</small><h1>{selected.name}</h1><p>{sections.GENERAL?.description}</p><div><span>{selected.sector ?? "—"}</span><span>{sections.GENERAL?.location ?? selected.countryCode ?? "—"}</span><span>{selected.currency}</span></div></section>
          <section className="pfs-report-summary"><h2>{copy(locale, ["الملخص التنفيذي", "Executive summary"])}</h2><p>{sections.SWOT?.recommendation}</p><div className="pfs-metrics"><span><small>ROI</small><strong>{financialResult?.roiPercent.toFixed(1)}%</strong></span><span><small>NPV</small><strong>{money(financialResult?.netPresentValue)}</strong></span><span><small>{copy(locale, ["نقطة التعادل", "Break-even"])}</small><strong>{financialResult?.breakEvenUnits.toLocaleString()}</strong></span><span><small>{copy(locale, ["الاسترداد", "Payback"])}</small><strong>{financialResult?.paybackMonths === null ? "—" : `${financialResult?.paybackMonths.toFixed(1)} ${copy(locale, ["شهر", "months"])}`}</strong></span></div></section>
          <section className="pfs-report-columns"><div><h2>{copy(locale, ["السوق", "Market"])}</h2><p>{sections.MARKET?.marketSizeNotes}</p><p>{sections.MARKET?.competitorNotes}</p></div><div><h2>SWOT</h2><p>{sections.SWOT?.strengths}</p><p>{sections.SWOT?.opportunities}</p></div><div><h2>{copy(locale, ["التنفيذ", "Delivery"])}</h2><p>{sections.TIMELINE?.milestones}</p><p>{sections.TECHNICAL?.staffingPlan}</p></div></section>
          <footer>{copy(locale, ["أُنشئ من السجلات المحفوظة في Jenan PRO", "Generated from records saved in Jenan PRO"])}</footer>
        </article>
      </div>
    );
  }

  function renderStage() {
    if (route.endsWith("/new")) return renderGeneral();
    if (route.endsWith("/market")) return renderMarket();
    if (route.endsWith("/marketing")) return renderMarketing();
    if (route.endsWith("/technical") || route.endsWith("/operational")) return renderTechnical();
    if (route.endsWith("/financial")) return renderFinancial();
    if (route.endsWith("/swot")) return renderSwot();
    if (route.endsWith("/timeline")) return renderTimeline();
    if (route.endsWith("/report")) return renderReport();
    return renderReview();
  }

  return (
    <main
      className="professional-feasibility"
      data-project-kind="wizard"
      data-project-professional-flow="true"
      data-project-route={route}
      dir={ar ? "rtl" : "ltr"}
    >
      <ProjectsCommandHeader active="feasibility" locale={locale} userLabel={userLabel} />
      <header className="pfs-wizard-header">
        <div className="pfs-wizard-title">
          <span><Icon name="pieChart" /></span>
          <div>
            <small>{copy(locale, ["دراسة الجدوى الاحترافية", "Professional feasibility study"])}</small>
            <h1>{copy(locale, activeStep.label)}</h1>
          </div>
        </div>
        <nav className="pfs-stepper" aria-label={copy(locale, ["مراحل الدراسة", "Study stages"])}>
          {steps.map((step, index) => {
            const complete =
              index < 5
                ? completedSections.has(step.key as SectionKey)
                : index === 5
                  ? completion === 100
                  : completion === 100 && Boolean(financialResult);
            return (
              <Link
                aria-current={index === activeStepIndex ? "step" : undefined}
                className={[
                  index === activeStepIndex ? "is-active" : "",
                  complete ? "is-complete" : "",
                ].filter(Boolean).join(" ")}
                href={routeWithProject(step.href)}
                key={step.href}
              >
                <i>{complete ? <Icon name="check" /> : index + 1}</i>
                <span>{copy(locale, step.short)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="pfs-progress-row">
          <span>{copy(locale, ["نسبة اكتمال الدراسة", "Study completion"])}</span>
          <div><i style={{ width: `${completion}%` }} /></div>
          <strong>{completion}%</strong>
        </div>
      </header>
      <section className="pfs-project-bar">
        <label>
          {copy(locale, ["المشروع النشط", "Active project"])}
          <select
            disabled={!projects.length}
            onChange={(event) => selectProject(event.target.value)}
            value={selectedId}
          >
            {!projects.length ? <option value="">{copy(locale, ["لا توجد مشاريع", "No projects"])}</option> : null}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <span>{selected ? [selected.sector, selected.countryCode, selected.currency].filter(Boolean).join(" · ") : copy(locale, ["أنشئ مشروعًا من المرحلة الأولى", "Create a project in the first stage"])}</span>
        {selected ? <small>{copy(locale, ["آخر حفظ", "Last saved"])}: {selected.feasibilityStudyUpdatedAt ? new Date(selected.feasibilityStudyUpdatedAt).toLocaleString(ar ? "ar-SA" : "en-GB") : copy(locale, ["لم يبدأ", "Not started"])}</small> : null}
      </section>
      {message ? <p className="pfs-message" role="status">{message}</p> : null}
      {loading ? <p className="pfs-empty">{copy(locale, ["جارٍ تحميل الدراسة...", "Loading study..."])}</p> : null}
      {!loading && !selected && !route.endsWith("/new") ? (
        <section className="pfs-card pfs-report-gate"><Icon name="briefcase" /><h2>{copy(locale, ["لا يوجد مشروع لهذه الدراسة", "No project is available for this study"])}</h2><Link className="pfs-button pfs-button--primary" href={steps[0].href}>{copy(locale, ["إنشاء مشروع", "Create project"])}</Link></section>
      ) : null}
      {!loading && (selected || route.endsWith("/new")) ? (
        <div className="pfs-workspace">
          <section className="pfs-stage" data-project-focus={activeStep.key.toLowerCase()}>
            {renderStage()}
          </section>
          <aside className="pfs-contents">
            <header><Icon name="grid" /><div><strong>{copy(locale, ["محتوى الدراسة", "Study contents"])}</strong><small>{completedSections.size}/{sectionLabels.length} {copy(locale, ["أقسام", "sections"])}</small></div></header>
            <ol>{sectionLabels.map((section, index) => {
              const complete = completedSections.has(section.key);
              return <li className={complete ? "is-complete" : ""} key={section.key}><Link href={routeWithProject(section.route)}><i>{complete ? <Icon name="check" /> : index + 1}</i><span>{copy(locale, section.label)}</span></Link></li>;
            })}</ol>
            <div><Icon name="shield" /><p>{copy(locale, ["تُحفظ المدخلات في المشروع، وتُسجل كل عملية تعديل للمراجعة.", "Inputs are stored on the project and each change is audit logged."])}</p></div>
          </aside>
        </div>
      ) : null}
      <footer className="pfs-footer"><span>© {new Date().getFullYear()} Jenan PRO</span><span>{copy(locale, ["دراسة مبنية على البيانات المدخلة والمصادر الظاهرة", "Study based on entered data and disclosed sources"])}</span></footer>
    </main>
  );
}
