"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnalysisFailed, AnalysisProgress, AnalysisReady } from "@/components/projects/project-analysis-dialogs";
import { AnalysisStage } from "@/components/projects/project-analysis-stage";
import { FlowModal } from "@/components/projects/project-flow-kit";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon, type IconName } from "@/components/ui/icons";
import {
  asRecord,
  audienceLabels,
  cityLabels,
  formatDate,
  formatNumber,
  levelLabel,
  readCompetitors,
  readLimitations,
  readMetric,
  readStudy,
  resultRecommendations,
  t,
  type AnalysisProject,
  type AnalysisStudy,
  type IntelligenceSnapshot,
} from "@/lib/projects/analysis-study";
import { FLOW_SECTORS } from "@/lib/projects/flow-options";
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
  const payload = (await response.json().catch(() => null)) as { message?: string; result?: T; success?: boolean } | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.message ?? "Project request failed");
  return payload.result as T;
}

async function listProjects() {
  const response = await fetch("/api/projects?limit=100&offset=0", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { message?: string; projects?: AnalysisProject[]; success?: boolean } | null;
  if (!response.ok || !payload?.success || !payload.projects) throw new Error(payload?.message ?? "Projects could not be loaded");
  return payload.projects;
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
  const [statusClosed, setStatusClosed] = useState(false);
  const [percent, setPercent] = useState(50);
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
    setPercent(50);
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

  // The percent moves only while the long request is pending, and never past 92 until it is saved.
  const working = running || study.status === "PROCESSING";
  useEffect(() => {
    if (!isProgress || !working || percent >= 92) return;
    const timer = window.setTimeout(() => setPercent((value) => Math.min(92, value + 3)), 900);
    return () => window.clearTimeout(timer);
  }, [isProgress, percent, working]);

  function changeProject(projectId: string) {
    setSelectedId(projectId);
    setStatusClosed(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", projectId);
    router.push(`${route}?${params.toString()}`);
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
  } else if (selected && isProgress && !study.input) {
    body = (
      <div className="pa-center is-card" data-testid="analysis-progress">
        <Icon name="activity" />
        <h2>{t(ar, "لا توجد مدخلات تحليل محفوظة", "No analysis input is saved")}</h2>
        <p>{t(ar, "ابدأ التحليل بإدخال فكرة المشروع وتحديد موقعه.", "Start the analysis by entering the project idea and picking its location.")}</p>
        <Link className="pa-btn is-primary" href="/projects/analysis"><Icon name="barChart" />{t(ar, "ابدأ التحليل", "Start analysis")}</Link>
      </div>
    );
  } else if (selected && isProgress) {
    const state = study.status === "COMPLETED" ? "done" : study.status === "FAILED" || (message && !working) ? "failed" : "running";
    body = (
      <>
        <AnalysisStage ar={ar} reportHref={`/projects/analysis/result?project=${selected.id}`} testId="analysis-progress" />
        {statusClosed ? null : (
          <FlowModal ar={ar} className="an-modal" closable={state !== "running"} onClose={() => setStatusClosed(true)} size={state === "running" ? "large" : "status"} step={state}>
            {state === "running" ? <AnalysisProgress ar={ar} percent={percent} /> : null}
            {state === "done" ? <AnalysisReady ar={ar} onClose={() => setStatusClosed(true)} onOpen={() => router.push(`/projects/analysis/result?project=${selected.id}`)} /> : null}
            {state === "failed" ? <AnalysisFailed ar={ar} message={study.error ?? message} onRetry={() => void runAnalysis()} onReview={() => router.push("/projects/analysis")} /> : null}
          </FlowModal>
        )}
      </>
    );
  } else if (selected) {
    body = <ReportBoard ar={ar} locale={locale} message={message} onChangeProject={changeProject} project={selected} projects={projects} route={route} snapshot={snapshot} study={study} />;
  }

  return (
    <main className={`project-analysis-workspace pa-entry ${isProgress ? "an-page" : "an-page is-report"}`} data-analysis-route={route} dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />
      {body}
    </main>
  );
}

function Kpi({ bars, icon, label, note, tone, value }: { bars?: number[]; icon: IconName; label: string; note: string; tone?: string; value: string }) {
  return (
    <article className={`an-kpi${tone ? ` tone-${tone.toLowerCase()}` : ""}`}>
      <span className="an-kpi__icon"><Icon name={icon} /></span>
      <div><small>{label}</small><strong>{value}</strong><em>{note}</em></div>
      {bars ? <span aria-hidden="true" className="an-kpi__bars">{bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span> : null}
    </article>
  );
}

function Panel({ children, className, icon, title }: { children: ReactNode; className?: string; icon: IconName; title: string }) {
  return (
    <section className={`an-panel${className ? ` ${className}` : ""}`}>
      <header><Icon name={icon} /><h3>{title}</h3></header>
      <div className="an-panel__body">{children}</div>
    </section>
  );
}

function ReportBoard({
  ar,
  locale,
  message,
  onChangeProject,
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
  project: AnalysisProject;
  projects: AnalysisProject[];
  route: string;
  snapshot?: IntelligenceSnapshot;
  study: AnalysisStudy;
}) {
  const [shared, setShared] = useState("");
  const result = study.result;
  const input = study.input;
  const testId = route.endsWith("/details") ? "analysis-details" : route.endsWith("/map") ? "analysis-map" : route.endsWith("/recommendations") ? "analysis-recommendations" : route.endsWith("/report") ? "analysis-report" : route.endsWith("/print") ? "analysis-export" : "analysis-result";

  const location = asRecord(snapshot?.location);
  const latitude = typeof location?.latitude === "number" ? location.latitude : input?.latitude;
  const longitude = typeof location?.longitude === "number" ? location.longitude : input?.longitude;
  const population = readMetric(snapshot?.population);
  const purchasing = readMetric(snapshot?.purchasingPower);
  const inflation = readMetric(snapshot?.costInflation);
  const competitors = readCompetitors(snapshot?.competitors);
  const limitations = readLimitations(snapshot?.limitations);
  const recommendations = (result?.recommendations ?? []).map((code) => ({ code, text: resultRecommendations[code] })).filter((item): item is { code: string; text: readonly [string, string] } => Boolean(item.text));
  const cityName = input ? (cityLabels[input.city] ? t(ar, ...cityLabels[input.city]) : input.city) : "—";
  const placeName = input?.placeLabel ?? (typeof location?.label === "string" ? location.label : cityName);
  const sector = FLOW_SECTORS.find((item) => item.value === project.sector);
  const completeness = result?.evidenceCompleteness ?? 0;
  const quality = completeness >= 70 ? t(ar, "جيدة", "Good") : completeness >= 45 ? t(ar, "متوسطة", "Moderate") : t(ar, "منخفضة", "Low");
  const riskSteps = result?.dataRiskLevel === "HIGH" ? 3 : result?.dataRiskLevel === "MODERATE" ? 2 : 1;
  const competitorCount = result ? result.competitorCount : competitors.length ? competitors.length : null;
  const limitationCount = result?.limitationCount ?? limitations.length;
  const riskText = result ? levelLabel(result.dataRiskLevel, ar, false) : t(ar, "غير متاح", "Unavailable");
  const money = (value?: number) => (value === undefined ? t(ar, "غير محدد", "Not specified") : `${new Intl.NumberFormat(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 0 }).format(value)} ${t(ar, "ريال", "SAR")}`);

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/projects/analysis/report?project=${project.id}`);
      setShared(t(ar, "تم نسخ رابط التقرير.", "Report link copied."));
    } catch {
      setShared(t(ar, "تعذر نسخ الرابط. انسخه من شريط العنوان.", "The link could not be copied. Copy it from the address bar."));
    }
  }

  // The map and market pages work from the saved location data even before an analysis result exists.
  const partial = Boolean(snapshot) && (route.endsWith("/map") || route.endsWith("/details"));
  if (!result && !partial) {
    return (
      <div className="pa-center is-card" data-testid="analysis-result">
        <Icon name="activity" />
        <h2>{t(ar, "لم يكتمل التحليل بعد", "Analysis is not complete yet")}</h2>
        <p>{study.status === "FAILED" ? study.error ?? t(ar, "تعذر إكمال التحليل.", "The analysis could not be completed.") : t(ar, "أكمل مرحلة المعالجة قبل فتح النتائج والتقرير.", "Complete the processing stage before opening results and reports.")}</p>
        <Link className="pa-btn is-primary" href={`/projects/analysis/progress?project=${project.id}`}>{t(ar, "العودة إلى المعالجة", "Return to processing")}</Link>
      </div>
    );
  }

  return (
    <section className="an-report" data-testid={testId}>
      <header className="an-rhead">
        <div>
          <h1>{ar ? <>تقرير تحليل <b>المشروع</b></> : <>Project analysis <b>report</b></>}</h1>
          <p>{t(ar, "نتائج تحليل شاملة مبنية على الموقع، السوق، المنافسة، والقوة الشرائية", "A complete analysis built on location, market, competition and purchasing power")}</p>
        </div>
        <div className="an-rhead__side">
          <label className="an-select"><span>{t(ar, "المشروع", "Project")}</span>
            <select onChange={(event) => onChangeProject(event.target.value)} value={project.id}>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {result ? <span className="an-done"><span className="an-done__icon"><Icon name="check" /></span><span><b>{t(ar, "تم التحليل بنجاح", "Analysis complete")}</b><small>{formatDate(result.generatedAt || study.updatedAt, locale)}</small></span></span> : null}
        </div>
      </header>

      <div className="an-rsummary">
        <p className="is-wide"><Icon name="lightbulb" /><span><small>{t(ar, "فكرة المشروع", "Project idea")}</small><b>{input?.idea ?? project.name}</b></span></p>
        <p><Icon name="mapPin" /><span><small>{t(ar, "الموقع", "Location")}</small><b>{placeName}</b></span></p>
        <p><Icon name="wallet" /><span><small>{t(ar, "رأس المال المتوقع", "Expected capital")}</small><b>{money(input?.expectedCapital)}</b></span></p>
        <p><Icon name="people" /><span><small>{t(ar, "الفئة المستهدفة", "Target audience")}</small><b>{input && audienceLabels[input.targetAudience] ? t(ar, ...audienceLabels[input.targetAudience]) : "—"}</b></span></p>
        <p><Icon name="grid" /><span><small>{t(ar, "القطاع", "Sector")}</small><b>{sector ? t(ar, ...sector.label) : project.sector ?? t(ar, "غير محدد", "Not specified")}</b></span></p>
        <div className="an-rsummary__actions">
          <button className="an-act is-primary" data-testid="analysis-print" onClick={() => window.print()} type="button"><Icon name="printer" />{t(ar, "طباعة التقرير", "Print report")}</button>
          <a className="an-act" href={`/api/projects/${project.id}/report`}><Icon name="fileText" />{t(ar, "تصدير PDF", "Export PDF")}</a>
          <Link className="an-act" href="/projects/analysis"><Icon name="plus" />{t(ar, "تحليل جديد", "New analysis")}</Link>
        </div>
      </div>

      <h2 className="an-rtitle"><Icon name="barChart" />{t(ar, "المؤشرات الرئيسية للمشروع", "Key project indicators")}</h2>
      <div className="an-kpis">
        <Kpi bars={[40, 55, 50, 75, 90]} icon="people" label={t(ar, "عدد السكان", "Population")} note={`${t(ar, "على مستوى الدولة", "Country level")}${population.period ? ` · ${population.period}` : ""}`} value={formatNumber(population.value, locale, 0)} />
        <Kpi bars={[35, 60, 45, 80, 65]} icon="store" label={t(ar, "المنافسون", "Competitors")} note={t(ar, `مستوى المنافسة: ${levelLabel(result?.competitionLevel, ar)}`, `Competition: ${levelLabel(result?.competitionLevel, ar)}`)} tone={result?.competitionLevel} value={competitorCount === null ? t(ar, "غير متاح", "Unavailable") : String(competitorCount)} />
        <Kpi bars={[30, 45, 60, 70, 90]} icon="wallet" label={t(ar, "القوة الشرائية", "Purchasing power")} note={purchasing.value === null ? t(ar, "مؤشر البنك الدولي", "World Bank indicator") : `${formatNumber(purchasing.value, locale, 0)}${purchasing.period ? ` · ${purchasing.period}` : ""}`} tone={result?.purchasingPowerLevel} value={levelLabel(result?.purchasingPowerLevel, ar)} />
        <Kpi bars={[50, 40, 70, 55, 80]} icon="trend" label={t(ar, "تضخم التكلفة", "Cost inflation")} note={inflation.period ?? t(ar, "الفترة غير متاحة", "Period unavailable")} value={inflation.value === null ? t(ar, "غير متاح", "Unavailable") : `${formatNumber(inflation.value, locale)}%`} />
        <Kpi bars={[45, 60, 55, 75, 85]} icon="check" label={t(ar, "اكتمال الأدلة", "Evidence complete")} note={t(ar, "ليس مقياسًا لفرصة النجاح", "Not a success probability")} value={`${completeness}%`} />
        <Kpi bars={[80, 65, 55, 40, 30]} icon="shield" label={t(ar, "مخاطر البيانات", "Data risk")} note={t(ar, `${limitationCount} قيدًا مسجلًا`, `${limitationCount} recorded limits`)} tone={result?.dataRiskLevel} value={riskText} />
      </div>

      <div className="an-board">
        <Panel className="an-map" icon="mapPin" title={t(ar, "تحليل الموقع الجغرافي", "Geographic location analysis")}>
          {latitude !== undefined && longitude !== undefined ? (
            <ProjectLocationPicker
              center={{ latitude, longitude }}
              competitors={competitors.filter((item) => typeof item.latitude === "number" && typeof item.longitude === "number").map((item) => ({ name: item.name ?? t(ar, "دون اسم", "Unnamed"), category: item.kind ?? "—", latitude: item.latitude as number, longitude: item.longitude as number }))}
              label={t(ar, "خريطة الموقع والمنافسين", "Location and competitors map")}
              point={{ latitude, longitude }}
              zoom={14}
            />
          ) : <div className="pa-map-empty"><Icon name="globe" /><span>{t(ar, "تعذر تحديد الموقع على الخريطة", "The location could not be placed on the map")}</span></div>}
          <div className="an-map__badges">
            <span><Icon name="store" /><b>{t(ar, "المنافسون", "Competitors")}</b>{competitors.length ? t(ar, `${competitors.length} منشأة مرصودة`, `${competitors.length} venues mapped`) : t(ar, "لم يُرصد منافسون", "None observed")}</span>
            <span><Icon name="mapPin" /><b>{t(ar, "الموقع", "Location")}</b>{placeName}</span>
          </div>
        </Panel>

        <section className="an-panel an-score">
          <header><Icon name="activity" /><h3>{t(ar, "اكتمال أدلة التحليل", "Analysis evidence")}</h3></header>
          <div className="an-score__ring" style={{ "--pa-score": `${completeness * 3.6}deg` } as CSSProperties}><span><b>{completeness}%</b><small>{quality}</small></span></div>
          <p className="an-score__note"><Icon name="lightbulb" />{completeness >= 70 ? t(ar, "تغطية الأدلة جيدة بما يكفي للانتقال إلى دراسة جدوى تفصيلية، مع مراجعة حدود البيانات قبل القرار.", "Evidence coverage is good enough to proceed to a detailed feasibility study, after reviewing the data limits.") : t(ar, "تغطية الأدلة غير كافية لقرار نهائي. أغلق فجوات المصادر ثم أعد التحليل.", "Evidence coverage is not sufficient for a final decision. Close the source gaps and rerun the analysis.")}</p>
        </section>

        <div className="an-board__right">
          <Panel icon="rocket" title={t(ar, "أهم التوصيات", "Key recommendations")}>
            <ol className="an-recs">{recommendations.map((item, index) => <li key={item.code}><span>{index + 1}</span><p>{t(ar, ...item.text)}</p></li>)}</ol>
          </Panel>
          <Panel icon="trend" title={t(ar, "كيف تتميز عن المنافسين؟", "How to stand out from competitors?")}>
            <ul className="an-stand">
              {recommendations.some((item) => item.code === "DIFFERENTIATE_OFFER") ? <li><Icon name="check" /><p>{t(ar, ...resultRecommendations.DIFFERENTIATE_OFFER!)}</p></li> : null}
              {competitors.slice(0, 3).map((item, index) => <li key={`${item.name}-${index}`}><Icon name="store" /><p>{t(ar, "منافس قريب: ", "Nearby competitor: ")}{item.name ?? t(ar, "دون اسم", "Unnamed")}</p></li>)}
              {!competitors.length && !recommendations.some((item) => item.code === "DIFFERENTIATE_OFFER") ? <li className="is-empty"><p>{t(ar, "لا توجد بيانات منافسين متاحة من المصدر الحالي.", "No competitor data is available from the current source.")}</p></li> : null}
            </ul>
          </Panel>
          <Panel className="an-risks" icon="warning" title={t(ar, "المخاطر والتحديات", "Risks and challenges")}>
            <div className="an-risks__gauge"><small>{t(ar, "مستوى مخاطر البيانات", "Data-risk level")}</small><b>{riskText}</b><div aria-hidden="true">{[1, 2, 3].map((step) => <i className={step <= riskSteps ? "is-on" : undefined} key={step} />)}</div></div>
            {limitations.length ? <ul>{limitations.map((item) => <li key={item}><Icon name="warning" />{item}</li>)}</ul> : <p className="pa-muted">{t(ar, "لا توجد قيود إضافية مسجلة.", "No additional limitations are recorded.")}</p>}
          </Panel>
        </div>
      </div>

      {message ? <p className="pa-global-message" role="alert">{message}</p> : null}
      <AnalysisNotices ar={ar} study={study} />

      <footer className="an-rbar">
        <Link className="an-act" href="/user"><Icon name="database" />{t(ar, "حفظ في بياناتي", "Saved in My data")}</Link>
        <button className="an-act" onClick={() => void share()} type="button"><Icon name="share" />{t(ar, "مشاركة", "Share")}</button>
        <a className="an-act" href={`/api/projects/${project.id}/report`}><Icon name="fileText" />{t(ar, "تصدير PDF", "Export PDF")}</a>
        <button className="an-act is-primary" onClick={() => window.print()} type="button"><Icon name="printer" />{t(ar, "طباعة التقرير", "Print report")}</button>
        {shared ? <span className="an-rbar__msg" role="status">{shared}</span> : null}
      </footer>
    </section>
  );
}
