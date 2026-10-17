"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnalysisReportView } from "@/components/projects/analysis-report-view";
import { AnalysisFailed, AnalysisProgress, AnalysisReady } from "@/components/projects/project-analysis-dialogs";
import { AnalysisStage } from "@/components/projects/project-analysis-stage";
import { FlowModal } from "@/components/projects/project-flow-kit";
import { useAnalysisProgress } from "@/components/projects/use-analysis-progress";
import { JenanHeader } from "@/components/shell/jenan-header";
import { Icon } from "@/components/ui/icons";
import { AnalysisRequestError, analysisFailureMessage, analysisStoppedMessage } from "@/lib/projects/analysis-errors";
import { buildReport } from "@/lib/projects/analysis-report";
import { completedStages, readStudy, t, type AnalysisProject, type IntelligenceSnapshot } from "@/lib/projects/analysis-study";
import type { ProjectFlowDefinition } from "@/lib/projects/project-flow-routes";
import type { Locale } from "@/types/i18n";

async function runRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { code?: string; success?: boolean } | null;
  if (!response.ok || !payload?.success) throw new AnalysisRequestError(response.status, payload?.code);
}

async function listProjects() {
  const response = await fetch("/api/projects?limit=100&offset=0", { cache: "no-store" });
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
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [selectedId, setSelectedId] = useState(requestedProjectId);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [statusClosed, setStatusClosed] = useState(false);
  const runGuard = useRef("");

  const loadProjects = useCallback(async () => {
    try {
      const result = await listProjects();
      setProjects(result);
      setSelectedId((current) => {
        if (current && result.some((project) => project.id === current)) return current;
        if (requestedProjectId && result.some((project) => project.id === requestedProjectId)) return requestedProjectId;
        // Without a chosen project the report shows the latest finished one.
        const finished = result.find((project) => readStudy(project.analysisStudy).status === "COMPLETED");
        return (finished ?? result[0])?.id ?? "";
      });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof AnalysisRequestError && error.status === 401 ? analysisFailureMessage(error, ar) : t(ar, "تعذر تحميل المشاريع الآن. أعد تحميل الصفحة بعد قليل.", "The projects could not be loaded right now. Reload the page shortly."));
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
  const working = running || study.status === "PROCESSING";
  const progress = useAnalysisProgress(selected?.id ?? null, isProgress && working);

  const runAnalysis = useCallback(async () => {
    if (!selected) return;
    setRunning(true);
    setMessage("");
    try {
      await runRequest({ action: "runProjectAnalysis", projectId: selected.id });
    } catch (error) {
      setMessage(analysisFailureMessage(error, ar));
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

  const model = useMemo(
    () => (selected ? buildReport({ project: { id: selected.id, name: selected.name, sector: selected.sector, countryCode: selected.countryCode }, study, snapshot }, locale) : null),
    [locale, selected, snapshot, study],
  );

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
    const known = progress.known || Boolean(study.stage);
    const completed = progress.known ? completedStages(progress.stage, progress.status) : completedStages(study.stage, study.status);
    body = (
      <>
        <AnalysisStage ar={ar} reportHref={study.status === "COMPLETED" ? `/projects/analysis/result?project=${selected.id}` : undefined} testId="analysis-progress" />
        {statusClosed ? null : (
          <FlowModal ar={ar} className="af-modal" closable={state !== "running"} onClose={() => setStatusClosed(true)} step={state}>
            <div className="af-step" key={state}>
              {state === "running" ? <AnalysisProgress ar={ar} completed={completed} known={known} /> : null}
              {state === "done" ? <AnalysisReady ar={ar} onOpen={() => router.push(`/projects/analysis/result?project=${selected.id}`)} /> : null}
              {state === "failed" ? <AnalysisFailed ar={ar} message={message || analysisStoppedMessage(ar)} onRetry={() => void runAnalysis()} onReview={() => router.push("/projects/analysis")} /> : null}
            </div>
          </FlowModal>
        )}
      </>
    );
  } else if (selected && model) {
    // The map and market pages work from the saved location data even before an analysis result exists.
    const partial = Boolean(snapshot) && (route.endsWith("/map") || route.endsWith("/details"));
    if (!study.result && !partial) {
      body = (
        <div className="pa-center is-card" data-testid="analysis-result">
          <Icon name="activity" />
          <h2>{t(ar, "لم يكتمل التحليل بعد", "Analysis is not complete yet")}</h2>
          <p>{study.status === "FAILED" ? analysisStoppedMessage(ar) : t(ar, "أكمل مرحلة المعالجة قبل فتح النتائج والتقرير.", "Complete the processing stage before opening results and reports.")}</p>
          <Link className="pa-btn is-primary" href={`/projects/analysis/progress?project=${selected.id}`}>{t(ar, "العودة إلى المعالجة", "Return to processing")}</Link>
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
