"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnalysisReportView } from "@/components/projects/analysis-report-view";
import { AnalysisFailed, AnalysisProgress, AnalysisReady } from "@/components/projects/project-analysis-dialogs";
import { AnalysisStage } from "@/components/projects/project-analysis-stage";
import { FlowModal } from "@/components/projects/project-flow-kit";
import { fetchAnalysisProject, reloadTerminalAnalysisProject, startAnalysisRun, useAnalysisProgress } from "@/components/projects/use-analysis-progress";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon } from "@/components/ui/icons";
import { AnalysisRequestError, analysisFailureMessage, analysisSignInHref, analysisStoppedMessage } from "@/lib/projects/analysis-errors";
import { buildReport } from "@/lib/projects/analysis-report";
import { analysisReportIsCurrent, completedStages, readStudy, t, type AnalysisProject, type IntelligenceSnapshot } from "@/lib/projects/analysis-study";
import type { ProjectFlowDefinition } from "@/lib/projects/project-flow-routes";
import type { Locale } from "@/types/i18n";

async function listProjects(signal?: AbortSignal) {
  const response = await fetch("/api/projects?limit=100&offset=0", { cache: "no-store", signal });
  const payload = (await response.json().catch(() => null)) as { projects?: AnalysisProject[]; success?: boolean } | null;
  if (!response.ok || !payload?.success || !payload.projects) throw new AnalysisRequestError(response.status);
  return payload.projects;
}

const REPORT_TEST_IDS: Record<string, string> = {
  details: "analysis-details",
  map: "analysis-map",
  recommendations: "analysis-recommendations",
  report: "analysis-report",
  print: "analysis-export",
};

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
  const requestedRunId = searchParams.get("run") ?? "";
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [statusClosed, setStatusClosed] = useState(false);
  const [failure, setFailure] = useState<unknown>();
  const [pollVersion, setPollVersion] = useState(0);
  const reloaded = useRef("");
  const submitting = useRef(false);
  const requestController = useRef<AbortController | null>(null);

  const loadProjects = useCallback(async (signal?: AbortSignal) => {
    try {
      // A requested project is authoritative, even when it is older than the first page.
      const result = requestedProjectId ? [await fetchAnalysisProject(requestedProjectId, signal)] : await listProjects(signal);
      if (signal?.aborted) return;
      setProjects(result);
      setSelectedId((current) => {
        if (current && result.some((project) => project.id === current)) return current;
        if (requestedProjectId) return requestedProjectId;
        // Without a chosen project the report shows the latest finished one.
        const finished = result.find((project) => readStudy(project.analysisStudy).status === "COMPLETED");
        return (finished ?? result[0])?.id ?? "";
      });
      setMessage("");
      setFailure(undefined);
    } catch (error) {
      if (signal?.aborted) return;
      setProjects([]);
      setFailure(error);
      setMessage(analysisFailureMessage(error, ar));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [ar, requestedProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadProjects(controller.signal), 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [loadProjects]);
  useEffect(() => () => requestController.current?.abort(), []);

  const selected = useMemo(() => projects.find((project) => project.id === selectedId), [projects, selectedId]);
  const selectedProjectId = selected?.id;
  const study = useMemo(() => readStudy(selected?.analysisStudy), [selected?.analysisStudy]);
  const snapshot: IntelligenceSnapshot | undefined = selected?.intelligenceSnapshots?.[0];
  const isProgress = route.endsWith("/progress");
  const progress = useAnalysisProgress(selected?.id ?? null, Boolean(selected) && (isProgress || study.status === "PENDING" || study.status === "PROCESSING" || Boolean(requestedRunId && requestedRunId !== study.runId)), pollVersion);
  const status = progress.status ?? (requestedRunId && requestedRunId !== study.runId ? "PENDING" : study.status);
  const reportReady = analysisReportIsCurrent(study, status, progress.runId ?? (requestedRunId || undefined));
  const progressError = progress.error ?? failure;
  const stopped = progress.stopped || Boolean(failure);
  const returnPath = `${route}?${searchParams.toString()}`;
  const signIn = progressError instanceof AnalysisRequestError && progressError.status === 401;

  useEffect(() => {
    if (!selected || !progress.runId || searchParams.get("run") === progress.runId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", selected.id);
    params.set("run", progress.runId);
    router.replace(`${route}?${params}`, { scroll: false });
  }, [progress.runId, route, router, searchParams, selected]);

  useEffect(() => {
    if (!selectedProjectId) return;
    return reloadTerminalAnalysisProject(selectedProjectId, {
      known: true, status: progress.status, runId: progress.runId, updatedAt: progress.updatedAt,
    }, reloaded, (project) => {
      setProjects((current) => current.map((item) => item.id === project.id ? project : item));
    }, (error) => {
      setFailure(error);
      setMessage(analysisFailureMessage(error, ar));
    });
  }, [ar, progress.runId, progress.status, progress.updatedAt, selectedProjectId]);

  const runAnalysis = useCallback(async () => {
    if (!selected || submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    requestController.current = controller;
    setRunning(true);
    setMessage("");
    setFailure(undefined);
    try {
      const run = await startAnalysisRun(selected.id, controller.signal);
      if (controller.signal.aborted) return;
      router.replace(`/projects/analysis/${run.status === "COMPLETED" ? "result" : "progress"}?project=${encodeURIComponent(selected.id)}${run.runId ? `&run=${encodeURIComponent(run.runId)}` : ""}`, { scroll: false });
      setPollVersion((version) => version + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(error);
      setMessage(analysisFailureMessage(error, ar));
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) setRunning(false);
    }
  }, [ar, router, selected]);

  const model = useMemo(
    () => (selected ? buildReport({ project: { id: selected.id, name: selected.name, sector: selected.sector, countryCode: selected.countryCode }, study, snapshot }, locale) : null),
    [locale, selected, snapshot, study],
  );

  let body: ReactNode = null;
  if (loading) {
    body = <div className="pa-center"><Icon name="activity" />{t(ar, "جارٍ تحميل مساحة التحليل...", "Loading analysis workspace...")}</div>;
  } else if ((message && !selected) || (!isProgress && (progress.stopped || signIn))) {
    body = <div className="pa-center is-card" role="alert"><Icon name="warning" /><p>{message || analysisFailureMessage(progressError, ar)}</p>{signIn ? <Link className="pa-btn is-primary" href={analysisSignInHref(returnPath)}>{t(ar, "تسجيل الدخول", "Sign in")}</Link> : <Link className="pa-btn is-primary" href="/projects/analysis">{t(ar, "العودة للتحليل", "Back to analysis")}</Link>}</div>;
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
    const missingResult = status === "COMPLETED" && study.status === "COMPLETED" && !study.result;
    const state = !running && reportReady && !failure ? "done" : stopped || (!running && (status === "FAILED" || missingResult)) ? "failed" : "running";
    const known = progress.known || Boolean(study.stage);
    const completed = completedStages(progress.stage ?? study.stage, status);
    body = (
      <>
        <AnalysisStage ar={ar} reportHref={reportReady ? `/projects/analysis/result?project=${selected.id}` : undefined} testId="analysis-progress" />
        {statusClosed ? null : (
          <FlowModal ar={ar} className="af-modal" closable={state !== "running"} onClose={() => setStatusClosed(true)} step={state}>
            <div className="af-step" key={state}>
              {state === "running" ? <><AnalysisProgress ar={ar} completed={completed} known={known} pending={status === "PENDING"} />{progress.error ? <p role="status">{analysisFailureMessage(progress.error, ar)}</p> : null}{status === "PENDING" && progress.known && !progress.runId && !running ? <button className="af-primary" onClick={() => void runAnalysis()} type="button">{t(ar, "بدء التحليل", "Start analysis")}</button> : null}</> : null}
              {state === "done" ? <AnalysisReady ar={ar} onOpen={() => router.push(`/projects/analysis/result?project=${selected.id}`)} /> : null}
              {state === "failed" ? <AnalysisFailed ar={ar} message={progress.error ? analysisFailureMessage(progress.error, ar) : message || analysisStoppedMessage(ar)} retryAfterMs={progressError instanceof AnalysisRequestError ? progressError.retryAfterMs : undefined} retryDisabled={(progress.retryable ?? study.retryable) === false || (progressError instanceof AnalysisRequestError && progressError.status === 404)} signInHref={signIn ? analysisSignInHref(returnPath) : undefined} onRetry={() => { if (progress.stopped && progress.error) { setFailure(undefined); setPollVersion((version) => version + 1); } else void runAnalysis(); }} onReview={() => router.push("/projects/analysis")} /> : null}
            </div>
          </FlowModal>
        )}
      </>
    );
  } else if (selected && model) {
    // The map and market pages work from the saved location data even before an analysis result exists.
    const partial = Boolean(snapshot) && !study.runId && !requestedRunId && status === "PENDING" && (route.endsWith("/map") || route.endsWith("/details"));
    if (!reportReady && !partial) {
      body = (
        <div className="pa-center is-card" data-testid="analysis-result">
          <Icon name="activity" />
          <h2>{t(ar, "لم يكتمل التحليل بعد", "Analysis is not complete yet")}</h2>
          <p>{status === "FAILED" ? analysisStoppedMessage(ar) : t(ar, "أكمل مرحلة المعالجة قبل فتح النتائج والتقرير.", "Complete the processing stage before opening results and reports.")}</p>
          <Link className="pa-btn is-primary" href={`/projects/analysis/progress?project=${selected.id}${requestedRunId ? `&run=${encodeURIComponent(requestedRunId)}` : ""}`}>{t(ar, "العودة إلى المعالجة", "Return to processing")}</Link>
        </div>
      );
    } else {
      const segment = route.split("/").pop() ?? "";
      body = (
        <AnalysisReportView
          actions={{
            newHref: "/projects/analysis",
            pdfHref: `/api/projects/${selected.id}/analysis-report?locale=${locale}`,
            saveProjectId: selected.id,
            sharePath: `/projects/analysis/report?project=${selected.id}`,
          }}
          model={model}
          testId={REPORT_TEST_IDS[segment] ?? "analysis-result"}
        />
      );
    }
  } else if (message) {
    body = <div className="pa-center is-card" data-testid="analysis-result"><Icon name="warning" /><p>{message}</p></div>;
  }

  return (
    <main className={`project-analysis-workspace pa-entry ${isProgress ? "an-page" : "rp-page"}`} data-analysis-route={route} dir={ar ? "rtl" : "ltr"}>
      <JenanHeader locale={locale} userLabel={userLabel} />
      {body}
    </main>
  );
}
