"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AnalysisModal,
  AnalysisScene,
  AnalysisStatus,
  AnalysisSteps,
} from "@/components/projects/project-analysis-dialogs";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import {
  asRecord,
  audienceLabels,
  budgetLabels,
  cityLabels,
  evidenceChecks,
  formatDate,
  formatNumber,
  levelLabel,
  readCompetitors,
  readLimitations,
  readMetric,
  readSources,
  readStudy,
  resultRecommendations,
  t,
  type AnalysisProject,
  type AnalysisStudy,
  type IntelligenceSnapshot,
} from "@/lib/projects/analysis-study";
import { textProblem, textProblemMessage } from "@/lib/projects/text-quality";
import type { ProjectFlowDefinition } from "@/lib/projects/project-flow-routes";
import type { Locale } from "@/types/i18n";

export { readMetric, readStudy };

const ProjectLocationPicker = dynamic(
  () => import("@/components/projects/project-location-picker").then((module) => module.ProjectLocationPicker),
  { ssr: false, loading: () => <div className="pa-entry-map is-loading" /> },
);

/** Shown once above the results: what the figures are, and a warning when the saved idea is not understandable. */
export function AnalysisNotices({ ar, study }: { ar: boolean; study: AnalysisStudy }) {
  const problem = study.input ? textProblem(study.input.idea) : null;
  return (
    <>
      {problem ? (
        <p className="pa-scope-notice is-danger" data-testid="analysis-unreadable-idea" role="alert">
          <Icon name="shield" />
          <span>
            {t(
              ar,
              `فكرة هذا المشروع غير مفهومة: ${textProblemMessage(problem, "ar")} الأرقام أدناه تخص الموقع فقط ولا تمثل مشروعًا حقيقيًا، فلا تعتمد عليها. ابدأ تحليلًا جديدًا بوصف حقيقي لفكرتك.`,
              `This project's idea is not understandable: ${textProblemMessage(problem, "en")} The figures below describe the location only and do not represent a real project, so do not rely on them. Start a new analysis with a real description.`,
            )}{" "}
            <Link href="/projects/analysis">{t(ar, "تحليل جديد", "New analysis")}</Link>
          </span>
        </p>
      ) : null}
      {study.result ? <ScopeNotice ar={ar} /> : null}
    </>
  );
}

function ScopeNotice({ ar }: { ar: boolean }) {
  return (
    <p className="pa-scope-notice" data-testid="analysis-scope-notice" role="note">
      <Icon name="shield" />
      <span>
        {t(
          ar,
          "تنبيه: هذه المؤشرات تصف الموقع والدولة (السكان، القوة الشرائية، التضخم، والمنشآت المرصودة على الخريطة) ولا تُقيّم فكرتك نفسها. التحليل الخاص بالفكرة يتطلب مزوّد ذكاء اصطناعي غير مفعّل حاليًا في المنصة، لذلك لا يُعرض حكم على جدواها.",
          "Note: these indicators describe the location and country (population, purchasing power, inflation, and venues mapped nearby). They do not evaluate your idea itself. Idea-specific analysis needs an AI provider that is not enabled on the platform yet, so no verdict on feasibility is shown.",
        )}
      </span>
    </p>
  );
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
  const response = await fetch("/api/projects?limit=100&offset=0", { cache: "no-store" });
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

type ReportView = "overview" | "details" | "map" | "recommendations";
const TABS: ReadonlyArray<{ icon: IconName; label: readonly [string, string]; path: string; view: ReportView | "report" }> = [
  { icon: "dashboard", label: ["النتيجة", "Result"], path: "/projects/analysis/result", view: "overview" },
  { icon: "trend", label: ["مؤشرات السوق", "Market"], path: "/projects/analysis/details", view: "details" },
  { icon: "mapPin", label: ["الخريطة", "Map"], path: "/projects/analysis/map", view: "map" },
  { icon: "rocket", label: ["التوصيات", "Recommendations"], path: "/projects/analysis/recommendations", view: "recommendations" },
  { icon: "fileText", label: ["التقرير", "Report"], path: "/projects/analysis/report", view: "report" },
];

function Metric({ icon, label, note, tone, value }: { icon: IconName; label: string; note: string; tone?: string; value: string }) {
  return (
    <article className={`pa-kpi${tone ? ` tone-${tone.toLowerCase()}` : ""}`}>
      <span className="pa-kpi__icon"><Icon name={icon} /></span>
      <div><small>{label}</small><strong>{value}</strong><em>{note}</em></div>
    </article>
  );
}

function Panel({ children, className, icon, title }: { children: ReactNode; className?: string; icon: IconName; title: string }) {
  return (
    <section className={`pa-panel${className ? ` ${className}` : ""}`}>
      <header><Icon name={icon} /><h2>{title}</h2></header>
      <div className="pa-panel__body">{children}</div>
    </section>
  );
}

function LocationMap({
  ar,
  competitors,
  latitude,
  longitude,
}: {
  ar: boolean;
  competitors: Array<{ name?: string; kind?: string; latitude?: number; longitude?: number }>;
  latitude?: number;
  longitude?: number;
}) {
  if (latitude === undefined || longitude === undefined) {
    return <div className="pa-map-empty"><Icon name="globe" /><span>{t(ar, "تعذر تحديد الموقع على الخريطة", "The location could not be placed on the map")}</span></div>;
  }
  const here = { latitude, longitude };
  return (
    <ProjectLocationPicker
      center={here}
      competitors={competitors
        .filter((item) => typeof item.latitude === "number" && typeof item.longitude === "number")
        .map((item) => ({ name: item.name ?? t(ar, "دون اسم", "Unnamed"), category: item.kind ?? "—", latitude: item.latitude as number, longitude: item.longitude as number }))}
      label={t(ar, "خريطة الموقع والمنافسين", "Location and competitors map")}
      point={here}
      zoom={13}
    />
  );
}

function ExportDialog({
  ar,
  message,
  onShare,
  projectId,
}: {
  ar: boolean;
  message: string;
  onShare: () => void;
  projectId: string;
}) {
  return (
    <div className="pa-modal__body" data-testid="analysis-export">
      <header>
        <span className="pa-modal__badge"><Icon name="fileText" /></span>
        <div>
          <h2 id="pa-modal-title">{t(ar, "طباعة وتصدير التقرير", "Print and export report")}</h2>
          <p>{t(ar, "تظهر الصيغ المدعومة فعليًا فقط: PDF والطباعة ورابط المشاركة.", "Only implemented formats are shown: PDF, print, and a share link.")}</p>
        </div>
      </header>
      <ul className="pa-export">
        <li>
          <Icon name="fileText" /><div><b>PDF</b><small>{t(ar, "تنزيل التقرير الكامل بمصادره وقيوده", "Download the complete report with sources and limits")}</small></div>
          <a className="pa-btn is-primary" href={`/api/projects/${projectId}/report`}>{t(ar, "تنزيل PDF", "Download PDF")}</a>
        </li>
        <li>
          <Icon name="briefcase" /><div><b>{t(ar, "الطباعة", "Print")}</b><small>{t(ar, "طباعة اللوحة الحالية أو حفظها من حوار المتصفح", "Print this dashboard or save it from the browser dialog")}</small></div>
          <button className="pa-btn is-outline" onClick={() => window.print()} type="button">{t(ar, "طباعة الآن", "Print now")}</button>
        </li>
        <li>
          <Icon name="link" /><div><b>{t(ar, "رابط التقرير", "Report link")}</b><small>{t(ar, "الوصول للرابط يخضع لتسجيل الدخول وصلاحيات المشروع", "Access stays subject to sign-in and project permissions")}</small></div>
          <button className="pa-btn is-outline" onClick={onShare} type="button">{t(ar, "نسخ الرابط", "Copy link")}</button>
        </li>
      </ul>
      {message ? <p className="pa-export__message" role="status">{message}</p> : null}
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
  const route = flow.route;
  const requestedProjectId = searchParams.get("project") ?? "";
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(route.endsWith("/print"));
  const [statusClosed, setStatusClosed] = useState(false);
  const runGuard = useRef("");

  const loadProjects = useCallback(async () => {
    try {
      const result = await listProjects();
      setProjects(result);
      setSelectedId((current) => {
        if (current && result.some((project) => project.id === current)) return current;
        if (requestedProjectId && result.some((project) => project.id === requestedProjectId)) return requestedProjectId;
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
    const timer = window.setTimeout(() => void loadProjects(), 0);
    return () => window.clearTimeout(timer);
  }, [loadProjects]);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId), [projects, selectedId]);
  const study = useMemo(() => readStudy(selected?.analysisStudy), [selected?.analysisStudy]);
  const snapshot: IntelligenceSnapshot | undefined = selected?.intelligenceSnapshots[0];
  const isProgress = route.endsWith("/progress");

  const runAnalysis = useCallback(async () => {
    if (!selected) return;
    setRunning(true);
    setMessage("");
    try {
      await projectRequest({ action: "runProjectAnalysis", projectId: selected.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(ar, "تعذر تشغيل التحليل.", "The analysis could not be run."));
    } finally {
      await loadProjects();
      setRunning(false);
    }
  }, [ar, loadProjects, selected]);

  useEffect(() => {
    if (!selected || !isProgress || study.status !== "PENDING" || !study.input) return;
    const key = `${selected.id}:${study.updatedAt ?? "pending"}`;
    if (runGuard.current === key) return;
    runGuard.current = key;
    const timer = window.setTimeout(() => void runAnalysis(), 300);
    return () => window.clearTimeout(timer);
  }, [isProgress, runAnalysis, selected, study.input, study.status, study.updatedAt]);

  // A run started elsewhere (or before a reload) finishes on the server; check back until it is saved.
  useEffect(() => {
    if (!isProgress || study.status !== "PROCESSING" || running) return;
    const timer = window.setInterval(() => void loadProjects(), 3000);
    return () => window.clearInterval(timer);
  }, [isProgress, loadProjects, running, study.status]);

  function changeProject(projectId: string) {
    setSelectedId(projectId);
    setStatusClosed(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    router.push(`${route}?${params.toString()}`);
  }

  async function shareReport() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/analysis/report?project=${selectedId}`);
      setShareMessage(t(ar, "تم نسخ رابط التقرير.", "Report link copied."));
    } catch {
      setShareMessage(t(ar, "تعذر نسخ الرابط. انسخه من شريط العنوان.", "The link could not be copied. Copy it from the address bar."));
    }
  }

  let body: ReactNode = null;
  if (loading) {
    body = <div className="pa-center"><Icon name="activity" />{t(ar, "جارٍ تحميل مساحة التحليل...", "Loading analysis workspace...")}</div>;
  } else if (projects.length === 0) {
    body = (
      <div className="pa-center is-card">
        <Icon name="sparkles" />
        <h1>{t(ar, "ابدأ بأول تحليل مشروع", "Start your first project analysis")}</h1>
        <p>{message || t(ar, "أدخل فكرة المشروع وحدد موقعه لإنشاء سجل تحليل حقيقي.", "Enter a project idea and pick its location to create a real analysis record.")}</p>
        <Link className="pa-btn is-primary" href="/projects/analysis"><Icon name="barChart" />{t(ar, "ابدأ التحليل", "Start analysis")}</Link>
      </div>
    );
  } else if (selected && isProgress) {
    const state = study.status === "COMPLETED" ? "done" : study.status === "FAILED" || (message && !running && study.status !== "PROCESSING") ? "failed" : "running";
    body = (
      <>
        <section className="pa-entry__stage" data-testid="analysis-progress">
          <AnalysisScene ar={ar} />
          <div className="pa-entry__copy">
            <nav aria-label={t(ar, "مسار الصفحة", "Breadcrumb")} className="pa-entry__crumbs">
              <Link href="/projects">{t(ar, "المشاريع والاستثمار", "Projects and investment")}</Link>
              <Icon name="chevron" />
              <span>{t(ar, "تحليل المشاريع", "Project analysis")}</span>
            </nav>
            <h1>{ar ? <>تحليل مشروع <b>ذكي</b></> : <>Smart project <b>analysis</b></>}</h1>
            <p>{study.input?.idea ?? selected.name}</p>
            <div className="pa-entry__actions">
              {state === "done" ? (
                <Link className="pa-entry__start" href={`/projects/analysis/result?project=${selected.id}`}><Icon name="fileText" />{t(ar, "عرض التقرير", "View report")}</Link>
              ) : null}
              <Link className="pa-entry__ghost" href="/projects/analysis"><Icon name="plus" />{t(ar, "تحليل جديد", "New analysis")}</Link>
            </div>
          </div>
        </section>
        {statusClosed ? null : (
          <AnalysisModal ar={ar} closable={state !== "running"} onClose={() => setStatusClosed(true)} size="status" step={state === "failed" ? "failed" : state}>
            <>
              {state === "done" || state === "failed" ? null : <AnalysisSteps ar={ar} step="running" />}
              <AnalysisStatus
                ar={ar}
                message={study.error ?? message}
                onClose={() => setStatusClosed(true)}
                onOpenReport={() => router.push(`/projects/analysis/result?project=${selected.id}`)}
                onRetry={() => void runAnalysis()}
                state={state}
              />
            </>
          </AnalysisModal>
        )}
      </>
    );
  } else if (selected) {
    body = (
      <ReportDashboard
        ar={ar}
        locale={locale}
        message={message}
        onChangeProject={changeProject}
        onExport={() => setExportOpen(true)}
        project={selected}
        projects={projects}
        route={route}
        snapshot={snapshot}
        study={study}
      />
    );
  }

  return (
    <main className={`project-analysis-workspace pa-entry${isProgress ? "" : " is-report"}`} data-analysis-route={route} dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />
      {body}
      {exportOpen && selected && !isProgress ? (
        <AnalysisModal ar={ar} onClose={() => setExportOpen(false)} step="export">
          <ExportDialog ar={ar} message={shareMessage} onShare={() => void shareReport()} projectId={selected.id} />
        </AnalysisModal>
      ) : null}
    </main>
  );
}

function ReportDashboard({
  ar,
  locale,
  message,
  onChangeProject,
  onExport,
  project,
  projects,
  route,
  snapshot,
  study,
}: {
  ar: boolean;
  locale: Locale;
  message: string;
  onChangeProject: (projectId: string) => void;
  onExport: () => void;
  project: AnalysisProject;
  projects: AnalysisProject[];
  route: string;
  snapshot?: IntelligenceSnapshot;
  study: AnalysisStudy;
}) {
  const result = study.result;
  const input = study.input;
  const isDetails = route.endsWith("/details");
  const isMap = route.endsWith("/map");
  const isRecommendations = route.endsWith("/recommendations");
  const isReport = route.endsWith("/report") || route.endsWith("/print");
  const activeView: ReportView | "report" = isDetails ? "details" : isMap ? "map" : isRecommendations ? "recommendations" : isReport ? "report" : "overview";

  const location = asRecord(snapshot?.location);
  const latitude = typeof location?.latitude === "number" ? location.latitude : input?.latitude;
  const longitude = typeof location?.longitude === "number" ? location.longitude : input?.longitude;
  const population = readMetric(snapshot?.population);
  const purchasingPower = readMetric(snapshot?.purchasingPower);
  const inflation = readMetric(snapshot?.costInflation);
  const competitors = readCompetitors(snapshot?.competitors);
  const sources = readSources(snapshot?.sources);
  const limitations = readLimitations(snapshot?.limitations);
  const recommendations = (result?.recommendations ?? [])
    .map((code) => resultRecommendations[code])
    .filter((item): item is readonly [string, string] => Boolean(item));
  const cityName = input ? (cityLabels[input.city] ? t(ar, ...cityLabels[input.city]) : input.city) : "—";
  const locationLabel = typeof location?.label === "string" ? location.label : undefined;
  const completeness = result?.evidenceCompleteness ?? 0;

  const summary: Array<{ icon: IconName; label: string; value: string; wide?: boolean }> = [
    { icon: "lightbulb", label: t(ar, "فكرة المشروع", "Project idea"), value: input?.idea ?? project.name, wide: true },
    { icon: "grid", label: t(ar, "القطاع", "Sector"), value: project.sector ?? t(ar, "غير محدد", "Not specified") },
    { icon: "mapPin", label: t(ar, "الموقع", "Location"), value: cityName },
    { icon: "wallet", label: t(ar, "رأس المال", "Capital"), value: input?.budgetRange && budgetLabels[input.budgetRange] ? t(ar, ...budgetLabels[input.budgetRange]) : t(ar, "غير محدد", "Not specified") },
    { icon: "people", label: t(ar, "الفئة المستهدفة", "Target audience"), value: input && audienceLabels[input.targetAudience] ? t(ar, ...audienceLabels[input.targetAudience]) : input?.targetAudience ?? "—" },
  ];

  let main: ReactNode;
  if (!result) {
    main = (
      <div className="pa-center is-card" data-testid="analysis-result">
        <Icon name="activity" />
        <h2>{t(ar, "لم يكتمل التحليل بعد", "Analysis is not complete yet")}</h2>
        <p>{study.status === "FAILED" ? study.error ?? t(ar, "تعذر إكمال التحليل.", "The analysis could not be completed.") : t(ar, "أكمل مرحلة المعالجة قبل فتح النتائج والتقرير.", "Complete the processing stage before opening results and reports.")}</p>
        <Link className="pa-btn is-primary" href={`/projects/analysis/progress?project=${project.id}`}>{t(ar, "العودة إلى المعالجة", "Return to processing")}</Link>
      </div>
    );
  } else {
    const kpis = (
      <div className="pa-kpis">
        <Metric icon="people" label={t(ar, "عدد السكان", "Population")} note={`${t(ar, "على مستوى الدولة", "Country level")}${population.period ? ` · ${population.period}` : ""}`} value={formatNumber(population.value, locale, 0)} />
        <Metric icon="wallet" label={t(ar, "القوة الشرائية", "Purchasing power")} note={purchasingPower.value === null ? t(ar, "مؤشر البنك الدولي", "World Bank indicator") : `${formatNumber(purchasingPower.value, locale, 0)}${purchasingPower.period ? ` · ${purchasingPower.period}` : ""}`} tone={result.purchasingPowerLevel} value={levelLabel(result.purchasingPowerLevel, ar)} />
        <Metric icon="trend" label={t(ar, "تضخم التكلفة", "Cost inflation")} note={inflation.period ?? t(ar, "الفترة غير متاحة", "Period unavailable")} value={inflation.value === null ? t(ar, "غير متاح", "Unavailable") : `${formatNumber(inflation.value, locale)}%`} />
        <Metric icon="grid" label={t(ar, "المنافسون القريبون", "Nearby competitors")} note={levelLabel(result.competitionLevel, ar)} tone={result.competitionLevel} value={result.competitorCount === null ? t(ar, "غير متاح", "Unavailable") : String(result.competitorCount)} />
        <Metric icon="check" label={t(ar, "اكتمال الأدلة", "Evidence complete")} note={t(ar, "ليس مقياسًا لفرصة النجاح", "Not a success probability")} value={`${completeness}%`} />
        <Metric icon="shield" label={t(ar, "مخاطر البيانات", "Data risk")} note={t(ar, `${result.limitationCount} قيدًا مسجلًا`, `${result.limitationCount} recorded limits`)} tone={result.dataRiskLevel} value={levelLabel(result.dataRiskLevel, ar, false)} />
      </div>
    );
    const checks = evidenceChecks(snapshot, result);
    const ring = (
      <Panel icon="activity" title={t(ar, "اكتمال الأدلة", "Evidence completeness")}>
        <div className="pa-ring" style={{ "--pa-score": `${completeness * 3.6}deg` } as CSSProperties}><span><b>{completeness}%</b><small>{t(ar, "اكتمال الأدلة", "Evidence complete")}</small></span></div>
        <ul className="pa-checks">
          {checks.map((check) => <li className={check.met ? "is-met" : undefined} key={check.id}><Icon name={check.met ? "check" : "x"} /><span>{t(ar, ...check.label)}</span><em>{check.weight}%</em></li>)}
        </ul>
      </Panel>
    );
    const recsPanel = (
      <Panel icon="rocket" title={t(ar, "أهم التوصيات", "Key recommendations")}>
        <ol className="pa-recs">
          {recommendations.map((item, index) => <li key={item[0]}><span>{index + 1}</span><p>{t(ar, ...item)}</p></li>)}
        </ol>
      </Panel>
    );
    const limitsPanel = (
      <Panel icon="shield" title={t(ar, "المصادر والقيود", "Sources and limits")}>
        <div className="pa-sources">
          {sources.map((source, index) => (
            <span key={`${source.source}-${index}`}>
              <Icon name="check" /><b>{source.source ?? t(ar, "مصدر", "Source")}</b><small>{source.confidence ? levelLabel(source.confidence, ar) : "—"}</small>
              {source.url ? <a aria-label={t(ar, "فتح المصدر", "Open source")} href={source.url} rel="noreferrer" target="_blank"><Icon name="link" /></a> : null}
            </span>
          ))}
        </div>
        {limitations.length ? <ul className="pa-limits">{limitations.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="pa-muted">{t(ar, "لا توجد قيود إضافية مسجلة.", "No additional limitations are recorded.")}</p>}
      </Panel>
    );
    const mapPanel = (
      <Panel className="pa-panel--map" icon="mapPin" title={t(ar, "الموقع والمنافسون", "Location and competitors")}>
        <LocationMap ar={ar} competitors={competitors} latitude={latitude} longitude={longitude} />
        <p className="pa-map-caption"><Icon name="mapPin" />{locationLabel ?? cityName}<b>{competitors.length ? t(ar, `${competitors.length} منافسًا مرصودًا`, `${competitors.length} competitors observed`) : t(ar, "لم يُرصد منافسون — وهذا ليس دليلًا على غياب المنافسة", "No competitors observed — not evidence of no competition")}</b></p>
      </Panel>
    );

    if (isDetails) {
      main = (
        <div className="pa-view" data-testid="analysis-details">
          {kpis}
          <div className="pa-view__cols is-details">
            <Panel icon="grid" title={t(ar, "المنافسون المرصودون", "Observed competitors")}>
              <div className="pa-table-scroll">
                <table>
                  <thead><tr><th>#</th><th>{t(ar, "الاسم", "Name")}</th><th>{t(ar, "النوع", "Kind")}</th><th>{t(ar, "المسافة", "Distance")}</th></tr></thead>
                  <tbody>
                    {competitors.length ? competitors.map((competitor, index) => <tr key={competitor.id ?? `${competitor.name}-${index}`}><td>{index + 1}</td><td>{competitor.name ?? t(ar, "دون اسم", "Unnamed")}</td><td>{competitor.kind ?? t(ar, "غير مصنف", "Unclassified")}</td><td>{competitor.distanceKm === null || competitor.distanceKm === undefined ? t(ar, "غير متاحة", "Unavailable") : `${formatNumber(competitor.distanceKm, locale)} km`}</td></tr>) : <tr><td colSpan={4}>{t(ar, "لا توجد بيانات منافسين متاحة من المصدر الحالي.", "No competitor data is available from the current source.")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
            {limitsPanel}
          </div>
        </div>
      );
    } else if (isMap) {
      main = (
        <div className="pa-view" data-testid="analysis-map">
          <div className="pa-view__cols is-map">
            {mapPanel}
            <Panel icon="grid" title={t(ar, "المنافسون القريبون", "Nearby competitors")}>
              <ol className="pa-competitors">
                {competitors.length ? competitors.slice(0, 30).map((competitor, index) => <li key={competitor.id ?? `${competitor.name}-${index}`}><span>{index + 1}</span><b>{competitor.name ?? t(ar, "دون اسم", "Unnamed")}</b><small>{competitor.kind ?? "—"}</small></li>) : <li className="pa-muted">{t(ar, "لا توجد بيانات منافسين متاحة.", "No competitor data is available.")}</li>}
              </ol>
            </Panel>
          </div>
        </div>
      );
    } else if (isRecommendations) {
      main = (
        <div className="pa-view" data-testid="analysis-recommendations">
          <div className="pa-view__cols is-recs">
            {recsPanel}
            {limitsPanel}
            <Panel icon="rocket" title={t(ar, "الخطوة التالية", "Next step")}>
              <p className="pa-muted">{completeness >= 70 ? t(ar, "تغطية الأدلة تسمح بالانتقال إلى دراسة جدوى تفصيلية مع مراجعة حدود البيانات قبل القرار.", "Evidence coverage supports moving to a detailed feasibility study, after reviewing the data limits.") : t(ar, "تغطية الأدلة غير كافية لقرار نهائي. أغلق فجوات المصادر ثم أعد التحليل.", "Evidence coverage is not sufficient for a final decision. Close the source gaps and rerun the analysis.")}</p>
              <div className="pa-next">
                <Link className="pa-btn is-primary" href="/projects/feasibility"><Icon name="pieChart" />{t(ar, "إعداد دراسة جدوى", "Prepare feasibility study")}</Link>
                <Link className="pa-btn is-outline" href="/projects/analysis"><Icon name="plus" />{t(ar, "تحليل جديد", "New analysis")}</Link>
              </div>
            </Panel>
          </div>
        </div>
      );
    } else {
      main = (
        <div className="pa-view" data-testid={isReport ? "analysis-report" : "analysis-result"}>
          {kpis}
          <div className="pa-view__cols is-overview">
            {mapPanel}
            {ring}
            {recsPanel}
            {limitsPanel}
          </div>
        </div>
      );
    }
  }

  return (
    <section className="pa-report">
      <header className="pa-report__head">
        <div>
          <nav aria-label={t(ar, "مسار الصفحة", "Breadcrumb")} className="pa-entry__crumbs">
            <Link href="/projects">{t(ar, "المشاريع والاستثمار", "Projects and investment")}</Link>
            <Icon name="chevron" />
            <Link href="/projects/analysis">{t(ar, "تحليل المشاريع", "Project analysis")}</Link>
          </nav>
          <h1>{ar ? <>تقرير تحليل <b>المشروع</b></> : <>Project analysis <b>report</b></>}</h1>
          <p>{project.name}</p>
        </div>
        <div className="pa-report__meta">
          {result ? <span className="pa-badge"><Icon name="check" /><b>{t(ar, "تم التحليل بنجاح", "Analysis complete")}</b><small>{formatDate(result.generatedAt || study.updatedAt, locale)}</small></span> : null}
          <label className="pa-project-select">
            <span>{t(ar, "المشروع", "Project")}</span>
            <select onChange={(event) => onChangeProject(event.target.value)} value={project.id}>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="pa-summary">
        {summary.map((item) => (
          <div className={item.wide ? "is-wide" : undefined} key={item.label}><Icon name={item.icon} /><span><small>{item.label}</small><b>{item.value}</b></span></div>
        ))}
        <div className="pa-summary__actions">
          <button className="pa-btn is-primary" data-testid="analysis-export-open" disabled={!result} onClick={onExport} type="button"><Icon name="briefcase" />{t(ar, "طباعة التقرير", "Print report")}</button>
          {result ? <a className="pa-btn is-outline" href={`/api/projects/${project.id}/report`}><Icon name="fileText" />PDF</a> : null}
        </div>
      </div>

      <nav aria-label={t(ar, "أقسام التقرير", "Report sections")} className="pa-stage-navigation">
        {TABS.map((tab) => (
          <Link className={tab.view === activeView ? "is-active" : undefined} href={`${tab.path}?project=${project.id}`} key={tab.path}>
            <Icon name={tab.icon} />{t(ar, ...tab.label)}
          </Link>
        ))}
      </nav>

      {message ? <p className="pa-global-message" role="alert">{message}</p> : null}
      <AnalysisNotices ar={ar} study={study} />
      {main}
    </section>
  );
}
