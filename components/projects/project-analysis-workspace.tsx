"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ProjectsCommandHeader } from "@/components/projects/projects-command-header";
import { Icon, type IconName } from "@/components/ui/icons";
import type { ProjectFlowDefinition } from "@/lib/projects/project-flow-routes";
import type { Locale } from "@/types/i18n";

type JsonRecord = Record<string, unknown>;
type AnalysisStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
type AnalysisInput = {
  idea: string;
  city: string;
  targetAudience: string;
  budgetRange?: string;
};
type AnalysisResult = {
  generatedAt: string;
  evidenceCompleteness: number;
  competitionLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  purchasingPowerLevel: "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
  dataRiskLevel: "LOW" | "MODERATE" | "HIGH";
  competitorCount: number | null;
  sourceCount: number;
  limitationCount: number;
  recommendations: string[];
};
type AnalysisStudy = {
  status: AnalysisStatus;
  input?: AnalysisInput;
  result?: AnalysisResult;
  error?: string;
  updatedAt?: string;
};
type IntelligenceMetric = {
  value: number | null;
  unit?: string;
  period?: string;
};
type Competitor = {
  id?: string;
  name?: string;
  kind?: string;
  distanceKm?: number | null;
  latitude?: number;
  longitude?: number;
};
type IntelligenceSource = {
  source?: string;
  url?: string | null;
  retrievedAt?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  note?: string;
};
type IntelligenceSnapshot = {
  id: string;
  query: string;
  location?: unknown;
  population?: unknown;
  purchasingPower?: unknown;
  costInflation?: unknown;
  competitors?: unknown;
  sources?: unknown;
  limitations?: unknown;
  fetchedAt: string;
};
type AnalysisProject = {
  id: string;
  name: string;
  sector?: string | null;
  countryCode?: string | null;
  analysisStudy?: unknown;
  analysisStudyUpdatedAt?: string | null;
  intelligenceSnapshots: IntelligenceSnapshot[];
  assessments: Array<{
    id: string;
    type: string;
    score: number;
    verdict: string;
  }>;
  risks: Array<{
    id: string;
    title: string;
    score: number;
    status: string;
  }>;
  evidenceFiles: Array<{
    id: string;
    fileName: string;
  }>;
};

const resultRecommendations: Record<string, readonly [string, string]> = {
  VALIDATE_MARKET_DEMAND: [
    "تحقق من الطلب محليًا بمقابلات أو تجربة سوقية قبل الالتزام بالاستثمار.",
    "Validate local demand with interviews or a market pilot before committing investment.",
  ],
  DIFFERENTIATE_OFFER: [
    "صِغ عرضًا متمايزًا بوضوح لأن بيانات المنافسين تشير إلى سوق يحتاج تموضعًا أدق.",
    "Define a clearly differentiated offer because competitor evidence calls for sharper positioning.",
  ],
  OBTAIN_LOCAL_PURCHASING_DATA: [
    "أضف مصدرًا محليًا حديثًا للقوة الشرائية؛ المؤشر الدولي وحده غير متاح أو غير كافٍ.",
    "Add a current local purchasing-power source; international coverage is unavailable or insufficient.",
  ],
  VERIFY_LOCATION: [
    "راجع اسم الموقع أو إحداثياته قبل الاعتماد على نتيجة المنافسين.",
    "Verify the location name or coordinates before relying on competitor results.",
  ],
  REVIEW_SOURCE_LIMITATIONS: [
    "راجع قيود المصادر الظاهرة في التقرير وعالج الفجوات قبل القرار النهائي.",
    "Review the reported source limitations and close the gaps before a final decision.",
  ],
  PROCEED_TO_DETAILED_FEASIBILITY: [
    "اكتمال الأدلة يسمح بالانتقال إلى دراسة جدوى تفصيلية مع بقاء الحاجة لمراجعة بشرية.",
    "Evidence coverage supports moving to detailed feasibility, subject to human review.",
  ],
};

const audienceLabels: Record<string, readonly [string, string]> = {
  CONSUMERS: ["الأفراد والمستهلكون", "Consumers"],
  BUSINESSES: ["الشركات والمنشآت", "Businesses"],
  YOUTH: ["الشباب والموظفون", "Young people and employees"],
  FAMILIES: ["العائلات", "Families"],
};

const budgetLabels: Record<string, readonly [string, string]> = {
  UNDER_100K: ["أقل من 100 ألف ر.س", "Under SAR 100K"],
  BETWEEN_100K_500K: ["100 - 500 ألف ر.س", "SAR 100K - 500K"],
  BETWEEN_500K_1M: ["500 ألف - مليون ر.س", "SAR 500K - 1M"],
  ABOVE_1M: ["أكثر من مليون ر.س", "Above SAR 1M"],
};

function t(ar: boolean, arabic: string, english: string) {
  return ar ? arabic : english;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readStudy(value: unknown): AnalysisStudy {
  const record = asRecord(value);
  const status = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"].includes(
    String(record?.status),
  )
    ? (record?.status as AnalysisStatus)
    : "PENDING";
  const inputRecord = asRecord(record?.input);
  const resultRecord = asRecord(record?.result);
  const input =
    typeof inputRecord?.idea === "string" &&
    typeof inputRecord.city === "string" &&
    typeof inputRecord.targetAudience === "string"
      ? ({
          idea: inputRecord.idea,
          city: inputRecord.city,
          targetAudience: inputRecord.targetAudience,
          ...(typeof inputRecord.budgetRange === "string"
            ? { budgetRange: inputRecord.budgetRange }
            : {}),
        } satisfies AnalysisInput)
      : undefined;
  const result =
    typeof resultRecord?.evidenceCompleteness === "number"
      ? ({
          generatedAt:
            typeof resultRecord.generatedAt === "string"
              ? resultRecord.generatedAt
              : "",
          evidenceCompleteness: resultRecord.evidenceCompleteness,
          competitionLevel: String(
            resultRecord.competitionLevel,
          ) as AnalysisResult["competitionLevel"],
          purchasingPowerLevel: String(
            resultRecord.purchasingPowerLevel,
          ) as AnalysisResult["purchasingPowerLevel"],
          dataRiskLevel: String(
            resultRecord.dataRiskLevel,
          ) as AnalysisResult["dataRiskLevel"],
          competitorCount:
            typeof resultRecord.competitorCount === "number"
              ? resultRecord.competitorCount
              : null,
          sourceCount:
            typeof resultRecord.sourceCount === "number"
              ? resultRecord.sourceCount
              : 0,
          limitationCount:
            typeof resultRecord.limitationCount === "number"
              ? resultRecord.limitationCount
              : 0,
          recommendations: asArray(resultRecord.recommendations).filter(
            (item): item is string => typeof item === "string",
          ),
        } satisfies AnalysisResult)
      : undefined;
  return {
    status,
    input,
    result,
    error: typeof record?.error === "string" ? record.error : undefined,
    updatedAt:
      typeof record?.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function readMetric(value: unknown): IntelligenceMetric {
  const record = asRecord(value);
  return {
    value: typeof record?.value === "number" ? record.value : null,
    unit: typeof record?.unit === "string" ? record.unit : undefined,
    period: typeof record?.period === "string" ? record.period : undefined,
  };
}

function readCompetitors(value: unknown): Competitor[] {
  return asArray(value)
    .map(asRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      kind: typeof item.kind === "string" ? item.kind : undefined,
      ...(typeof item.category === "string" ? { kind: item.category } : {}),
      distanceKm:
        typeof item.distanceKm === "number" ? item.distanceKm : null,
      latitude:
        typeof item.latitude === "number" ? item.latitude : undefined,
      longitude:
        typeof item.longitude === "number" ? item.longitude : undefined,
    }));
}

function readSources(value: unknown): IntelligenceSource[] {
  return asArray(value)
    .map(asRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .map((item) => ({
      source: typeof item.source === "string" ? item.source : undefined,
      url: typeof item.url === "string" ? item.url : null,
      retrievedAt:
        typeof item.retrievedAt === "string"
          ? item.retrievedAt
          : typeof item.fetchedAt === "string"
            ? item.fetchedAt
            : undefined,
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(item.confidence))
        ? (item.confidence as IntelligenceSource["confidence"])
        : undefined,
      note: typeof item.note === "string" ? item.note : undefined,
    }));
}

function readLimitations(value: unknown) {
  return asArray(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  maximumFractionDigits = 1,
) {
  if (value === null || value === undefined) return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    maximumFractionDigits,
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function formatDate(value: string | undefined, locale: Locale) {
  if (!value) return locale === "ar" ? "غير متاح" : "Unavailable";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function levelLabel(
  value: string | undefined,
  ar: boolean,
  unavailable = true,
) {
  const labels: Record<string, readonly [string, string]> = {
    LOW: ["منخفض", "Low"],
    MODERATE: ["متوسط", "Moderate"],
    HIGH: ["مرتفع", "High"],
    UNAVAILABLE: ["غير متاح", "Unavailable"],
  };
  return labels[value ?? (unavailable ? "UNAVAILABLE" : "LOW")]
    ? t(ar, ...labels[value ?? (unavailable ? "UNAVAILABLE" : "LOW")])
    : t(ar, "غير متاح", "Unavailable");
}

async function projectRequest<T>(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    result?: T;
    success?: boolean;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message ?? "Project request failed");
  }
  return payload.result as T;
}

async function listProjects() {
  const response = await fetch("/api/projects?limit=100&offset=0", {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
    projects?: AnalysisProject[];
    success?: boolean;
  } | null;
  if (!response.ok || !payload?.success || !payload.projects) {
    throw new Error(payload?.message ?? "Projects could not be loaded");
  }
  return payload.projects;
}

function StageNavigation({
  active,
  ar,
  projectId,
}: {
  active: "input" | "progress" | "results" | "report" | "print";
  ar: boolean;
  projectId: string;
}) {
  const stages: Array<{
    icon: IconName;
    id: typeof active;
    label: readonly [string, string];
    path: string;
  }> = [
    {
      id: "input",
      icon: "sparkles",
      label: ["فكرة المشروع", "Project idea"],
      path: "/projects/analysis/new",
    },
    {
      id: "progress",
      icon: "activity",
      label: ["سير التحليل", "Analysis progress"],
      path: "/projects/analysis/progress",
    },
    {
      id: "results",
      icon: "barChart",
      label: ["النتائج", "Results"],
      path: "/projects/analysis/result",
    },
    {
      id: "report",
      icon: "eye",
      label: ["التقرير", "Report"],
      path: "/projects/analysis/report",
    },
    {
      id: "print",
      icon: "briefcase",
      label: ["الطباعة والتصدير", "Print and export"],
      path: "/projects/analysis/print",
    },
  ];
  const activeIndex = stages.findIndex((stage) => stage.id === active);
  return (
    <nav className="pa-stage-navigation" aria-label={t(ar, "مراحل تحليل المشروع", "Project analysis stages")}>
      {stages.map((stage, index) => (
        <Link
          className={[
            index < activeIndex ? "is-complete" : "",
            index === activeIndex ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          href={`${stage.path}?project=${projectId}`}
          key={stage.id}
        >
          <span><Icon name={index < activeIndex ? "check" : stage.icon} /></span>
          <small>{index + 1}</small>
          <strong>{t(ar, ...stage.label)}</strong>
        </Link>
      ))}
    </nav>
  );
}

function ProjectToolbar({
  ar,
  onProjectChange,
  projects,
  selectedId,
}: {
  ar: boolean;
  onProjectChange: (projectId: string) => void;
  projects: AnalysisProject[];
  selectedId: string;
}) {
  return (
    <div className="pa-project-toolbar">
      <label>
        <span>{t(ar, "المشروع الحالي", "Current project")}</span>
        <select value={selectedId} onChange={(event) => onProjectChange(event.target.value)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <Link href="/projects/analysis">
        <Icon name="plus" />
        {t(ar, "تحليل فكرة جديدة", "Analyze a new idea")}
      </Link>
    </div>
  );
}

function InputSummary({
  ar,
  project,
  study,
}: {
  ar: boolean;
  project: AnalysisProject;
  study: AnalysisStudy;
}) {
  const input = study.input;
  return (
    <section className="pa-page pa-input-page" data-testid="analysis-input-summary">
      <header className="pa-page-heading">
        <div>
          <span><Icon name="sparkles" />{t(ar, "المرحلة الأولى", "Stage one")}</span>
          <h1>{t(ar, "مدخلات تحليل المشروع", "Project analysis input")}</h1>
          <p>{t(ar, "هذه هي البيانات الفعلية المحفوظة التي يعتمد عليها التحليل.", "These are the saved inputs used by the analysis.")}</p>
        </div>
        <Link className="pa-primary-button" href="/projects/analysis">
          <Icon name="plus" />{t(ar, "إدخال فكرة أخرى", "Enter another idea")}
        </Link>
      </header>
      {input ? (
        <div className="pa-input-grid">
          <article className="is-wide">
            <span>{t(ar, "فكرة المشروع", "Project idea")}</span>
            <strong>{input.idea}</strong>
          </article>
          <article><span>{t(ar, "القطاع", "Sector")}</span><strong>{project.sector ?? t(ar, "غير محدد", "Not specified")}</strong></article>
          <article><span>{t(ar, "المدينة", "City")}</span><strong>{input.city}</strong></article>
          <article><span>{t(ar, "الفئة المستهدفة", "Target audience")}</span><strong>{audienceLabels[input.targetAudience] ? t(ar, ...audienceLabels[input.targetAudience]) : input.targetAudience}</strong></article>
          <article><span>{t(ar, "الميزانية التقديرية", "Estimated budget")}</span><strong>{input.budgetRange && budgetLabels[input.budgetRange] ? t(ar, ...budgetLabels[input.budgetRange]) : t(ar, "غير محددة", "Not specified")}</strong></article>
          <article><span>{t(ar, "ملفات الأدلة", "Evidence files")}</span><strong>{project.evidenceFiles.length}</strong></article>
        </div>
      ) : (
        <div className="pa-empty-state">
          <Icon name="shield" />
          <h2>{t(ar, "لا توجد مدخلات تحليل محفوظة", "No analysis input is saved")}</h2>
          <p>{t(ar, "ابدأ من صفحة تحليل مشروع لإدخال الفكرة والمدينة والفئة المستهدفة.", "Start from the project analysis page to enter the idea, city, and audience.")}</p>
        </div>
      )}
    </section>
  );
}

function ProgressScreen({
  ar,
  busy,
  onRetry,
  projectId,
  study,
}: {
  ar: boolean;
  busy: boolean;
  onRetry: () => void;
  projectId: string;
  study: AnalysisStudy;
}) {
  const completed = study.status === "COMPLETED";
  const failed = study.status === "FAILED";
  const pending = study.status === "PENDING";
  const progress = completed || failed ? 100 : busy || study.status === "PROCESSING" ? 62 : 18;
  const steps = [
    {
      complete: !pending,
      current: pending,
      title: t(ar, "التحقق من مدخلات المشروع", "Validating project input"),
      note: t(ar, "الفكرة والموقع والفئة المستهدفة", "Idea, location, and target audience"),
    },
    {
      complete: completed,
      current: busy || study.status === "PROCESSING",
      title: t(ar, "جمع مؤشرات السوق الموثقة", "Collecting verified market indicators"),
      note: t(ar, "الموقع والسكان والقوة الشرائية والتضخم", "Location, population, purchasing power, and inflation"),
    },
    {
      complete: completed,
      current: false,
      title: t(ar, "رصد المنافسين القريبين", "Discovering nearby competitors"),
      note: t(ar, "باستخدام نطاق البحث المتاح في المصدر", "Using the source's available search radius"),
    },
    {
      complete: completed,
      current: false,
      title: t(ar, "اشتقاق النتائج والتوصيات", "Deriving results and recommendations"),
      note: t(ar, "قواعد حتمية دون أرقام سوق افتراضية", "Deterministic rules without invented market figures"),
    },
  ];
  return (
    <section className="pa-page pa-progress-page" data-testid="analysis-progress">
      <header className="pa-page-heading is-centered">
        <div>
          <span><Icon name="activity" />{t(ar, "المرحلة الثانية", "Stage two")}</span>
          <h1>{completed ? t(ar, "اكتمل تحليل المشروع", "Project analysis complete") : failed ? t(ar, "تعذر إكمال التحليل", "Analysis could not be completed") : t(ar, "جارٍ تحليل مشروعك", "Analyzing your project")}</h1>
          <p>{completed ? t(ar, "حُفظت النتائج والمصادر والقيود ويمكنك الانتقال إلى التفاصيل.", "Results, sources, and limitations are saved and ready for review.") : failed ? study.error ?? t(ar, "حدث خطأ أثناء التحليل.", "An error occurred during analysis.") : t(ar, "نجمع البيانات الفعلية ونحوّلها إلى مؤشرات قابلة للمراجعة.", "We are collecting actual data and converting it into reviewable indicators.")}</p>
        </div>
      </header>
      <div className={`pa-progress-orbit ${completed ? "is-complete" : failed ? "is-failed" : ""}`}>
        <div><Icon name={completed ? "check" : failed ? "x" : "brain"} /><strong>{progress}%</strong><small>{completed ? t(ar, "مكتمل", "Complete") : failed ? t(ar, "متوقف", "Stopped") : t(ar, "قيد التنفيذ", "In progress")}</small></div>
      </div>
      <div className="pa-progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="pa-progress-steps">
        {steps.map((step, index) => (
          <article className={step.complete ? "is-complete" : step.current ? "is-current" : ""} key={step.title}>
            <span>{step.complete ? <Icon name="check" /> : index + 1}</span>
            <div><strong>{step.title}</strong><small>{step.note}</small></div>
          </article>
        ))}
      </div>
      <div className="pa-progress-actions">
        {completed ? <Link className="pa-primary-button" href={`/projects/analysis/details?project=${projectId}`}><Icon name="barChart" />{t(ar, "عرض التفاصيل", "View details")}</Link> : null}
        {failed ? <button className="pa-primary-button" disabled={busy} onClick={onRetry} type="button"><Icon name="activity" />{t(ar, "إعادة المحاولة", "Retry")}</button> : null}
        {!completed && !failed ? <small>{t(ar, "لا تغلق الصفحة أثناء الطلب. ستبقى النتيجة محفوظة بعد اكتماله.", "Keep the page open during the request. The result remains saved after completion.")}</small> : null}
      </div>
    </section>
  );
}

function EvidenceMap({
  ar,
  competitors,
  location,
}: {
  ar: boolean;
  competitors: Competitor[];
  location?: JsonRecord;
}) {
  const centerLatitude =
    typeof location?.latitude === "number" ? location.latitude : undefined;
  const centerLongitude =
    typeof location?.longitude === "number" ? location.longitude : undefined;
  const points =
    centerLatitude === undefined || centerLongitude === undefined
      ? []
      : competitors
          .filter(
            (competitor) =>
              competitor.latitude !== undefined &&
              competitor.longitude !== undefined,
          )
          .slice(0, 12);
  const coordinateSpan = Math.max(
    0.001,
    ...points.flatMap((competitor) => [
      Math.abs(competitor.latitude! - centerLatitude!),
      Math.abs(competitor.longitude! - centerLongitude!),
    ]),
  );
  return (
    <div className="pa-evidence-map">
      <div className="pa-map-grid" aria-label={t(ar, "مخطط نسبي لإحداثيات المنافسين من OpenStreetMap", "Relative coordinate plot of competitors from OpenStreetMap")}>
        <span className="pa-map-center"><Icon name="building" /></span>
        {points.map((competitor, index) => {
          const style = {
            "--pa-x": `${50 + ((competitor.longitude! - centerLongitude!) / coordinateSpan) * 36}%`,
            "--pa-y": `${50 - ((competitor.latitude! - centerLatitude!) / coordinateSpan) * 36}%`,
          } as CSSProperties;
          return <i key={competitor.id ?? `${competitor.name}-${index}`} style={style}>{index + 1}</i>;
        })}
        {!location ? <strong>{t(ar, "تعذر تحديد الموقع", "Location unavailable")}</strong> : null}
      </div>
      <footer>
        <Icon name="globe" />
        <span>{typeof location?.displayName === "string" ? location.displayName : typeof location?.label === "string" ? location.label : t(ar, "لا يتوفر وصف للموقع", "No location description is available")}</span>
        <b>{t(ar, `${competitors.length} منافسًا مرصودًا`, `${competitors.length} competitors observed`)}</b>
      </footer>
    </div>
  );
}

function DetailScreen({
  ar,
  locale,
  project,
  route,
  snapshot,
  study,
}: {
  ar: boolean;
  locale: Locale;
  project: AnalysisProject;
  route: string;
  snapshot?: IntelligenceSnapshot;
  study: AnalysisStudy;
}) {
  const result = study.result;
  const location = asRecord(snapshot?.location);
  const population = readMetric(snapshot?.population);
  const purchasingPower = readMetric(snapshot?.purchasingPower);
  const inflation = readMetric(snapshot?.costInflation);
  const competitors = readCompetitors(snapshot?.competitors);
  const sources = readSources(snapshot?.sources);
  const limitations = readLimitations(snapshot?.limitations);
  const focus = route.endsWith("/map") ? "map" : "details";
  return (
    <section className="pa-page pa-details-page" data-testid="analysis-details">
      <header className="pa-page-heading">
        <div>
          <span><Icon name="barChart" />{t(ar, "تفاصيل السوق والمنافسين", "Market and competitor details")}</span>
          <h1>{project.name}</h1>
          <p>{t(ar, "مؤشرات المصدر الأحدث مع تاريخ الجمع والقيود؛ لا تُستنتج منها سلسلة نمو غير متاحة.", "Latest sourced indicators with collection date and limitations; no unavailable growth series is inferred.")}</p>
        </div>
        <Link className="pa-primary-button" href={`/projects/analysis/result?project=${project.id}`}><Icon name="arrow" />{t(ar, "النتيجة التنفيذية", "Executive result")}</Link>
      </header>
      <nav className="pa-detail-tabs">
        <Link className={focus === "details" ? "is-active" : ""} href={`/projects/analysis/details?project=${project.id}`}>{t(ar, "مؤشرات السوق", "Market indicators")}</Link>
        <Link className={focus === "map" ? "is-active" : ""} href={`/projects/analysis/map?project=${project.id}`}>{t(ar, "خريطة المنافسين", "Competitor map")}</Link>
        <Link href={`/projects/analysis/recommendations?project=${project.id}`}>{t(ar, "التوصيات", "Recommendations")}</Link>
      </nav>
      <div className="pa-detail-layout">
        <div className="pa-detail-main">
          <div className="pa-source-metrics">
            <article><Icon name="people" /><span>{t(ar, "السكان", "Population")}</span><strong>{formatNumber(population.value, locale, 0)}</strong><small>{population.period ?? t(ar, "الفترة غير متاحة", "Period unavailable")}</small></article>
            <article><Icon name="wallet" /><span>{t(ar, "القوة الشرائية", "Purchasing power")}</span><strong>{formatNumber(purchasingPower.value, locale, 0)}</strong><small>{purchasingPower.unit ?? t(ar, "الوحدة غير متاحة", "Unit unavailable")}</small></article>
            <article><Icon name="trend" /><span>{t(ar, "تضخم التكلفة", "Cost inflation")}</span><strong>{inflation.value === null ? t(ar, "غير متاح", "Unavailable") : `${formatNumber(inflation.value, locale)}%`}</strong><small>{inflation.period ?? t(ar, "الفترة غير متاحة", "Period unavailable")}</small></article>
            <article><Icon name="building" /><span>{t(ar, "المنافسون", "Competitors")}</span><strong>{result?.competitorCount ?? t(ar, "غير متاح", "Unavailable")}</strong><small>{levelLabel(result?.competitionLevel, ar)}</small></article>
          </div>
          <EvidenceMap ar={ar} competitors={competitors} location={location} />
          <div className="pa-competitor-table">
            <header><h2>{t(ar, "المنافسون المرصودون", "Observed competitors")}</h2><span>{t(ar, "المصدر: OpenStreetMap عند توفره", "Source: OpenStreetMap when available")}</span></header>
            <div className="pa-table-scroll">
              <table>
                <thead><tr><th>#</th><th>{t(ar, "الاسم", "Name")}</th><th>{t(ar, "النوع", "Kind")}</th><th>{t(ar, "المسافة", "Distance")}</th></tr></thead>
                <tbody>
                  {competitors.length ? competitors.map((competitor, index) => <tr key={competitor.id ?? `${competitor.name}-${index}`}><td>{index + 1}</td><td>{competitor.name ?? t(ar, "دون اسم", "Unnamed")}</td><td>{competitor.kind ?? t(ar, "غير مصنف", "Unclassified")}</td><td>{competitor.distanceKm === null || competitor.distanceKm === undefined ? t(ar, "غير متاحة", "Unavailable") : `${formatNumber(competitor.distanceKm, locale)} km`}</td></tr>) : <tr><td colSpan={4}>{t(ar, "لا توجد بيانات منافسين متاحة من المصدر الحالي.", "No competitor data is available from the current source.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <aside className="pa-detail-aside">
          <article>
            <span>{t(ar, "اكتمال الأدلة", "Evidence completeness")}</span>
            <strong>{result?.evidenceCompleteness ?? 0}%</strong>
            <div><i style={{ width: `${result?.evidenceCompleteness ?? 0}%` }} /></div>
          </article>
          <article>
            <h2>{t(ar, "المصادر", "Sources")}</h2>
            {sources.length ? sources.map((source, index) => <div className="pa-source-row" key={`${source.source}-${index}`}><Icon name="check" /><span><b>{source.source ?? t(ar, "مصدر", "Source")}</b><small>{source.confidence ? levelLabel(source.confidence, ar) : t(ar, "ثقة غير محددة", "Confidence unspecified")}</small></span>{source.url ? <a href={source.url} rel="noreferrer" target="_blank"><Icon name="arrow" /></a> : null}</div>) : <p>{t(ar, "لا توجد مصادر محفوظة.", "No sources are saved.")}</p>}
          </article>
          <article className="is-warning">
            <h2>{t(ar, "قيود البيانات", "Data limitations")}</h2>
            {limitations.length ? <ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul> : <p>{t(ar, "لم تسجل الخدمة قيودًا إضافية.", "The service recorded no additional limitations.")}</p>}
          </article>
        </aside>
      </div>
    </section>
  );
}

function ResultScreen({
  ar,
  project,
  study,
}: {
  ar: boolean;
  project: AnalysisProject;
  study: AnalysisStudy;
}) {
  const result = study.result;
  if (!result) {
    return <NoResult ar={ar} projectId={project.id} />;
  }
  const recommendationItems = result.recommendations
    .map((code) => resultRecommendations[code])
    .filter((item): item is readonly [string, string] => Boolean(item));
  return (
    <section className="pa-page pa-result-page" data-testid="analysis-result">
      <header className="pa-result-hero">
        <div className="pa-score-ring" style={{ "--pa-score": `${result.evidenceCompleteness * 3.6}deg` } as CSSProperties}>
          <span><b>{result.evidenceCompleteness}%</b><small>{t(ar, "اكتمال الأدلة", "Evidence complete")}</small></span>
        </div>
        <div>
          <span><Icon name="check" />{t(ar, "اكتمل التحليل", "Analysis complete")}</span>
          <h1>{project.name}</h1>
          <p>{t(ar, "تعرض النتيجة جودة الأدلة المتاحة وليست وعدًا بنسبة نجاح أو عائد استثماري.", "This result measures available evidence quality; it is not a promise of success or return.")}</p>
        </div>
        <Link className="pa-primary-button" href={`/projects/analysis/report?project=${project.id}`}><Icon name="eye" />{t(ar, "عرض التقرير الكامل", "View full report")}</Link>
      </header>
      <div className="pa-result-metrics">
        <article className={`tone-${result.competitionLevel.toLowerCase()}`}><Icon name="people" /><span>{t(ar, "مستوى المنافسة", "Competition level")}</span><strong>{levelLabel(result.competitionLevel, ar)}</strong><small>{result.competitorCount === null ? t(ar, "تغطية المنافسين غير متاحة", "Competitor coverage unavailable") : t(ar, `${result.competitorCount} نتيجة مرصودة`, `${result.competitorCount} observed results`)}</small></article>
        <article className={`tone-${result.purchasingPowerLevel.toLowerCase()}`}><Icon name="wallet" /><span>{t(ar, "القوة الشرائية", "Purchasing power")}</span><strong>{levelLabel(result.purchasingPowerLevel, ar)}</strong><small>{t(ar, "وفق مؤشر البنك الدولي المتاح", "Based on available World Bank indicator")}</small></article>
        <article className={`tone-${result.dataRiskLevel.toLowerCase()}`}><Icon name="shield" /><span>{t(ar, "مخاطر البيانات", "Data risk")}</span><strong>{levelLabel(result.dataRiskLevel, ar, false)}</strong><small>{t(ar, `${result.limitationCount} قيدًا مسجلًا`, `${result.limitationCount} recorded limitations`)}</small></article>
        <article><Icon name="globe" /><span>{t(ar, "المصادر", "Sources")}</span><strong>{result.sourceCount}</strong><small>{t(ar, "سجلات مصدر محفوظة", "Saved source records")}</small></article>
      </div>
      <div className="pa-result-grid">
        <article className="pa-executive-summary">
          <header><Icon name="brain" /><div><h2>{t(ar, "القراءة التنفيذية", "Executive interpretation")}</h2><p>{t(ar, "قراءة حتمية مبنية على اكتمال المصادر والقيود", "Deterministic reading based on source coverage and limitations")}</p></div></header>
          <p>{result.evidenceCompleteness >= 70 ? t(ar, "تغطية الأدلة جيدة بما يكفي للانتقال إلى دراسة جدوى تفصيلية، مع ضرورة مراجعة حدود البيانات قبل القرار.", "Evidence coverage is sufficient to proceed to detailed feasibility, while reviewing data limits before a decision.") : t(ar, "تغطية الأدلة الحالية غير كافية لاتخاذ قرار استثماري نهائي. أغلق فجوات المصادر أولًا ثم أعد التحليل.", "Current evidence coverage is insufficient for a final investment decision. Close source gaps and rerun the analysis first.")}</p>
          <div><span><b>{t(ar, "المنهج", "Method")}</b>{t(ar, "6 إشارات تحقق موزونة", "6 weighted evidence checks")}</span><span><b>{t(ar, "الحالة", "Status")}</b>{t(ar, "يتطلب مراجعة بشرية", "Human review required")}</span></div>
        </article>
        <article className="pa-recommendations">
          <header><Icon name="rocket" /><h2>{t(ar, "التوصيات العملية", "Actionable recommendations")}</h2></header>
          <ol>{recommendationItems.map((item, index) => <li key={item[0]}><span>{index + 1}</span><p>{t(ar, ...item)}</p></li>)}</ol>
        </article>
      </div>
    </section>
  );
}

function ReportScreen({
  ar,
  locale,
  project,
  snapshot,
  study,
}: {
  ar: boolean;
  locale: Locale;
  project: AnalysisProject;
  snapshot?: IntelligenceSnapshot;
  study: AnalysisStudy;
}) {
  const [section, setSection] = useState("summary");
  const result = study.result;
  if (!result) return <NoResult ar={ar} projectId={project.id} />;
  const population = readMetric(snapshot?.population);
  const purchasingPower = readMetric(snapshot?.purchasingPower);
  const inflation = readMetric(snapshot?.costInflation);
  const competitors = readCompetitors(snapshot?.competitors);
  const sources = readSources(snapshot?.sources);
  const limitations = readLimitations(snapshot?.limitations);
  const sections = [
    { id: "summary", icon: "dashboard" as const, label: t(ar, "الملخص التنفيذي", "Executive summary") },
    { id: "market", icon: "trend" as const, label: t(ar, "مؤشرات السوق", "Market indicators") },
    { id: "competition", icon: "people" as const, label: t(ar, "المنافسون", "Competitors") },
    { id: "sources", icon: "globe" as const, label: t(ar, "المصادر والقيود", "Sources and limitations") },
    { id: "recommendations", icon: "rocket" as const, label: t(ar, "التوصيات", "Recommendations") },
  ];
  let content: ReactNode;
  if (section === "market") {
    content = <><h2>{t(ar, "مؤشرات السوق المتاحة", "Available market indicators")}</h2><div className="pa-report-stat-grid"><span><small>{t(ar, "السكان", "Population")}</small><b>{formatNumber(population.value, locale, 0)}</b><i>{population.period ?? "—"}</i></span><span><small>{t(ar, "القوة الشرائية", "Purchasing power")}</small><b>{formatNumber(purchasingPower.value, locale, 0)}</b><i>{purchasingPower.unit ?? "—"}</i></span><span><small>{t(ar, "تضخم التكلفة", "Cost inflation")}</small><b>{inflation.value === null ? "—" : `${formatNumber(inflation.value, locale)}%`}</b><i>{inflation.period ?? "—"}</i></span></div><p>{t(ar, "لا تتوفر سلسلة زمنية محلية موحدة لحجم السوق والنمو ضمن المصادر الحالية، لذلك لم تُعرض قيم تقديرية لهما.", "The current sources do not provide one consistent local time series for market size and growth, so no estimates are shown.")}</p></>;
  } else if (section === "competition") {
    content = <><h2>{t(ar, "رصد المنافسين", "Competitor discovery")}</h2><p>{result.competitorCount === null ? t(ar, "تعذرت تغطية المنافسين من المصدر الحالي.", "Competitor coverage is unavailable from the current source.") : t(ar, `رصد المصدر ${result.competitorCount} نتيجة قريبة. المستوى المشتق: ${levelLabel(result.competitionLevel, ar)}.`, `The source returned ${result.competitorCount} nearby results. Derived level: ${levelLabel(result.competitionLevel, ar)}.`)}</p><div className="pa-report-list">{competitors.slice(0, 12).map((competitor, index) => <span key={competitor.id ?? index}><b>{index + 1}</b><i>{competitor.name ?? t(ar, "دون اسم", "Unnamed")}</i><small>{competitor.kind ?? "—"}</small></span>)}</div></>;
  } else if (section === "sources") {
    content = <><h2>{t(ar, "المصادر والقيود", "Sources and limitations")}</h2><div className="pa-report-sources">{sources.map((source, index) => <span key={`${source.source}-${index}`}><Icon name="check" /><b>{source.source ?? t(ar, "مصدر", "Source")}</b><small>{source.confidence ? levelLabel(source.confidence, ar) : "—"}</small></span>)}</div><h3>{t(ar, "القيود المسجلة", "Recorded limitations")}</h3>{limitations.length ? <ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul> : <p>{t(ar, "لا توجد قيود إضافية مسجلة.", "No additional limitations are recorded.")}</p>}</>;
  } else if (section === "recommendations") {
    content = <><h2>{t(ar, "التوصيات العملية", "Actionable recommendations")}</h2><ol>{result.recommendations.map((code) => resultRecommendations[code] ? <li key={code}>{t(ar, ...resultRecommendations[code])}</li> : null)}</ol></>;
  } else {
    content = <><span className="pa-report-kicker">{t(ar, "تقرير تحليل مشروع", "Project analysis report")}</span><h1>{project.name}</h1><p>{study.input?.idea}</p><div className="pa-report-score"><strong>{result.evidenceCompleteness}%</strong><span><b>{t(ar, "اكتمال الأدلة", "Evidence completeness")}</b><small>{t(ar, "ليس مقياسًا لفرصة النجاح", "Not a success-probability metric")}</small></span></div><div className="pa-report-summary-cards"><span><small>{t(ar, "المنافسة", "Competition")}</small><b>{levelLabel(result.competitionLevel, ar)}</b></span><span><small>{t(ar, "القوة الشرائية", "Purchasing power")}</small><b>{levelLabel(result.purchasingPowerLevel, ar)}</b></span><span><small>{t(ar, "مخاطر البيانات", "Data risk")}</small><b>{levelLabel(result.dataRiskLevel, ar, false)}</b></span></div></>;
  }
  return (
    <section className="pa-page pa-report-page" data-testid="analysis-report">
      <header className="pa-page-heading">
        <div><span><Icon name="eye" />{t(ar, "عارض التقرير", "Report viewer")}</span><h1>{t(ar, "التقرير التفصيلي", "Detailed report")}</h1><p>{t(ar, `آخر تحديث: ${formatDate(study.updatedAt, locale)}`, `Last updated: ${formatDate(study.updatedAt, locale)}`)}</p></div>
        <div className="pa-heading-actions"><Link className="pa-secondary-button" href={`/projects/analysis/print?project=${project.id}`}><Icon name="briefcase" />{t(ar, "خيارات التصدير", "Export options")}</Link><a className="pa-primary-button" href={`/api/projects/${project.id}/report`}><Icon name="arrow" />PDF</a></div>
      </header>
      <div className="pa-report-viewer">
        <aside>{sections.map((item, index) => <button className={item.id === section ? "is-active" : ""} key={item.id} onClick={() => setSection(item.id)} type="button"><span>{index + 1}</span><Icon name={item.icon} />{item.label}</button>)}</aside>
        <article className="pa-report-sheet">{content}<footer><span>Jenan <b>PRO</b></span><small>{t(ar, "تقرير مولد من بيانات المشروع ومصادره المحفوظة", "Report generated from saved project data and sources")}</small></footer></article>
      </div>
    </section>
  );
}

function ExportScreen({
  ar,
  onShare,
  project,
  shareMessage,
  study,
}: {
  ar: boolean;
  onShare: () => void;
  project: AnalysisProject;
  shareMessage: string;
  study: AnalysisStudy;
}) {
  return (
    <section className="pa-page pa-export-page" data-testid="analysis-export">
      <header className="pa-page-heading is-centered"><div><span><Icon name="briefcase" />{t(ar, "المرحلة الخامسة", "Stage five")}</span><h1>{t(ar, "طباعة وتصدير التقرير", "Print and export report")}</h1><p>{t(ar, "تظهر هنا الصيغ المدعومة فعليًا فقط. لا تتوفر DOCX أو PPTX أو XLSX في هذا الإصدار.", "Only implemented formats are shown. DOCX, PPTX, and XLSX are not available in this version.")}</p></div></header>
      <div className="pa-export-layout">
        <article className="pa-export-preview">
          <header><span>Jenan <b>PRO</b></span><small>{t(ar, "تقرير تحليل مشروع", "Project analysis report")}</small></header>
          <div><Icon name="barChart" /><h2>{project.name}</h2><p>{study.input?.idea}</p><strong>{study.result?.evidenceCompleteness ?? 0}%</strong><small>{t(ar, "اكتمال الأدلة", "Evidence completeness")}</small></div>
          <footer>{t(ar, "المصادر والقيود مضمّنة في النسخة الكاملة", "Sources and limitations are included in the full version")}</footer>
        </article>
        <div className="pa-export-options">
          <article><Icon name="arrow" /><div><h2>PDF</h2><p>{t(ar, "تنزيل التقرير الكامل بصيغة PDF", "Download the complete report as PDF")}</p></div><a className="pa-primary-button" href={`/api/projects/${project.id}/report`}>{t(ar, "تنزيل PDF", "Download PDF")}</a></article>
          <article><Icon name="briefcase" /><div><h2>{t(ar, "الطباعة", "Print")}</h2><p>{t(ar, "طباعة العارض الحالي أو حفظه من حوار المتصفح", "Print the current view or save it from the browser dialog")}</p></div><button className="pa-secondary-button" onClick={() => window.print()} type="button">{t(ar, "طباعة الآن", "Print now")}</button></article>
          <article><Icon name="arrow" /><div><h2>{t(ar, "نسخ رابط التقرير", "Copy report link")}</h2><p>{t(ar, "نسخ رابط صفحة التقرير الحالية للمشاركة", "Copy the current report page URL for sharing")}</p></div><button className="pa-secondary-button" onClick={onShare} type="button">{t(ar, "نسخ الرابط", "Copy link")}</button></article>
          {shareMessage ? <p className="pa-export-message" role="status">{shareMessage}</p> : null}
          <small className="pa-export-note"><Icon name="shield" />{t(ar, "يبقى الوصول للرابط خاضعًا لتسجيل الدخول وصلاحيات المشروع.", "Link access remains subject to authentication and project permissions.")}</small>
        </div>
      </div>
    </section>
  );
}

function NoResult({ ar, projectId }: { ar: boolean; projectId: string }) {
  return (
    <div className="pa-empty-state">
      <Icon name="activity" />
      <h2>{t(ar, "لم يكتمل التحليل بعد", "Analysis is not complete yet")}</h2>
      <p>{t(ar, "أكمل مرحلة المعالجة قبل فتح النتائج والتقرير.", "Complete the processing stage before opening results and reports.")}</p>
      <Link className="pa-primary-button" href={`/projects/analysis/progress?project=${projectId}`}>{t(ar, "العودة إلى المعالجة", "Return to processing")}</Link>
    </div>
  );
}

export function ProjectAnalysisWorkspace({
  flow,
  locale,
  userLabel,
}: {
  flow: ProjectFlowDefinition;
  locale: Locale;
  userLabel: string;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get("project") ?? "";
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const runGuard = useRef("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProjects();
      setProjects(result);
      setSelectedId((current) => {
        if (current && result.some((project) => project.id === current)) return current;
        if (requestedProjectId && result.some((project) => project.id === requestedProjectId)) {
          return requestedProjectId;
        }
        return result[0]?.id ?? "";
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(ar, "تعذر تحميل المشاريع.", "Projects could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [ar, requestedProjectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  const selected = useMemo(
    () => projects.find((project) => project.id === selectedId),
    [projects, selectedId],
  );
  const study = useMemo(
    () => readStudy(selected?.analysisStudy),
    [selected?.analysisStudy],
  );
  const snapshot = selected?.intelligenceSnapshots[0];
  const route = flow.route;
  const activeStage =
    route.endsWith("/new")
      ? "input"
      : route.endsWith("/progress")
        ? "progress"
        : route.endsWith("/report")
          ? "report"
          : route.endsWith("/print")
            ? "print"
            : "results";

  const runAnalysis = useCallback(async () => {
    if (!selected) return;
    setRunning(true);
    setMessage("");
    try {
      await projectRequest({
        action: "runProjectAnalysis",
        projectId: selected.id,
      });
      await loadProjects();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(ar, "تعذر تشغيل التحليل.", "The analysis could not be run."));
      await loadProjects();
    } finally {
      setRunning(false);
    }
  }, [ar, loadProjects, selected]);

  useEffect(() => {
    if (
      !selected ||
      !route.endsWith("/progress") ||
      study.status !== "PENDING" ||
      !study.input
    ) {
      return;
    }
    const key = `${selected.id}:${study.updatedAt ?? "pending"}`;
    if (runGuard.current === key) return;
    runGuard.current = key;
    const timer = window.setTimeout(() => {
      void runAnalysis();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [route, runAnalysis, selected, study.input, study.status, study.updatedAt]);

  function changeProject(projectId: string) {
    setSelectedId(projectId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    router.push(`${route}?${params.toString()}`);
  }

  async function shareReport() {
    try {
      const url = `${window.location.origin}/projects/analysis/report?project=${selectedId}`;
      await navigator.clipboard.writeText(url);
      setShareMessage(t(ar, "تم نسخ رابط التقرير.", "Report link copied."));
    } catch {
      setShareMessage(t(ar, "تعذر نسخ الرابط. انسخه من شريط العنوان.", "The link could not be copied. Copy it from the address bar."));
    }
  }

  let screen: ReactNode = null;
  if (selected) {
    if (activeStage === "input") {
      screen = <InputSummary ar={ar} project={selected} study={study} />;
    } else if (activeStage === "progress") {
      screen = <ProgressScreen ar={ar} busy={running} onRetry={() => void runAnalysis()} projectId={selected.id} study={study} />;
    } else if (activeStage === "report") {
      screen = <ReportScreen ar={ar} locale={locale} project={selected} snapshot={snapshot} study={study} />;
    } else if (activeStage === "print") {
      screen = <ExportScreen ar={ar} onShare={() => void shareReport()} project={selected} shareMessage={shareMessage} study={study} />;
    } else if (route.endsWith("/details") || route.endsWith("/map")) {
      screen = <DetailScreen ar={ar} locale={locale} project={selected} route={route} snapshot={snapshot} study={study} />;
    } else {
      screen = <ResultScreen ar={ar} project={selected} study={study} />;
    }
  }

  return (
    <main className="project-analysis-workspace" data-analysis-route={route} dir={ar ? "rtl" : "ltr"}>
      <ProjectsCommandHeader active="analysis" locale={locale} userLabel={userLabel} />
      {loading ? <div className="pa-loading"><Icon name="activity" />{t(ar, "جارٍ تحميل مساحة التحليل...", "Loading analysis workspace...")}</div> : projects.length === 0 ? <div className="pa-empty-state is-page"><Icon name="sparkles" /><h1>{t(ar, "ابدأ بأول تحليل مشروع", "Start your first project analysis")}</h1><p>{t(ar, "أدخل فكرة المشروع لإنشاء سجل تحليل حقيقي.", "Enter a project idea to create a real analysis record.")}</p><Link className="pa-primary-button" href="/projects/analysis">{t(ar, "البدء الآن", "Start now")}</Link></div> : selected ? <><ProjectToolbar ar={ar} onProjectChange={changeProject} projects={projects} selectedId={selectedId} /><StageNavigation active={activeStage} ar={ar} projectId={selected.id} />{message ? <p className="pa-global-message" role="alert">{message}</p> : null}{screen}</> : null}
    </main>
  );
}
